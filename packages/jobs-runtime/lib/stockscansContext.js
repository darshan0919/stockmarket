'use strict';

/**
 * stockscansContext.js — ready-made company research context sourced live
 * from Stockscans' AI-synthesized endpoints: growth catalysts, business
 * overview, and notes from the latest concall transcript on file.
 *
 * Distinct from companyContext.js's buildCompanyContext(): that one is a fast,
 * local-data-only bundle (reads data/*.json, no network). This one makes
 * network calls, so it's opt-in (callers ask for it explicitly, e.g. only for
 * the top-3-by-conviction companies, not every gainer) and disk-cached under
 * data/cache/ — these are periodically-refreshed research reports, not
 * daily-changing state, so re-fetching on every run would be wasteful.
 */

const fs = require('fs');
const path = require('path');
const db = require('./db');
const { stockscans } = require('@stock/api');

const DEFAULT_TTL_DAYS = 7;

function safeName(companyId) {
  return String(companyId || '').replace(/[^A-Za-z0-9:_-]+/g, '_');
}

function cacheFile(companyId) {
  return path.join(db.cachePath('stockscans-context'), `${safeName(companyId)}.json`);
}

function readCache(companyId, ttlDays) {
  const file = cacheFile(companyId);
  if (!fs.existsSync(file)) return null;
  try {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ageMs = Date.now() - new Date(cached.fetchedAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs > ttlDays * 864e5) return null;
    return cached;
  } catch (_) {
    return null; // corrupt/unreadable cache entry — treat as a miss, refetch
  }
}

function writeCache(companyId, bundle) {
  const file = cacheFile(companyId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(bundle, null, 2));
  fs.renameSync(tmp, file);
}

/**
 * Fetch (or serve from cache) the Stockscans-sourced research bundle for a
 * company. Each of the three pieces is fetched independently and
 * best-effort — a failure on one (e.g. no transcript on file for a recent
 * IPO) doesn't block the others; failures are recorded in `.errors`, never
 * thrown, so callers always get a usable bundle back.
 *
 * @param {string} companyId - e.g. "NSE:UTLSOLAR"
 * @param {Object} [opts]
 * @param {number} [opts.ttlDays=7] - reuse a cached bundle younger than this
 * @param {boolean} [opts.forceRefresh=false] - ignore cache, always refetch
 * @param {Object} [opts.client=stockscans] - injectable for tests
 * @returns {Promise<{companyId, fetchedAt, fromCache, growthCatalysts, businessOverview, concallNotes, errors}>}
 */
async function fetchStockscansContext(companyId, { ttlDays = DEFAULT_TTL_DAYS, forceRefresh = false, client = stockscans } = {}) {
  if (!forceRefresh) {
    const cached = readCache(companyId, ttlDays);
    if (cached) return { ...cached, fromCache: true };
  }

  const errors = [];
  const bundle = {
    companyId,
    fetchedAt: new Date().toISOString(),
    growthCatalysts: null,
    businessOverview: null,
    concallNotes: null,
    errors,
  };

  await Promise.all([
    client.growthCatalysts(companyId)
      .then((r) => {
        // Stockscans returns HTTP 200 with a null finalReport for unrecognized
        // companyIds rather than a 4xx — treat an empty report as a soft
        // failure too, not a successful-but-empty result.
        if (!r || !r.finalReport) { errors.push({ source: 'growth-catalysts', message: 'empty finalReport (unrecognized companyId or not covered)' }); return; }
        bundle.growthCatalysts = { finalReport: r.finalReport, dateLabel: r.dateLabel, toc: r.toc };
      })
      .catch((e) => errors.push({ source: 'growth-catalysts', message: e.message })),

    client.businessOverview(companyId)
      .then((r) => {
        if (!r || !r.finalReport) { errors.push({ source: 'business-overview', message: 'empty finalReport (unrecognized companyId or not covered)' }); return; }
        bundle.businessOverview = { finalReport: r.finalReport, dateLabel: r.dateLabel, toc: r.toc };
      })
      .catch((e) => errors.push({ source: 'business-overview', message: e.message })),

    client.latestTranscript(companyId)
      .then(async (t) => {
        if (!t) { errors.push({ source: 'concall-notes', message: 'no Transcript document on file' }); return; }
        const cn = await client.concallNotes(companyId, t.ssUrl);
        bundle.concallNotes = { finalReport: cn.finalReport, date: cn.date, companyName: cn.companyName, sourceSsUrl: t.ssUrl };
      })
      .catch((e) => errors.push({ source: 'concall-notes', message: e.message })),
  ]);

  writeCache(companyId, bundle);
  return { ...bundle, fromCache: false };
}

module.exports = { fetchStockscansContext, DEFAULT_TTL_DAYS };
