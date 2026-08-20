#!/usr/bin/env node
'use strict';

/**
 * verifyDealsDigest.js — post-run reconciliation check for dealsDigest.js
 * (task: daily-deals-digest). Companion to, not a replacement for, manual
 * spot-checks: this catches the SPECIFIC bug classes that silently dropped
 * or duplicated companies in the digest on 2026-07-30 (Novartis missing,
 * RMCL/Dr Lal Pathlabs/CCL Products/AQYLON duplicated, Geojit's ₹56.53cr
 * pledge-revoke dropped by a net-value-only threshold) — see dealsDigest.js
 * header comments and resolveCompanyIdentity() for the full history.
 *
 * This is deliberately a SCRIPT, not an LLM call: every check here is
 * arithmetic/lookup over data already fetched by dealsDigest.js (reads its
 * saved runs/digest_{date}.json — never re-fetches NSE/BSE) or over the
 * companyMaster.json cache. No judgment is required to run it; judgment is
 * only needed if it flags something, at which point a human (or an agent)
 * should look at the specific flagged company.
 *
 * Checks:
 *   1. Fetch errors surfaced by dealsDigest.js itself (NSE/BSE API failures).
 *   2. Duplicate identity: two groups in the same category resolving to the
 *      same canonical companyId/normalized-name key (would mean the
 *      cross-exchange dedup regressed — this exact bug hit RMCL/Lal
 *      Pathlabs/CCL Products/AQYLON on 2026-07-30, all now fixed).
 *   3. Never-filter watchlist companies present in the raw fetch but absent
 *      from every category's final output (the safety net meant to survive
 *      exactly this kind of drop failing to catch its own target).
 *   4. company-master.json staleness (Kite instruments dump not refreshed
 *      recently — stale mappings increase the odds of a future identity
 *      miss like Geojit's truncated-name mismatch).
 *   5. Zero-filings sanity check (insider/bulk/block/sast all empty on a
 *      trading day usually means an upstream fetch silently broke, not that
 *      nothing happened).
 *
 * Usage:
 *   node verifyDealsDigest.js [--date YYYY-MM-DD] [--stale-days N] [--env-file <path>]
 *
 * Exit code is always 0 (informational tool) — flags are reported in the
 * printed JSON and in `hasIssues`. Prints a short human-readable summary to
 * stderr and the full JSON report to stdout.
 */

const { loadEnv, argValue } = require('./lib/env');
const StorageService = require('@stock/cloud-utils').StorageService;
const { loadCompanyMaster, normalizeName: cmNormalizeName } = require('./lib/companyMaster');
const {
  resolveCompanyIdentity,
  getNeverFilterSymbols,
  parseDateArg,
  fmt,
} = require('./dealsDigest');

function istNow() {
  return new Date(Date.now() + (330 + new Date().getTimezoneOffset()) * 60000);
}

/** Re-resolve a saved top-N group's identity from its persisted symbol/companyName. */
function identityKeyForGroup(g) {
  const exampleDeal = (g.deals && g.deals[0]) || {};
  return resolveCompanyIdentity({
    symbol: g.symbol,
    company: exampleDeal.company || exampleDeal.name,
    companyName: g.companyName,
    exchange: exampleDeal.exchange,
  }).key;
}

/** Find any two groups within the same category array that resolve to the same identity. */
function findDuplicateIdentities(categoryLabel, groups) {
  const seen = new Map(); // key -> [symbols]
  for (const g of groups || []) {
    const key = identityKeyForGroup(g);
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(g.symbol);
  }
  const dupes = [];
  for (const [key, symbols] of seen) {
    if (symbols.length > 1) dupes.push({ category: categoryLabel, key, symbols });
  }
  return dupes;
}

/**
 * Companies that are on the never-filter watchlist AND appear in the raw
 * (pre-threshold) rows for a category, but are missing from that category's
 * final top-N output — the one thing the never-filter mechanism exists to
 * prevent (see dealsDigest.js NEVER_FILTER_WATCHLIST_ID comment, added after
 * the 28-Jul-2026 Gandhar Oil miss).
 */
function findNeverFilterMisses(rawRows, top10Groups, neverFilterSymbols) {
  if (!neverFilterSymbols.size) return [];
  const inRaw = new Set();
  for (const r of rawRows || []) {
    const identity = resolveCompanyIdentity({
      symbol: r.symbol,
      company: r.company || r.name,
      companyName: r.companyName,
      exchange: r.exchange,
    });
    const bareTicker = String(
      identity.nseTicker || identity.bseTicker || identity.displaySymbol || ''
    ).toUpperCase();
    if (neverFilterSymbols.has(bareTicker)) inRaw.add(bareTicker);
  }
  if (!inRaw.size) return [];

  const inOutput = new Set((top10Groups || []).map((g) => String(g.symbol || '').toUpperCase()));
  return [...inRaw].filter((sym) => !inOutput.has(sym));
}

async function main() {
  loadEnv(argValue('--env-file'));
  const dateArg = argValue('--date');
  const staleDays = Number(argValue('--stale-days')) || 5;
  const target = parseDateArg(dateArg) || istNow();
  const dateLabel = fmt(target, '-');

  StorageService.init();
  const isoDate = `${target.getFullYear()}${String(target.getMonth() + 1).padStart(2, '0')}${String(
    target.getDate()
  ).padStart(2, '0')}`;
  const jsonPath = `runs/digest_${isoDate}.json`;
  const digest = StorageService.readJson(jsonPath);

  const report = {
    date: dateLabel,
    snapshot: jsonPath,
    hasIssues: false,
    issues: [],
    info: {},
  };

  function flag(message, detail) {
    report.hasIssues = true;
    report.issues.push({ message, detail });
  }

  if (!digest) {
    flag(
      `No digest snapshot found at ${jsonPath} — dealsDigest.js may not have run for ${dateLabel} yet.`
    );
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  // 1. Fetch errors dealsDigest.js already recorded.
  const fetchErrors = [
    ...(digest.bulkBlock?.errors || []),
    ...(digest.sast?.errors || []),
    ...(digest.insider?.errors || []),
  ];
  if (fetchErrors.length) {
    flag('NSE/BSE fetch errors were recorded for this run', fetchErrors);
  }

  // 2. Duplicate identity within each category's final output.
  const categories = [
    ['bulk', digest.bulk10],
    ['block', digest.block10],
    ['sast', digest.sast10],
    ['insider', digest.insider10],
  ];
  let allDupes = [];
  for (const [label, groups] of categories) {
    allDupes = allDupes.concat(findDuplicateIdentities(label, groups));
  }
  if (allDupes.length) {
    flag(
      'Duplicate company identity found within a category — cross-exchange dedup may have regressed',
      allDupes
    );
  }

  // 3. Never-filter watchlist companies present in raw data but missing from output.
  let neverFilterSymbols = new Set();
  try {
    neverFilterSymbols = await getNeverFilterSymbols();
  } catch (e) {
    flag(`Could not fetch never-filter watchlist to check for misses: ${e.message}`);
  }
  const neverFilterMisses = [
    ...findNeverFilterMisses(digest.bulkBlock?.bulk, digest.bulk10, neverFilterSymbols),
    ...findNeverFilterMisses(digest.bulkBlock?.block, digest.block10, neverFilterSymbols),
    ...findNeverFilterMisses(digest.sast?.rows, digest.sast10, neverFilterSymbols),
    ...findNeverFilterMisses(digest.insider?.rows, digest.insider10, neverFilterSymbols),
  ];
  if (neverFilterMisses.length) {
    flag('Never-filter watchlist company present in raw fetch but missing from digest output', [
      ...new Set(neverFilterMisses),
    ]);
  }

  // 4. company-master.json staleness.
  try {
    const master = loadCompanyMaster();
    const ageDays = (Date.now() - new Date(master.generatedAt).getTime()) / 86400000;
    report.info.companyMasterAgeDays = Math.round(ageDays * 10) / 10;
    report.info.companyMasterGeneratedAt = master.generatedAt;
    if (ageDays > staleDays) {
      flag(
        `company-master.json is ${report.info.companyMasterAgeDays} days old (>${staleDays}) — run companyMasterSync.js to refresh NSE/BSE ticker mappings`
      );
    }
  } catch (e) {
    flag(`Could not check company-master.json freshness: ${e.message}`);
  }

  // 5. Zero-filings sanity check (all four categories empty is suspicious on
  // most trading days — doesn't fire on weekends/holidays where target date
  // itself has no trading, so treat as informational unless combined with
  // fetch errors above).
  const counts = {
    bulk: digest.bulkBlock?.bulk?.length || 0,
    block: digest.bulkBlock?.block?.length || 0,
    sast: digest.sast?.rows?.length || 0,
    insiderFilings: digest.insider?.totalFilings || 0,
  };
  report.info.rawCounts = counts;
  if (!counts.bulk && !counts.block && !counts.sast && !counts.insiderFilings) {
    flag(
      'All four categories (bulk/block/SAST/insider) returned zero raw rows — check whether this is a genuine non-trading day or an upstream fetch break'
    );
  }

  console.error(
    report.hasIssues
      ? `[verify-deals-digest] ${dateLabel}: ${report.issues.length} issue(s) flagged — see JSON for detail.`
      : `[verify-deals-digest] ${dateLabel}: OK — no issues found.`
  );
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (require.main === module) {
  main().catch((e) => {
    console.error('verifyDealsDigest failed:', e);
    process.exit(1);
  });
}

module.exports = { main, identityKeyForGroup, findDuplicateIdentities, findNeverFilterMisses };
