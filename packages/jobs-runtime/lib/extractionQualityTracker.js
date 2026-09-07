'use strict';

/**
 * extractionQualityTracker.js — the job-facing extraction-quality tracking
 * surface. Thin wrapper over ./extractionQualityCounter.js, persisting a
 * job's summary to the `events` collection (type: calibration_summary,
 * reusing the same event-type name convention as the manual
 * preprocessCalibrate.js gate, since both answer "is this profile's
 * extraction trustworthy right now" — one from real production writes, one
 * from a hand-curated reference set) via lib/db.js. Flushed automatically
 * by `recordTokenUsage.js`'s already-adopted final step (conventions.md §25).
 */

const counter = require('./extractionQualityCounter');

const { record, getSummary, activeJobs, resetJob, reset } = counter;

/**
 * Persist one job's extraction-quality summary to the `events` collection
 * (type: calibration_summary, source: 'production-writes' to distinguish
 * from a manual preprocessCalibrate.js scoring run) via lib/db.js.
 * No-ops (returns null) if the job recorded zero extraction writes this process.
 *
 * @param {string} jobName
 * @param {Object} [opts]
 * @param {string} [opts.date] - YYYY-MM-DD market/run date; defaults to IST today.
 * @returns {Object|null}
 */
function flush(jobName, { date } = {}) {
  if (!jobName) return null;
  const summary = getSummary(jobName);
  if (Object.keys(summary.byProfile).length === 0) return null;

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
    type: 'calibration_summary',
    source: 'production-writes',
    date: runDate,
    job: jobName,
    byProfile: summary.byProfile,
  };
  const stats = db.appendEvents([eventRecord], { creator: jobName });
  resetJob(jobName);
  return stats;
}

module.exports = { record, getSummary, activeJobs, flush, reset };
