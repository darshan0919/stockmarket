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
const { withRetry } = require('@stock/api/utils/concurrency');

// Stockscans rate-limits these AI-report endpoints (observed 429 under a few
// hundred sequential warm requests, 2026-09-04). Retrying with backoff HERE
// rather than in the caller matters: `fetchStockscansContext` swallows per-source
// errors by design, so a caller wrapping the whole function can't retry an
// individual source — by the time it sees the bundle, the 429 has already been
// converted into an error entry.
const RETRY = { retries: 3, baseDelayMs: 1200 };

const DEFAULT_TTL_DAYS = 7;

function safeName(companyId) {
  return String(companyId || '').replace(/[^A-Za-z0-9:_-]+/g, '_');
}

function cacheFile(companyId) {
  return path.join(db.cachePath('stockscans-context'), `${safeName(companyId)}.json`);
}

/**
 * Strip Stockscans' report markup so a consumer gets plain prose.
 *
 * The AI-report endpoints return light annotation markup that is meaningful in
 * their own UI and noise everywhere else: `{{bid:N}}` bullet anchors, `{+ ... +}`
 * highlight spans, and `[6][7][12]` transcript-citation refs. Stripping is a
 * deterministic transform, so it belongs here rather than being re-derived (and
 * re-derived slightly differently) by each consuming skill — conventions §17.
 *
 * The CACHE always stores the raw `finalReport` verbatim; this is applied at read
 * time by callers that want prose. Never store the stripped form — the citation
 * refs are the only thing tying a claim back to a transcript line, and a cache
 * that has thrown them away cannot get them back without a refetch.
 *
 * @param {string|null} finalReport
 * @returns {string|null}
 */
function plainText(finalReport) {
  if (typeof finalReport !== 'string') return null;
  return finalReport
    .replace(/\{\{bid:\d+\}\}/g, '')
    .replace(/\{\+(.*?)\+\}/gs, '$1')
    .replace(/\[\d+\](?:\[\d+\])*/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Classify a failed source fetch as a genuine "not covered" vs a transport
 * failure. This distinction is load-bearing, not cosmetic.
 *
 * Stockscans answers an unrecognized/uncovered companyId with HTTP 200 and a null
 * `finalReport` rather than a 4xx — a real, cacheable fact ("this company has no
 * growth-catalyst report"). A 429/5xx/timeout is the opposite: it tells us nothing
 * about the company, and caching it would record "no research exists" for
 * `ttlDays`, which every read path would then serve with full confidence.
 *
 * That is the worst failure mode this module can have — an empty bundle that
 * looks authoritative — and it is not hypothetical: warming a few hundred
 * companies tripped Stockscans' rate limiter, and before this fix every
 * rate-limited company would have been cached as "no research available" for a
 * week (observed 2026-09-04).
 *
 * @returns {'empty'|'transport'}
 */
function classifyError(err) {
  if (!err) return 'empty';
  const status = err.response && err.response.status;
  if (status && status >= 400) return 'transport';
  if (err.code || /timeout|socket|network|ECONN|ETIMEDOUT/i.test(err.message || '')) {
    return 'transport';
  }
  return 'transport';
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
 * SYNCHRONOUS, cache-only read of a company's Stockscans bundle. Never touches
 * the network and never throws.
 *
 * This is the entry point for callers on a hot path — `buildCompanyContext()`
 * is synchronous by contract and every company-scoped skill calls it, so it
 * cannot be made to await an HTTP round trip per company without changing every
 * caller. The split is deliberate: `warmStockscansContext.js` (a scheduled job)
 * does the fetching ahead of time, and read paths get a cache hit or nothing.
 *
 * A miss is a normal, expected outcome (company not yet warmed, or the bundle
 * aged past `ttlDays`) — callers degrade to whatever they did before, they do
 * not fetch as a fallback.
 *
 * @param {string} companyId
 * @param {Object} [opts]
 * @param {number} [opts.ttlDays=DEFAULT_TTL_DAYS] treat an older bundle as a miss
 * @returns {Object|null} the cached bundle, or null on miss/stale/corrupt
 */
function readCached(companyId, { ttlDays = DEFAULT_TTL_DAYS } = {}) {
  try {
    const cached = readCache(companyId, ttlDays);
    return cached ? { ...cached, fromCache: true } : null;
  } catch (_) {
    return null;
  }
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
async function fetchStockscansContext(
  companyId,
  { ttlDays = DEFAULT_TTL_DAYS, forceRefresh = false, client = stockscans } = {}
) {
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
    withRetry(() => client.growthCatalysts(companyId), RETRY)
      .then((r) => {
        // Stockscans returns HTTP 200 with a null finalReport for unrecognized
        // companyIds rather than a 4xx — treat an empty report as a soft
        // failure too, not a successful-but-empty result.
        if (!r || !r.finalReport) {
          errors.push({
            source: 'growth-catalysts',
            kind: 'empty',
            message: 'empty finalReport (unrecognized companyId or not covered)',
          });
          return;
        }
        bundle.growthCatalysts = { finalReport: r.finalReport, dateLabel: r.dateLabel, toc: r.toc };
      })
      .catch((e) =>
        errors.push({ source: 'growth-catalysts', kind: classifyError(e), message: e.message })
      ),

    withRetry(() => client.businessOverview(companyId), RETRY)
      .then((r) => {
        if (!r || !r.finalReport) {
          errors.push({
            source: 'business-overview',
            kind: 'empty',
            message: 'empty finalReport (unrecognized companyId or not covered)',
          });
          return;
        }
        bundle.businessOverview = {
          finalReport: r.finalReport,
          dateLabel: r.dateLabel,
          toc: r.toc,
        };
      })
      .catch((e) =>
        errors.push({ source: 'business-overview', kind: classifyError(e), message: e.message })
      ),

    withRetry(() => client.latestTranscript(companyId), RETRY)
      .then(async (t) => {
        if (!t) {
          errors.push({
            source: 'concall-notes',
            kind: 'empty',
            message: 'no Transcript document on file',
          });
          return;
        }
        const cn = await withRetry(() => client.concallNotes(companyId, t.ssUrl), RETRY);
        bundle.concallNotes = {
          finalReport: cn.finalReport,
          date: cn.date,
          companyName: cn.companyName,
          sourceSsUrl: t.ssUrl,
        };
      })
      .catch((e) =>
        errors.push({ source: 'concall-notes', kind: classifyError(e), message: e.message })
      ),
  ]);

  // Only cache a bundle we can stand behind. A transport failure on ANY source
  // means this bundle understates what Stockscans has, and writing it would make
  // that understatement authoritative for `ttlDays` (see classifyError). Return it
  // to the caller — which can report and retry — but do not persist it.
  const transportFailures = bundle.errors.filter((e) => e.kind === 'transport');
  bundle.cached = transportFailures.length === 0;
  bundle.transportFailures = transportFailures.map((e) => e.source);
  if (bundle.cached) writeCache(companyId, bundle);
  return { ...bundle, fromCache: false };
}

module.exports = { fetchStockscansContext, readCached, plainText, DEFAULT_TTL_DAYS };
