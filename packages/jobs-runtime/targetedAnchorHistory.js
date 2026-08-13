#!/usr/bin/env node
'use strict';

/**
 * targetedAnchorHistory.js — cheap variant of anchorBulkDealTracker.js scoped
 * to a small fixed watchlist of anchor investors (currently: Bank of India
 * Mutual Fund, Bengal Finance & Investment, Winro Commercial, Bharat Value
 * Fund, India Max Investment Fund, Cognizant Capital, IMAP India Capital —
 * Ardee Industries' anchor book, per user request to look up their history).
 *
 * Why a separate script rather than a flag on anchorBulkDealTracker.js: the
 * full tracker's dominant cost for a 10-year sweep isn't the deal-window
 * fetch (that's skippable when no target investor is present) — it's the
 * one Chittorgarh/IPOPlatform anchor-table fetch PER IPO, which is required
 * just to find out whether any of the 7 target names are even on the anchor
 * list. So this script still pays that cost for the full universe, but skips
 * everything else (subscription multiples, GMP, full deal-window fetch for
 * every anchor) for IPOs where none of the targets appear — cutting network
 * calls roughly in half versus running the full tracker unscoped, and
 * avoiding the O(anchors) fuzzy-match cost against the whole deal tape for
 * every anchor rather than just the ones we care about.
 *
 * conventions.md §17 — reuses fetchPerformanceWindow, fetchAnchorInvestors,
 * fetchDealsWindow, dealStance, normalizeInvestorName, bestMatch from the
 * existing modules rather than re-deriving any of them.
 *
 * Usage:
 *   node targetedAnchorHistory.js --from YYYY-MM-DD --to YYYY-MM-DD
 *     [--window N] [--concurrency 10] [--out <path>]
 */

const path = require('path');
const { nse, bse } = require('@stock/api');
const { mapWithConcurrency } = require('@stock/api/utils/concurrency');
const { argValue, loadEnv } = require('./lib/env');
const { fetchPerformanceWindow } = require('./ipoBacktest');
const { bestMatch, normalizeInvestorName } = require('./lib/fuzzyMatch');
const {
  fetchAnchorInvestors,
  fetchDealsWindow,
  dealStance,
} = require('./anchorBulkDealTracker');

// The 7 Ardee Industries anchors — matched against both the anchor's own
// name and its chittorgarh Group Entity (whichever is present), same
// containment-style check anchorBulkDealTracker.js's own cross-check uses.
const TARGET_INVESTORS = [
  'BANK OF INDIA MUTUAL FUND',
  'BENGAL FINANCE & INVESTMENT',
  'WINRO COMMERCIAL',
  'BHARAT VALUE FUND',
  'INDIA MAX INVESTMENT FUND',
  'COGNIZANT CAPITAL',
  'IMAP INDIA',
];
const TARGET_KEYS = TARGET_INVESTORS.map((t) => normalizeInvestorName(t).toLowerCase());

function matchesTarget(name) {
  const n = normalizeInvestorName(name || '').toLowerCase();
  if (!n) return null;
  for (let i = 0; i < TARGET_KEYS.length; i++) {
    const key = TARGET_KEYS[i];
    if (n.includes(key) || key.includes(n)) return TARGET_INVESTORS[i];
  }
  return null;
}

function ymdToUtcDate(ymd) {
  return new Date(`${ymd}T00:00:00Z`);
}
function addDays(d, n) {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}
function fmtYmd(d) {
  return d.toISOString().slice(0, 10);
}
function todayIstUtcDate() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60000);
  return new Date(`${ist.toISOString().slice(0, 10)}T00:00:00Z`);
}
function toINRNumber(text) {
  const cleaned = String(text || '').replace(/[₹,\s]/g, '');
  const v = parseFloat(cleaned);
  return Number.isFinite(v) ? v : null;
}

async function run({ fromYmd, toYmd, window = 2, concurrency = 10 } = {}) {
  const warnings = [];
  const nseClient = nse;
  const bseClient = bse;
  const today = todayIstUtcDate();

  const rawUniverse = await fetchPerformanceWindow({ fromDate: fromYmd, toDate: toYmd, ipoType: 'all' });
  const universe = rawUniverse
    .filter((row) => row.ipo_year && row.chittorgarh_slug && row.id)
    .map((row) => ({
      companyId: row.id,
      companyName: row.company_name,
      listingDate: row.ipo_year,
      nseSymbol: row.nse_script_symbol || null,
      bseScripCode: row.bse_script_code || null,
      detailUrl: `https://www.ipoplatform.com/ipo/${row.chittorgarh_slug}/${row.id}`,
      chittorgarhId: row.chittorgarh_id || null,
      chittorgarhSlugHint: row.chittorgarh_slug || null,
      listingGainPct: toINRNumber(row.listing_gain),
      cmpGainPct: toINRNumber(row.cmp_percentage),
    }));

  console.error(`[targetedAnchorHistory] ${universe.length} IPOs in window; fetching anchor tables...`);

  const anchorResults = await mapWithConcurrency(universe, concurrency, async (ipo) => {
    const { anchorInvestors } = await fetchAnchorInvestors(ipo);
    return anchorInvestors;
  });

  const hits = [];
  anchorResults.forEach((r, i) => {
    if (!r.ok) {
      warnings.push(`Anchor fetch failed for ${universe[i].companyName}: ${r.error.message}`);
      return;
    }
    const ipo = universe[i];
    for (const a of r.value) {
      const target = matchesTarget(a.name) || matchesTarget(a.groupEntity);
      if (target) hits.push({ ipo, anchor: a, target });
    }
  });

  console.error(`[targetedAnchorHistory] ${hits.length} anchor-instance hits across ${new Set(hits.map((h) => h.ipo.companyId)).size} IPOs; checking bulk/block deal reappearance...`);

  const byIpo = new Map();
  for (const h of hits) {
    if (!byIpo.has(h.ipo.companyId)) byIpo.set(h.ipo.companyId, { ipo: h.ipo, anchors: [] });
    byIpo.get(h.ipo.companyId).anchors.push(h);
  }
  const ipoGroups = Array.from(byIpo.values());

  const dealResults = await mapWithConcurrency(ipoGroups, concurrency, async (grp) => {
    const listingDate = ymdToUtcDate(grp.ipo.listingDate);
    const requestedEnd = addDays(listingDate, Math.max(0, window - 1));
    const windowEnd = requestedEnd > today ? today : requestedEnd;
    const dealsRows = await fetchDealsWindow(listingDate, windowEnd, { nseClient, bseClient, warnings: { add: (w) => warnings.push(w) } });
    const companyRows = dealsRows.filter((row) => {
      if (grp.ipo.nseSymbol && row.symbol && row.source.startsWith('nse')) {
        return row.symbol.toUpperCase() === grp.ipo.nseSymbol.toUpperCase();
      }
      if (grp.ipo.bseScripCode && row.symbol && row.source.startsWith('bse')) {
        return String(row.symbol) === String(grp.ipo.bseScripCode);
      }
      return false;
    });
    const clientNames = companyRows.map((r) => r.clientName).filter(Boolean);
    return grp.anchors.map((h) => {
      const byName = bestMatch(h.anchor.name, clientNames, 0.85);
      const byGroup = h.anchor.groupEntity ? bestMatch(h.anchor.groupEntity, clientNames, 0.85) : null;
      const match = byGroup && (!byName || byGroup.score > byName.score) ? byGroup : byName;
      const dealRow = match ? companyRows[match.index] : null;
      return {
        target: h.target,
        anchorName: h.anchor.name,
        anchorGroupEntity: h.anchor.groupEntity,
        company: grp.ipo.companyName,
        listingDate: grp.ipo.listingDate,
        listingGainPct: grp.ipo.listingGainPct,
        cmpGainPct: grp.ipo.cmpGainPct,
        stance: dealRow ? dealStance(dealRow.buySell) : 'no_reappearance',
        matchedDealClientName: dealRow ? dealRow.clientName : null,
        matchScore: match ? match.score : null,
        dealDate: dealRow ? dealRow.date : null,
      };
    });
  });

  const records = [];
  dealResults.forEach((r) => {
    if (r.ok) records.push(...r.value);
  });

  const byTarget = {};
  for (const t of TARGET_INVESTORS) byTarget[t] = { total: 0, supportive: 0, unsupportive: 0, noReappearance: 0, instances: [] };
  for (const rec of records) {
    const b = byTarget[rec.target];
    b.total++;
    if (rec.stance === 'supportive') b.supportive++;
    else if (rec.stance === 'unsupportive') b.unsupportive++;
    else b.noReappearance++;
    b.instances.push(rec);
  }

  return {
    id: `targeted-anchor-history_${fromYmd}_${toYmd}`,
    creator: 'targeted-anchor-history',
    creationTime: new Date().toISOString(),
    params: { fromYmd, toYmd, windowDays: window, targets: TARGET_INVESTORS },
    iposInWindow: universe.length,
    byTarget,
    warnings,
  };
}

async function main() {
  loadEnv(argValue('--env-file'));
  const fromYmd = argValue('--from');
  const toYmd = argValue('--to');
  if (!fromYmd || !toYmd) {
    console.error('Usage: node targetedAnchorHistory.js --from YYYY-MM-DD --to YYYY-MM-DD [--window N] [--concurrency 10] [--out <path>]');
    process.exit(1);
  }
  const window = parseInt(argValue('--window') || '2', 10);
  const concurrency = parseInt(argValue('--concurrency') || '10', 10);
  const outPath = argValue('--out');

  const dto = await run({ fromYmd, toYmd, window, concurrency });
  const json = JSON.stringify(dto, null, 2);
  if (outPath) {
    const fs = require('fs');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, json);
    console.error(`Wrote ${outPath}`);
  }
  console.log(json);
}

module.exports = { run, matchesTarget, TARGET_INVESTORS };

if (require.main === module) {
  main().catch((e) => {
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
  });
}
