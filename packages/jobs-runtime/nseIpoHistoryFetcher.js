#!/usr/bin/env node
'use strict';

/**
 * nseIpoHistoryFetcher.js — builds `data/cache/nse-ipo-history.json`, a
 * per-symbol cache of NSE's own IPO bid-detail data
 * (`https://www.nseindia.com/api/ipo-detail`), keyed by NSE symbol.
 *
 * WHY THIS EXISTS (2026-08-09 decision, see
 * skills/equity-research/ipo-subscription-ranker/references/ipo_data_sources.md
 * for the full investigation): IPOPlatform's per-IPO granular category
 * breakdown only exists for IPOs listing on/after ~2025-09-24 (a confirmed
 * site-side data-availability ceiling — see ipoBacktest.js's header). NSE's
 * own `ipo-detail` API has no such ceiling — `public-past-issues` lists NSE
 * IPOs back to 2012 — so it is the only way to get a large enough granular
 * sample for the weight-finding algorithm (`ipoWeightFinder.js`) to be
 * statistically meaningful.
 *
 * SCOPE OF WHAT THIS SCRIPT DOES *NOT* DO (deliberate, per explicit
 * instruction): this is the SECONDARY/weight-finding use case only — the
 * PRIMARY use cases (ipo-subscription-ranker's bulk daily scan,
 * drhp-ipo-analysis's per-IPO report) rely on IPOPlatform, not this cache.
 * This script also does NOT reconcile the Market Maker quota out of
 * NII/bNII (the fix documented in ipo_data_sources.md for the primary path)
 * — for weight-finding, the goal is DIRECTIONAL correlation strength, which
 * is close to agnostic to a small, mostly-constant per-category bias like
 * MM inclusion; instead this script self-computes multiple = bid/offered
 * directly from NSE's own bidDetails offered/bid fields where NSE actually
 * populates the offered figure (reliably present for mainboard `EQ`-series
 * IPOs; frequently blank for SME `SME`-series IPOs, in which case that
 * category is simply left null rather than guessed at).
 *
 * SMART FETCHING (avoid getting blocked):
 *   - One cookie warm-up per script run (not per request), reused for every
 *     subsequent call.
 *   - Low, sequential-ish concurrency (default 2) with a randomized
 *     inter-request delay (350-700ms jitter) — NSE is known to rate-limit
 *     scrapers more aggressively than IPOPlatform.
 *   - Exponential backoff + retry (up to 3 attempts) on non-200 responses or
 *     on a response that LOOKS like NSE's block/"Resource not found" page
 *     (HTML instead of JSON) rather than a genuine empty result.
 *   - Resumable: already-cached symbols are skipped on a re-run unless
 *     --force is passed, so a long backfill can be safely split across many
 *     sequential invocations (the sandbox this runs in caps wall-clock time
 *     per call to ~150-180s regardless of --limit).
 *
 * Usage:
 *   node nseIpoHistoryFetcher.js [--limit N] [--concurrency 2] [--force]
 *                                 [--security-types EQ,SME,BE] [--status]
 */

const fs = require('fs');
const path = require('path');
const dbV2 = require('./lib/db');
const { mapWithConcurrency } = require('@stock/api/utils/concurrency');

const CACHE_FILE = 'nse-ipo-history.json';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const BASE_HEADERS = { 'User-Agent': UA, accept: 'application/json' };
const DEFAULT_SECURITY_TYPES = ['EQ', 'SME', 'BE'];

function argValue(argv, flag, def) {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(baseMs, spreadMs) {
  return baseMs + Math.floor(Math.random() * spreadMs);
}

function loadCache() {
  const p = dbV2.cachePath(CACHE_FILE);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { builtAt: null, bySymbol: {} };
  }
}

function saveCache(cache) {
  const p = dbV2.cachePath(CACHE_FILE);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cache, null, 2));
  return p;
}

async function warmCookies() {
  const res = await fetch('https://www.nseindia.com/market-data/all-upcoming-issues-ipo', {
    headers: BASE_HEADERS,
  });
  return res.headers.get('set-cookie') || '';
}

async function fetchWithRetry(url, cookie, { attempts = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { ...BASE_HEADERS, cookie } });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // NSE's block/error page is HTML starting with <!DOCTYPE — a genuine
      // API response is always JSON. Treat HTML as a soft failure to retry,
      // not a "this IPO has no data" result.
      if (text.trim().startsWith('<')) throw new Error('non-JSON response (likely blocked)');
      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await sleep(jitter(800 * (i + 1), 600));
    }
  }
  throw lastErr;
}

/** Fetches `public-past-issues` — the full NSE-listed IPO universe back to 2012. */
async function fetchPastIssues(cookie) {
  const j = await fetchWithRetry('https://www.nseindia.com/api/public-past-issues', cookie);
  return Array.isArray(j) ? j : [];
}

/** Self-computes multiple = bid/offered from NSE's own bidDetails, no external denominator. */
function parseNseBidDetails(bidDetails) {
  const bySr = {};
  for (const row of bidDetails || []) {
    if (row.srNo != null) bySr[String(row.srNo)] = row;
  }
  const computeX = (row) => {
    if (!row) return { x: null, offered: null, bid: null };
    const offered = parseFloat(row.noOfSharesOffered || row.noOfshareOffered || '0');
    const bid = parseFloat(row.noOfsharesBid || row.noOfshareBid || '0');
    const x = offered > 0 ? Math.round((bid / offered) * 10000) / 10000 : null;
    return { x, offered: offered || null, bid: Number.isFinite(bid) ? bid : null };
  };
  const qib = computeX(bySr['1']);
  const nii = computeX(bySr['2']);
  const bnii = computeX(bySr['2.1']);
  const snii = computeX(bySr['2.2']);
  const retail = computeX(bySr['3']);
  const employee = computeX(bySr['4']);
  const shareholder = computeX(bySr['5']);
  const totalRow = (bidDetails || []).find((r) => r.category === 'Total');
  const total = computeX(totalRow);
  return {
    qibX: qib.x,
    niiX: nii.x,
    bHniX: bnii.x,
    sHniX: snii.x,
    riiX: retail.x,
    employeeX: employee.x,
    shareholderX: shareholder.x,
    totalSubscriptionX: total.x,
    // Raw offered/bid kept for anyone who later wants to do the full MM
    // reconciliation (see ipo_data_sources.md) rather than accept the
    // directional-only numbers above.
    raw: { qib, nii, bnii, snii, retail, employee, shareholder, total },
  };
}

async function fetchOne(issue, cookie) {
  // securityType SME issues need series=SME (not EQ) or NSE silently drops
  // the retail category and mis-sums Total — confirmed live 2026-08-09
  // (see ipo_data_sources.md "series parameter matters" finding).
  const series = issue.securityType === 'SME' ? 'SME' : issue.securityType;
  const url = `https://www.nseindia.com/api/ipo-detail?symbol=${encodeURIComponent(issue.symbol)}&series=${encodeURIComponent(series)}`;
  const j = await fetchWithRetry(url, cookie);
  const bidDetails = j.bidDetails || [];
  const hasRealData = bidDetails.some(
    (r) => parseFloat(r.noOfsharesBid || r.noOfshareBid || '0') > 0
  );
  const parsed = hasRealData ? parseNseBidDetails(bidDetails) : null;
  return {
    symbol: issue.symbol,
    companyName: issue.company || issue.companyName,
    securityType: issue.securityType,
    listingDate: issue.listingDate,
    isin: j.metaInfo && j.metaInfo.isin,
    nseCompanyName: j.companyName,
    hasData: hasRealData,
    parsed,
    fetchedAt: new Date().toISOString(),
  };
}

// The sandbox this runs in caps wall-clock time per invocation to
// ~150-180s regardless of --limit (see ipoBacktest.js's "Errors and fixes"
// history for the same lesson learned the hard way there) — a long backfill
// WILL get killed mid-batch across sequential tool calls. Saving only once
// at the very end (the original design) meant a killed run lost 100% of its
// progress. Fixed by checkpointing every CHUNK_SIZE fetches instead, so a
// re-run after a timeout only has to redo the last partial chunk, not the
// whole thing.
const CHUNK_SIZE = 20;

async function build({ limit, concurrency, force, securityTypes }) {
  const cache = loadCache();
  const cookie = await warmCookies();
  const allIssues = await fetchPastIssues(cookie);
  const eligible = allIssues.filter((x) => securityTypes.includes(x.securityType) && x.symbol);
  const toFetch = (force ? eligible : eligible.filter((x) => !cache.bySymbol[x.symbol])).slice(
    0,
    limit || eligible.length
  );

  let fetched = 0;
  let failed = 0;
  for (let i = 0; i < toFetch.length; i += CHUNK_SIZE) {
    const chunk = toFetch.slice(i, i + CHUNK_SIZE);
    const results = await mapWithConcurrency(chunk, concurrency, async (issue) => {
      await sleep(jitter(350, 350));
      return fetchOne(issue, cookie);
    });
    for (const r of results) {
      if (r.ok) {
        cache.bySymbol[r.value.symbol] = r.value;
        fetched++;
      } else {
        failed++;
      }
    }
    cache.builtAt = new Date().toISOString();
    cache.totalUniverseSize = allIssues.length;
    cache.eligibleSecurityTypesSize = eligible.length;
    saveCache(cache); // checkpoint after every chunk, not just at the end
  }
  const savedPath = saveCache(cache);

  return {
    savedPath,
    universeSize: allIssues.length,
    eligibleSize: eligible.length,
    notAttemptedThisRun: eligible.length - toFetch.length,
    attemptedThisRun: toFetch.length,
    fetchedThisRun: fetched,
    failedThisRun: failed,
    totalCachedNow: Object.keys(cache.bySymbol).length,
  };
}

function status() {
  const cache = loadCache();
  const all = Object.values(cache.bySymbol);
  const withData = all.filter((x) => x.hasData && x.parsed);
  const withQib = withData.filter((x) => x.parsed.qibX != null);
  return {
    builtAt: cache.builtAt,
    totalUniverseSize: cache.totalUniverseSize,
    totalCached: all.length,
    withRealBidData: withData.length,
    withSelfComputedQibX: withQib.length,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--status')) {
    console.log(JSON.stringify(status(), null, 2));
    return;
  }
  const limitArg = argValue(argv, '--limit', null);
  const concurrency = parseInt(argValue(argv, '--concurrency', '2'), 10);
  const force = argv.includes('--force');
  const securityTypes = argValue(argv, '--security-types', DEFAULT_SECURITY_TYPES.join(',')).split(
    ','
  );

  const result = await build({
    limit: limitArg ? parseInt(limitArg, 10) : null,
    concurrency,
    force,
    securityTypes,
  });
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { build, status, loadCache, saveCache, parseNseBidDetails, fetchPastIssues };

if (require.main === module) {
  main().catch((e) => {
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
  });
}
