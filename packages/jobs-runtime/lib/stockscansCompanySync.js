'use strict';

/**
 * stockscansCompanySync.js
 *
 * Purpose: Fetch all companies, sectors, and industries from Stockscans
 * (/api/company/scans/run) and upsert them into data/companies.json.
 *
 * Features:
 * - Exponential backoff retry on HTTP 429 rate limits
 * - Progress caching (.cache/sync-company-sector-industry.json) for safe resumption
 * - Batch upsert into Data Ecosystem v2 companies collection
 */

const fs = require('fs');
const path = require('path');
const { StockscansClient } = require('@stock/api');
const { sanitizeCompanyId } = require('@stock/api/utils/companyId');
const db = require('./db');

const PAGE_SIZE = 50;
const CREATOR = 'company-master-sync';

const COL = {
  companyId: 0,
  name: 1,
  industry: 33,
  sector: 34,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCachePath() {
  const cacheDir = path.join(db.dataRoot(), '.cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  return path.join(cacheDir, 'sync-company-sector-industry.json');
}

function loadCache() {
  try {
    const file = getCachePath();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (_) {}
  return { lastOffset: 0, totalServers: 0, fetchedOffsets: [] };
}

function saveCache(cache) {
  try {
    const file = getCachePath();
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          lastOffset: cache.lastOffset,
          totalServers: cache.totalServers,
          fetchedOffsets: Array.from(cache.fetchedOffsets || []),
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );
  } catch (_) {}
}

function clearCache() {
  try {
    const file = getCachePath();
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (_) {}
}

async function withRateLimitRetry(fn, { retries = 8, baseDelayMs = 2000, log = () => {} } = {}) {
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

function extractTable(resp) {
  const table = (resp && resp.table) || {};
  const keys = Object.keys(table)
    .map(Number)
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);
  if (!keys.length) return { header: [], rows: [], total: resp ? resp.total : 0 };
  const header = table[keys[0]] || [];
  const rows = keys.slice(1).map((k) => table[k]);
  return {
    header,
    rows,
    total: resp && typeof resp.total === 'number' ? resp.total : rows.length,
  };
}

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

async function fetchAllCompanies(
  client,
  { concurrency = 1, pageDelayMs = 5000, maxPages = Infinity, cache = {}, log = () => {} } = {}
) {
  const firstResp = await withRateLimitRetry(() => client.runScan(scanPayload(0)), { log });
  const first = extractTable(firstResp);
  log(`page offset 0: ${first.rows.length} rows, total=${first.total}`);

  const total = first.total;
  cache.totalServers = total;
  cache.fetchedOffsets = cache.fetchedOffsets || new Set();

  const allRows = [...first.rows];
  cache.fetchedOffsets.add(0);
  let pagesFetched = 1;

  if (allRows.length >= total || first.rows.length < PAGE_SIZE || pagesFetched >= maxPages) {
    cache.lastOffset = 0;
    return { rows: allRows, total, pagesFetched, cache };
  }

  const remainingOffsets = [];
  for (let off = PAGE_SIZE; off < total; off += PAGE_SIZE) {
    if (!cache.fetchedOffsets.has(off)) {
      remainingOffsets.push(off);
    } else {
      pagesFetched++;
    }
  }

  if (remainingOffsets.length > 0) {
    log(
      `resuming from offset ${cache.lastOffset || 0}, ${remainingOffsets.length} page(s) remaining...`
    );
  }

  for (let i = 0; i < remainingOffsets.length; i += concurrency) {
    if (pagesFetched >= maxPages) break;
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
      saveCache(cache);
    }
    if (i + concurrency < remainingOffsets.length && pagesFetched < maxPages) {
      await sleep(pageDelayMs);
    }
  }

  return { rows: allRows, total, pagesFetched, cache };
}

/**
 * Synchronize all companies from Stockscans into companies.json.
 * @param {Object} opts
 * @param {boolean} [opts.dryRun=false]
 * @param {boolean} [opts.resetCache=false]
 * @param {number} [opts.concurrency=1]
 * @param {number} [opts.pageDelayMs=5000]
 * @param {number} [opts.maxPages=Infinity]
 * @param {Function} [opts.log]
 * @returns {Promise<Object>} Summary object with stats
 */
async function syncStockscansCompanies({
  dryRun = false,
  resetCache = false,
  concurrency = 1,
  pageDelayMs = 5000,
  maxPages = Infinity,
  log = (msg) => console.error(`[stockscans-sync] ${msg}`),
} = {}) {
  const client = new StockscansClient();

  let rawCache = loadCache();
  if (resetCache) {
    clearCache();
    rawCache = { lastOffset: 0, totalServers: 0, fetchedOffsets: [] };
    log('progress cache cleared, starting fresh from offset 0');
  }

  const cache = {
    lastOffset: rawCache.lastOffset || 0,
    totalServers: rawCache.totalServers || 0,
    fetchedOffsets: new Set(rawCache.fetchedOffsets || []),
  };

  log('fetching company universe from Stockscans /api/company/scans/run...');
  const {
    rows,
    total,
    pagesFetched,
    cache: updatedCache,
  } = await fetchAllCompanies(client, {
    concurrency,
    pageDelayMs,
    maxPages,
    cache,
    log,
  });

  const normalized = [];
  const seen = new Set();
  let droppedNoId = 0;
  let missingSectorOrIndustry = 0;

  for (const row of rows) {
    const n = normalizeRow(row);
    if (!n || !n.companyId) {
      droppedNoId++;
      continue;
    }
    if (seen.has(n.companyId)) continue;
    seen.add(n.companyId);
    if (!n.sector || !n.industry) missingSectorOrIndustry++;
    normalized.push(n);
  }

  log(
    `normalized ${normalized.length} unique companies from Stockscans (${droppedNoId} dropped with no ID)`
  );

  let stats = { inserted: 0, updated: 0, unchanged: 0 };
  if (!dryRun && normalized.length) {
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
    }
    log(
      `upserted to companies.json: +${stats.inserted} inserted, +${stats.updated} updated, ${stats.unchanged} unchanged`
    );
  }

  const isComplete =
    updatedCache.fetchedOffsets.size > 0 && updatedCache.lastOffset + PAGE_SIZE >= total;

  if (isComplete) {
    clearCache();
    log('Stockscans company sync complete, progress cache cleared');
  } else {
    saveCache(updatedCache);
    log(`Stockscans company sync paused, progress cache saved`);
  }

  return {
    dryRun,
    pagesFetched,
    serverTotal: total,
    rawRowCount: rows.length,
    uniqueCompanyCount: normalized.length,
    droppedNoId,
    missingSectorOrIndustry,
    dbStats: stats,
    isComplete,
  };
}

module.exports = {
  syncStockscansCompanies,
  fetchAllCompanies,
  normalizeRow,
  extractTable,
  scanPayload,
  withRateLimitRetry,
  COL,
};
