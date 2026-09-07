'use strict';

/**
 * deliveryUsageTracker.js — the job-facing email-delivery-outcome tracking
 * surface.
 *
 * Thin wrapper over @stock/cloud-utils's deliveryUsageCounter (the actual
 * counter state, shared with cloud-utils's emailService.js — see that
 * module's header for why the counter lives in cloud-utils rather than
 * here, mirroring apiUsageTracker.js's relationship to apiUsageCounter.js
 * exactly). This module adds persistence to the `events` collection
 * (type: delivery_summary) via lib/db.js. Flushed automatically as a side
 * effect of `recordTokenUsage.js` (the same already-adopted "final step" —
 * conventions.md §25) rather than requiring a second call site.
 */

const counter = require('@stock/cloud-utils').deliveryUsageCounter;

const { record, getSummary, activeJobs, resetJob, reset } = counter;

/**
 * Persist one job's delivery-outcome summary to the `events` collection
 * (type: delivery_summary) via lib/db.js.
 * No-ops (returns null) if the job recorded zero send attempts this process.
 *
 * @param {string} jobName
 * @param {Object} [opts]
 * @param {string} [opts.date] - YYYY-MM-DD market/run date; defaults to IST today.
 * @returns {Object|null}
 */
function flush(jobName, { date } = {}) {
  if (!jobName) return null;
  const summary = getSummary(jobName);
  if (summary.total === 0) return null;

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
    type: 'delivery_summary',
    date: runDate,
    job: jobName,
    sent: summary.sent,
    skipped: summary.skipped,
    error: summary.error,
    total: summary.total,
    bySkipReason: summary.bySkipReason,
  };
  const stats = db.appendEvents([eventRecord], { creator: jobName });
  resetJob(jobName);
  return stats;
}

module.exports = { record, getSummary, activeJobs, flush, reset };
