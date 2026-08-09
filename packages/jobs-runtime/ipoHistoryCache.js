#!/usr/bin/env node
'use strict';

/**
 * ipoHistoryCache.js — persists IPOPlatform's full historical IPO dataset to
 * `data/cache/ipo-history.json` so repeated backtest/weight-finding
 * experiments (ipoWeightFinder.js and friends) never have to re-hit the live
 * site. Pure Extraction (skills/_shared/conventions.md §17) — no judgment,
 * just fetch/parse/persist.
 *
 * Two tiers, reusing ipoBacktest.js's fetch/score helpers rather than
 * redefining them (conventions.md §17 — never think or write the same thing
 * twice):
 *
 *   Tier A — INDEX (cheap, full history, every run): pages through
 *   https://www.ipoplatform.com/main-board/index once from `--from` (default
 *   2000-01-01, i.e. everything) to today. A handful of seconds even for the
 *   entire ~2300+ IPO universe. Gives offer/listing/cmp prices, dates, Total
 *   Subscription, and (added 2026-08-09) issueSizeCr/marketCapCr.
 *
 *   Tier B — DETAIL (expensive, one fetch per IPO, only where it can
 *   possibly succeed): the per-IPO subscription detail page only carries the
 *   granular QIB/HNI/RII/Anchor breakdown for IPOs listing on/after
 *   DETAIL_CUTOVER_DATE (confirmed empirically in ipoBacktest.js's header —
 *   pages for older IPOs return HTTP 200 with a genuinely empty
 *   itemListElement, a site-data ceiling, not a parser bug). So this script
 *   never wastes a fetch on a pre-cutover IPO. Within the eligible window it:
 *     1. SEEDS from every already-persisted `ipo-scoring-backtest` report
 *        (data/reports/rpt_ipo-scoring-backtest_*.json, indexOnly:false) —
 *        those already paid the network cost this session; reusing them is
 *        the whole point of "so we don't have to make multiple API calls."
 *     2. Fetches only the NET-NEW eligible IPOs the seed didn't cover.
 *
 * Usage:
 *   node ipoHistoryCache.js [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 *                            [--ipo-type all|mainboard|sme]
 *                            [--refresh-detail] [--concurrency 8] [--limit N]
 *                            [--status]
 *
 *   (no flags)       Rebuild the index tier + seed the detail tier from
 *                     existing reports; does NOT hit the network for detail
 *                     pages beyond that seed.
 *   --refresh-detail  Also fetch detail pages for eligible IPOs the seed
 *                     didn't cover (net-new only — already-cached IPOs, seed
 *                     or fetched, are never re-fetched unless --force).
 *   --force           With --refresh-detail, re-fetch even already-cached
 *                     eligible IPOs (use if you suspect stale/partial data).
 *   --status          Print cache coverage stats and exit, no fetching.
 */

const fs = require('fs');
const path = require('path');
const dbV2 = require('./lib/db');
const {
  fetchPerformanceWindow,
  parseSubscriptionDetail,
  scoreRowFromIndexOnly,
} = require('./ipoBacktest');
const { mapWithConcurrency } = require('@stock/api/utils/concurrency');

const CACHE_FILE = 'ipo-history.json';
// Confirmed live 2026-08-09 (see ipoBacktest.js header) — granular category
// data does not exist on the site before this date, so never spend a fetch
// on an older IPO.
const DETAIL_CUTOVER_DATE = '2025-09-24';
const UA = 'Mozilla/5.0 (compatible; StockMarketResearchBot/1.0)';

function argValue(argv, flag, def) {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
}

function loadCache() {
  const p = dbV2.cachePath(CACHE_FILE);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { builtAt: null, byIpoPlatformId: {} };
  }
}

function saveCache(cache) {
  const p = dbV2.cachePath(CACHE_FILE);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cache, null, 2));
  return p;
}

/** Seed the detail tier from every already-persisted ipo-scoring-backtest report. */
function seedDetailFromExistingReports() {
  const reportsDir = path.join(dbV2.dataRoot(), 'reports');
  const seed = {};
  let filesScanned = 0;
  let recordsSeeded = 0;
  let files = [];
  try {
    files = fs.readdirSync(reportsDir).filter((f) => f.startsWith('rpt_ipo-scoring-backtest_'));
  } catch {
    return { seed, filesScanned, recordsSeeded };
  }
  for (const f of files) {
    let dto;
    try {
      dto = JSON.parse(fs.readFileSync(path.join(reportsDir, f), 'utf8'));
    } catch {
      continue;
    }
    filesScanned++;
    if (dto.indexOnly || !Array.isArray(dto.records)) continue;
    for (const r of dto.records) {
      if (!r.ipoPlatformId || !r.subscriptionDataParsed) continue;
      // Prefer a record that actually parsed a real category (not just an
      // empty-but-"parsed" page) if we see the same IPO more than once.
      const existing = seed[r.ipoPlatformId];
      const hasCategory = r.qibX != null || r.totalSubscriptionX != null;
      if (!existing || (hasCategory && existing.qibX == null && existing.totalSubscriptionX == null)) {
        seed[r.ipoPlatformId] = {
          qibX: r.qibX ?? null,
          sHniX: r.sHniX ?? null,
          bHniX: r.bHniX ?? null,
          niiX: r.niiX ?? null,
          riiX: r.riiX ?? null,
          employeeX: r.employeeX ?? null,
          shareholderX: r.shareholderX ?? null,
          totalSubscriptionX: r.totalSubscriptionX ?? null,
          anchorParticipated: !!r.anchorParticipated,
          subscriptionDataParsed: true,
          otherCategories: r.otherCategories || {},
          fetchError: null,
          detailSource: `seeded:${f}`,
        };
        recordsSeeded++;
      }
    }
  }
  return { seed, filesScanned, recordsSeeded };
}

async function fetchDetailFor(row) {
  const detailUrl = `https://www.ipoplatform.com/ipo/subscription/${row.chittorgarh_slug}/${row.id}`;
  try {
    const res = await fetch(detailUrl, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const sub = parseSubscriptionDetail(html);
    return {
      qibX: sub.qibX ?? null,
      sHniX: sub.sHniX ?? null,
      bHniX: sub.bHniX ?? null,
      niiX: sub.niiX ?? null,
      riiX: sub.riiX ?? null,
      employeeX: sub.employeeX ?? null,
      shareholderX: sub.shareholderX ?? null,
      totalSubscriptionX: sub.totalSubscriptionX ?? null,
      anchorParticipated: !!sub.anchorParticipated,
      subscriptionDataParsed: sub._parsed,
      otherCategories: sub.otherCategories,
      fetchError: null,
      detailSource: 'fetched',
    };
  } catch (e) {
    return {
      qibX: null,
      sHniX: null,
      bHniX: null,
      niiX: null,
      riiX: null,
      employeeX: null,
      shareholderX: null,
      totalSubscriptionX: null,
      anchorParticipated: false,
      subscriptionDataParsed: false,
      otherCategories: {},
      fetchError: String(e.message || e),
      detailSource: 'fetched',
    };
  }
}

async function build({ fromDate, toDate, ipoType, refreshDetail, force, concurrency, limit }) {
  const cache = loadCache();
  const universe = await fetchPerformanceWindow({ fromDate, toDate, ipoType });
  const rows = limit ? universe.slice(0, limit) : universe;

  const { seed, filesScanned, recordsSeeded } = seedDetailFromExistingReports();

  const eligibleForDetail = rows.filter((r) => (r.ipo_year || '') >= DETAIL_CUTOVER_DATE);
  const toFetch = refreshDetail
    ? eligibleForDetail.filter((r) => force || !(cache.byIpoPlatformId[r.id] && cache.byIpoPlatformId[r.id].detail))
    : [];

  let fetchedCount = 0;
  const fetchedDetail = {};
  if (toFetch.length) {
    const results = await mapWithConcurrency(toFetch, concurrency, async (row) => {
      // Reuse the seed if we have it and aren't forcing a re-fetch.
      if (!force && seed[row.id]) return { id: row.id, detail: seed[row.id] };
      const d = await fetchDetailFor(row);
      return { id: row.id, detail: d };
    });
    for (const r of results) {
      if (r.ok && r.value) {
        fetchedDetail[r.value.id] = r.value.detail;
        fetchedCount++;
      }
    }
  }

  const now = new Date().toISOString();
  for (const row of rows) {
    const indexRec = scoreRowFromIndexOnly(row, toDate);
    const existing = cache.byIpoPlatformId[row.id] || {};
    let detail = existing.detail || null;
    if (fetchedDetail[row.id]) {
      detail = fetchedDetail[row.id];
    } else if (!detail && seed[row.id]) {
      detail = seed[row.id];
    } else if (!detail && (row.ipo_year || '') < DETAIL_CUTOVER_DATE) {
      detail = { subscriptionDataParsed: false, preCutover: true, detailSource: 'skipped:pre-cutover' };
    }
    cache.byIpoPlatformId[row.id] = {
      ...indexRec,
      detail,
      cachedAt: now,
    };
  }
  cache.builtAt = now;
  cache.detailCutoverDate = DETAIL_CUTOVER_DATE;
  const savedPath = saveCache(cache);

  return {
    savedPath,
    universeSize: rows.length,
    totalCached: Object.keys(cache.byIpoPlatformId).length,
    seed: { filesScanned, recordsSeeded },
    eligibleForDetail: eligibleForDetail.length,
    detailFetchedThisRun: fetchedCount,
  };
}

function status() {
  const cache = loadCache();
  const all = Object.values(cache.byIpoPlatformId);
  const withDetail = all.filter((r) => r.detail && r.detail.subscriptionDataParsed && r.detail.qibX != null);
  const withTotalOnly = all.filter(
    (r) => r.detail && r.detail.subscriptionDataParsed && r.detail.qibX == null && r.totalSubscriptionX != null
  );
  const preCutover = all.filter((r) => r.detail && r.detail.preCutover);
  const withPerf = all.filter((r) => r.listingGainPct != null);
  const withIssueSize = all.filter((r) => r.issueSizeCr != null);
  const withMarketCap = all.filter((r) => r.marketCapCr != null);
  return {
    builtAt: cache.builtAt,
    detailCutoverDate: cache.detailCutoverDate,
    total: all.length,
    withGranularDetail: withDetail.length,
    withTotalSubscriptionOnly: withTotalOnly.length,
    preCutoverSkipped: preCutover.length,
    withPerformanceData: withPerf.length,
    withIssueSizeCr: withIssueSize.length,
    withMarketCapCr: withMarketCap.length,
    fullyEligibleForWeightFinding: all.filter(
      (r) => r.listingGainPct != null && r.detail && r.detail.qibX != null
    ).length,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--status')) {
    console.log(JSON.stringify(status(), null, 2));
    return;
  }
  const fromDate = argValue(argv, '--from', '2000-01-01');
  const toDate = argValue(argv, '--to', new Date().toISOString().slice(0, 10));
  const ipoType = argValue(argv, '--ipo-type', 'all');
  const concurrency = parseInt(argValue(argv, '--concurrency', '8'), 10);
  const limitArg = argValue(argv, '--limit', null);
  const refreshDetail = argv.includes('--refresh-detail');
  const force = argv.includes('--force');

  const result = await build({
    fromDate,
    toDate,
    ipoType,
    refreshDetail,
    force,
    concurrency,
    limit: limitArg ? parseInt(limitArg, 10) : null,
  });
  console.log(JSON.stringify(result, null, 2));
  console.log(JSON.stringify(status(), null, 2));
}

module.exports = { build, status, loadCache, saveCache, seedDetailFromExistingReports, DETAIL_CUTOVER_DATE };

if (require.main === module) {
  main().catch((e) => {
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
  });
}
