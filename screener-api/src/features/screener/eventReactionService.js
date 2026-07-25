'use strict';

/**
 * eventReactionService — on-demand fetch-and-cache of event-reaction metrics.
 *
 * Storage: `data/cache/event-reaction/<SYMBOL>.json` under the repo's Data
 * Ecosystem v2 `data/` root (see docs/DATA_RULES.md). **"Database" in this
 * project means Google Drive** — the `data/` tree is what
 * `packages/jobs-runtime/lib/db.js` writes and mirrors to Drive
 * (`data/v2` folder). There is no MongoDB involved here (an earlier version
 * of this file used a Mongoose model — that was a mistake per Darshan's
 * 10-Jul-2026 correction: MongoDB is stale/deprecated legacy from before the
 * Data Ecosystem v2 migration, and "store in the db" always means Drive).
 *
 * screener-api does not depend on `@stock/jobs-runtime`, so this file
 * replicates `lib/db.js`'s atomic-write shape (tmp file + rename) directly
 * rather than adding that workspace dependency for one helper — same
 * justification as the read-only version this replaced. It intentionally
 * skips `lib/db.js`'s cross-process advisory locking (acceptable: this cache
 * is low write-frequency — one write per symbol per new event — and a lost
 * race just means a redundant recompute, not corruption, since the write is
 * always a full-file rewrite of a plain object).
 *
 * Cache key, per Darshan's spec: `companyId + eventType + eventTimestamp`.
 * One file per companyId (`<SYMBOL>.json`); within it, one entry per
 * `eventType|eventTimestamp`, so a symbol's full event-reaction history
 * accumulates (new events add entries) rather than being overwritten.
 *
 * Getting this data actually into Drive still requires the normal Data
 * Ecosystem v2 push step (`node packages/jobs-runtime/scripts/data.js push`)
 * — that part is unchanged and out of scope for a live web request; screener
 * pages read/write the local `data/` mirror directly, and pushing to Drive
 * remains a separate (periodic/manual) step, same as any other job's output.
 *
 * On-demand trigger design (unchanged from the Mongo version): each row read
 * is a fast local file read, returned immediately; the (~6-network-call)
 * refresh runs in the background, not awaited. First-ever view of a symbol
 * shows "—"; the write lands moments later; every subsequent view reads it
 * instantly. No cron, no schedule — viewing is the trigger.
 */

const fs = require('fs');
const path = require('path');
const { nse, bse, stockscans, fetchEventReactionMetrics, classifySignal } = require('@stock/api');

function dataRoot() {
  const explicit = process.env.DATA_V2_DIR;
  return path.resolve(explicit || path.join(__dirname, '..', '..', '..', '..', 'data'));
}

function cacheFile(companyId) {
  return path.join(
    dataRoot(),
    'cache',
    'event-reaction',
    `${String(companyId).toUpperCase()}.json`
  );
}

function entryKey(eventType, eventTimestamp) {
  return `${eventType}|${eventTimestamp}`;
}

function readCacheFile(companyId) {
  const file = cacheFile(companyId);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {}; // corrupt file — treat as empty rather than throwing; next write repairs it.
  }
}

/** Atomic write: tmp + rename (mirrors lib/db.js's writeFileAtomic). */
function writeCacheFile(companyId, obj) {
  const file = cacheFile(companyId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1) + '\n');
  fs.renameSync(tmp, file);
}

// In-process de-dupe so a burst of concurrent requests for the same
// companyId+eventType doesn't fire the ~6-call pipeline twice in parallel.
const inFlight = new Map(); // key: `${companyId}|${eventType}` -> Promise

/**
 * @param {string} companyId - bare NSE symbol.
 * @param {'result'|'concall'|'order'|'monthly_update'} eventType
 * @returns {Promise<Object|null>} the most recent cached entry for this
 *   companyId+eventType (by eventTimestamp), or null.
 */
async function getLatestCached(companyId, eventType) {
  const all = readCacheFile(companyId);
  const matches = Object.values(all).filter((e) => e.eventType === eventType);
  if (!matches.length) return null;
  matches.sort((a, b) => (a.eventTimestamp < b.eventTimestamp ? 1 : -1));
  return matches[0];
}

/**
 * Re-resolve the current latest event and write its metrics into the cache
 * file if this exact (eventType, eventTimestamp) isn't already present.
 * Idempotent — a no-op once the current event is cached.
 * @returns {Promise<Object|null>} the cached (possibly just-written) entry, or null if no event found.
 */
async function refreshEventReaction(companyId, eventType) {
  const symbol = companyId.toUpperCase();
  const key = `${symbol}|${eventType}`;
  if (inFlight.has(key)) return inFlight.get(key);

  const task = (async () => {
    try {
      const result = await fetchEventReactionMetrics({ nse, bse, stockscans }, symbol, eventType);
      if (!result.event) return null;

      const { timestamp } = result.event;
      const all = readCacheFile(symbol);
      const k = entryKey(eventType, timestamp);
      const existing = all[k];
      // Cache hit on the *current* event with a fully-settled note (no
      // pending windows) — nothing new to compute or store. (We still spend
      // the ~3 announcement calls to know this, by design: that's the cost
      // of "on demand, always check for a newer event".)
      if (existing && existing.metrics && !existing.metrics.note) {
        return existing;
      }

      const signal = classifySignal(result.metrics);
      const entry = {
        companyId: symbol,
        eventType,
        eventTimestamp: timestamp,
        source: result.event.source,
        headline: result.event.headline,
        metrics: result.metrics,
        signal,
        apiCalls: result.apiCalls,
        computedAt: new Date().toISOString(),
      };
      all[k] = entry;
      writeCacheFile(symbol, all);
      return entry;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`eventReactionService: refresh failed for ${symbol}/${eventType}:`, err.message);
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, task);
  return task;
}

/**
 * The on-demand entry point screenerController calls per row. Non-blocking:
 * returns the current cache immediately, triggers a background refresh.
 * @returns {Promise<Object|null>} shaped for screener-web's `row.eventReaction`
 *   column, or null if nothing is cached yet.
 */
async function ensureEventReactionCached(companyId, eventType = 'result') {
  const cached = await getLatestCached(companyId, eventType);
  // Fire-and-forget: do not await, don't let a refresh failure surface here.
  refreshEventReaction(companyId, eventType).catch(() => {});
  if (!cached || !cached.metrics) return null;
  return {
    timestamp: cached.eventTimestamp,
    sinceResult: cached.metrics.sinceResult ?? null,
    oneHour: cached.metrics.oneHour ?? null,
    oneDay: cached.metrics.oneDay ?? null,
    oneWeek: cached.metrics.oneWeek ?? null,
    oneMonth: cached.metrics.oneMonth ?? null,
  };
}

module.exports = {
  dataRoot,
  cacheFile,
  getLatestCached,
  refreshEventReaction,
  ensureEventReactionCached,
};
