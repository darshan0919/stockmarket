'use strict';

/**
 * cacheUsageTracker.js — the job-facing cache-hit-rate tracking surface.
 *
 * Thin wrapper over ./cacheUsageCounter.js, persisting a job's summary to
 * the `events` collection (type: cache_usage_summary) via lib/db.js — same
 * pattern as apiUsageTracker.js and tokenUsageTracker.js. Flushed
 * automatically as a side effect of `recordTokenUsage.js` (the same
 * already-adopted "final step" — see conventions.md §24/§25 — rather than
 * requiring a second, separate call site in every job's SKILL.md).
 */

const counter = require('./cacheUsageCounter');

const { record, getSummary, activeJobs, resetJob, reset } = counter;

/**
 * Persist one job's cache-usage summary to the `events` collection
 * (type: cache_usage_summary) via lib/db.js.
 * No-ops (returns null) if the job recorded zero lookups this process.
 *
 * @param {string} jobName
 * @param {Object} [opts]
 * @param {string} [opts.date] - YYYY-MM-DD market/run date; defaults to IST today.
 * @returns {Object|null}
 */
function flush(jobName, { date } = {}) {
  if (!jobName) return null;
  const summary = getSummary(jobName);
  if (summary.totalLookups === 0) return null;

  const db = require('./db');
  const ist = require('./ist');
  const runDate =
    date ||
    (() => {
      const d = ist.istDate();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      return `${d.getUTCFullYear()}-${mm}-${dd}`;
    })();

  const eventRecord = {
    creator: jobName,
    type: 'cache_usage_summary',
    date: runDate,
    job: jobName,
    byCache: summary.byCache,
    totalLookups: summary.totalLookups,
    overallHitRate: summary.overallHitRate,
  };
  const stats = db.appendEvents([eventRecord], { creator: jobName });
  resetJob(jobName);
  return stats;
}

module.exports = { record, getSummary, activeJobs, flush, reset };
