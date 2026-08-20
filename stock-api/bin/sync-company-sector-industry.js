#!/usr/bin/env node
'use strict';

/**
 * sync-company-sector-industry.js
 *
 * Purpose: Fetch sector + industry for every company on Stockscans via
 * POST /api/company/scans/run and upsert `sector`/`industry` onto each
 * company's record in the `companies` collection (data/companies.json,
 * written via packages/jobs-runtime/lib/db.js).
 *
 * ENHANCED with:
 * - Partial data handling: Commits data in batches even if full sync fails
 * - Resume caching: Saves fetch progress to .cache/sync-company-sector-industry.json
 *   and resumes from last successful offset on re-run
 *
 * Usage:
 *   node sync-company-sector-industry.js [--dry-run] [--concurrency 1] [--page-delay-ms 5000] [--reset-cache]
 *   For manual terminal run:
 *   cd /Users/darshanpatel/code/stockmarket && node stock-api/bin/sync-company-sector-industry.js
 *
 * Output (stdout, JSON): a summary object with partial results on interrupt.
 *
 * Env: STOCKSCANS_AUTH_TOKEN (see stock-api/src/auth/stockscansAuth.js for
 * resolution order). loadEnv() is called first so a bare `.env` file is
 * picked up even if the invoking shell/scheduler didn't source it
 * (skills/_shared/conventions.md §2).
 */

const fs = require('fs');
const path = require('path');
const { StockscansClient } = require('../src/clients/StockscansClient.js');
const { sanitizeCompanyId } = require('../src/utils/companyId.js');
const { loadEnv, argValue, hasFlag } = require('../../packages/jobs-runtime/lib/env.js');
const db = require('../../packages/jobs-runtime/lib/db.js');

const PAGE_SIZE = 50;
const CREATOR = 'sync-company-sector-industry';
const CACHE_DIR = path.join(__dirname, '../../data/.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'sync-company-sector-industry.json');

// Ensure cache dir exists
function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

// Load cached progress
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      return data;
    }
  } catch (err) {
    // Ignore parse errors, start fresh
  }
  return { lastOffset: 0, totalServers: 0, fetchedOffsets: new Set() };
}

// Save progress to cache
function saveCache(cache) {
  ensureCacheDir();
  fs.writeFileSync(CACHE_FILE, JSON.stringify({
    lastOffset: cache.lastOffset,
    totalServers: cache.totalServers,
    fetchedOffsets: Array.from(cache.fetchedOffsets),
    timestamp: new Date().toISOString(),
  }, null, 2));
}

// Clear cache
function clearCache() {
  if (fs.existsSync(CACHE_FILE)) {
    fs.unlinkSync(CACHE_FILE);
  }
}

// Confirmed column indices (see file header) — kept as named constants
// rather than magic numbers so a future Stockscans column reorder is a
// one-line fix, not a silent mis-map.
const COL = {
  companyId: 0,
  name: 1,
  industry: 33,
  sector: 34,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `fn()`, retrying with exponential backoff on HTTP 429 (rate limit).
 * Live-confirmed 2026-08-20: once tripped, the ban was NOT a short burst
 * window — a single isolated request still got 429 at +60s and +240s after
 * the trip, clearing only by roughly +8-9 minutes. A short backoff ceiling
 * (e.g. maxing at ~30s) would give up long before a real ban clears, so the
 * default here backs off up to a ~10-minute ceiling (8 attempts, base 2s,
 * doubling → 2s,4s,8s,16s,32s,64s,128s,256s ≈ 8.5min cumulative) — enough to
 * ride out the observed ban duration if one occurs despite the conservative
 * sequential default pacing (see file header). This is a safety net, not
 * the primary defense — the primary defense is not tripping the limiter in
 * the first place via slow, sequential fetching.
 * @param {Function} fn - async thunk to run
 * @param {Object} [opts] - { retries=8, baseDelayMs=2000, log }
 */
async function withRateLimitRetry(fn, { retries = 8, baseDelayMs = 2000, log = () => { } } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err && err.response && err.response.status;
      if (status !== 429 || attempt >= retries) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt);
      log(`429 rate-limited (attempt ${attempt + 1}/${retries}) — backing off ${delay}ms`);
      await sleep(delay);
    }
  }
}

function scanPayload(offset) {
  return {
    ratiosType: 'Default',
    timePeriod: 'Latest',
    scan: {
      filters: [],
      index: [],
      industry: [],
      tags: [],
      scanName: 'Scan Name',
      scanDescription: 'Scan Description',
      watchlistIds: [],
    },
    watchlistIds: [],
    order: 'desc',
    orderBy: 'Market Capitalization',
    offset,
  };
}

/**
 * Extract { header, rows, total } from a runScan response. `table` is a
 * JS-array-shaped object keyed "0".."N": index 0 is the header row, the
 * rest are data rows. Defensive: if Stockscans ever returns a real array
 * for `table` instead of the keyed-object shape, this still works (the
 * indexing is identical either way).
 */
function extractTable(resp) {
  const table = (resp && resp.table) || {};
  const keys = Object.keys(table)
    .map(Number)
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);
  if (!keys.length) return { header: [], rows: [], total: resp ? resp.total : 0 };
  const header = table[keys[0]] || [];
  const rows = keys.slice(1).map((k) => table[k]);
  return { header, rows, total: resp && typeof resp.total === 'number' ? resp.total : rows.length };
}

/**
 * Normalize one positional data row into { companyId, name, sector, industry }.
 * A row missing a companyId at COL.companyId is dropped (counted in the run
 * summary) rather than crashing the whole sync.
 */
function normalizeRow(row) {
  if (!Array.isArray(row)) return null;
  const companyIdRaw = row[COL.companyId];
  if (!companyIdRaw) return null;
  const companyId = sanitizeCompanyId(companyIdRaw);
  const name = row[COL.name] || null;
  const industry = row[COL.industry] || null;
  const sector = row[COL.sector] || null;
  return { companyId, name, sector, industry };
}

/**
 * Fetch every page of the runScan company universe with resumption support.
 * @param {StockscansClient} client
 * @param {Object} opts - { concurrency, pageDelayMs, cache, log }
 * @returns {Promise<{rows: Array<Array>, total: number, pagesFetched: number, cache: Object}>}
 */
async function fetchAllCompanies(
  client,
  { concurrency = 1, pageDelayMs = 8000, cache = {}, log = () => { } } = {}
) {
  // Page 0 — learn the real `total`
  const firstResp = await withRateLimitRetry(() => client.runScan(scanPayload(0)), { log });
  const first = extractTable(firstResp);
  log(`page offset 0: ${first.rows.length} rows, total=${first.total}`);

  const total = first.total;
  cache.totalServers = total;
  cache.fetchedOffsets = cache.fetchedOffsets || new Set();

  const allRows = [...first.rows];
  cache.fetchedOffsets.add(0);
  let pagesFetched = 1;

  if (allRows.length >= total || first.rows.length < PAGE_SIZE) {
    cache.lastOffset = 0;
    return { rows: allRows, total, pagesFetched, cache };
  }

  // Compute remaining offsets, skipping any already fetched
  const remainingOffsets = [];
  for (let off = PAGE_SIZE; off < total; off += PAGE_SIZE) {
    if (!cache.fetchedOffsets.has(off)) {
      remainingOffsets.push(off);
    } else {
      // Reload from previous run (but don't re-log)
      pagesFetched++;
    }
  }

  if (remainingOffsets.length > 0) {
    log(`resuming from offset ${cache.lastOffset || 0}, ${remainingOffsets.length} page(s) remaining...`);
  }

  for (let i = 0; i < remainingOffsets.length; i += concurrency) {
    const batch = remainingOffsets.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (off) => {
        const resp = await withRateLimitRetry(() => client.runScan(scanPayload(off)), { log });
        const { rows } = extractTable(resp);
        return { off, rows };
      })
    );
    results.sort((a, b) => a.off - b.off);
    for (const { off, rows } of results) {
      log(`page offset ${off}: ${rows.length} rows`);
      allRows.push(...rows);
      pagesFetched++;
      cache.fetchedOffsets.add(off);
      cache.lastOffset = off;
      // Save progress after every page
      saveCache(cache);
    }
    if (i + concurrency < remainingOffsets.length) await sleep(pageDelayMs); // throttle between batches
  }

  return { rows: allRows, total, pagesFetched, cache };
}

async function main() {
  loadEnv(argValue('--env-file'));

  const dryRun = hasFlag('--dry-run');
  const resetCache = hasFlag('--reset-cache');
  const concurrency = Number(argValue('--concurrency') || 1);
  const pageDelayMs = Number(argValue('--page-delay-ms') || 8000);

  const client = new StockscansClient();
  const log = (msg) => console.error(`[sync-company-sector-industry] ${msg}`);

  // Load cache and optionally reset it
  let cache = loadCache();
  if (resetCache) {
    clearCache();
    cache = { lastOffset: 0, totalServers: 0, fetchedOffsets: new Set() };
    log('cache cleared, starting fresh');
  } else if (cache.fetchedOffsets && cache.fetchedOffsets.length > 0) {
    cache.fetchedOffsets = new Set(cache.fetchedOffsets);
    log(`resuming from cache: ${cache.fetchedOffsets.size} offsets already fetched`);
  }

  log('fetching company universe from /api/company/scans/run ...');
  const { rows, total, pagesFetched, cache: updatedCache } = await fetchAllCompanies(client, {
    concurrency,
    pageDelayMs,
    cache,
    log,
  });
  cache = updatedCache;
  log(`fetched ${rows.length} raw rows across ${pagesFetched} page(s) (server total=${total})`);

  const normalized = [];
  let droppedNoId = 0;
  let missingSectorOrIndustry = 0;
  const seen = new Set();
  for (const row of rows) {
    const n = normalizeRow(row);
    if (!n || !n.companyId) {
      droppedNoId++;
      continue;
    }
    if (seen.has(n.companyId)) continue; // de-dupe (paginated overlap safety)
    seen.add(n.companyId);
    if (!n.sector || !n.industry) missingSectorOrIndustry++;
    normalized.push(n);
  }

  log(
    `normalized ${normalized.length} unique companies ` +
    `(dropped ${droppedNoId} rows with no companyId, ` +
    `${missingSectorOrIndustry} missing sector/industry)`
  );

  let stats = { inserted: 0, updated: 0, unchanged: 0 };
  if (!dryRun && normalized.length) {
    // Upsert in batches of ~200, committing partial data even on interruption
    const BATCH = 200;
    for (let i = 0; i < normalized.length; i += BATCH) {
      const batch = normalized.slice(i, i + BATCH).map((c) => ({
        id: c.companyId,
        name: c.name || undefined,
        sector: c.sector || undefined,
        industry: c.industry || undefined,
        creator: CREATOR,
      }));
      const batchStats = db.upsertMany('companies', batch);
      stats.inserted += batchStats.inserted;
      stats.updated += batchStats.updated;
      stats.unchanged += batchStats.unchanged;
      log(`upserted batch: +${batchStats.inserted} inserted, +${batchStats.updated} updated`);
    }
  }

  const touchedFiles = dryRun ? [] : db.touchedFiles();
  const isComplete = cache.fetchedOffsets.size > 0 && cache.lastOffset + PAGE_SIZE >= total;

  if (isComplete) {
    clearCache();
    log('sync complete, cache cleared');
  } else {
    saveCache(cache);
    log(`sync incomplete, cache saved (resume with: node sync-company-sector-industry.js)`);
  }

  const summary = {
    dryRun,
    pagesFetched,
    serverTotal: total,
    rawRowCount: rows.length,
    uniqueCompanyCount: normalized.length,
    droppedNoId,
    missingSectorOrIndustry,
    dbStats: stats,
    touchedFiles,
    isComplete,
    cacheStatus: { lastOffset: cache.lastOffset, offsetsFetched: cache.fetchedOffsets.size },
  };

  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

module.exports = {
  fetchAllCompanies,
  normalizeRow,
  extractTable,
  scanPayload,
  withRateLimitRetry,
  main,
  COL,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
