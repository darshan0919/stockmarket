'use strict';

/**
 * apiUsageTracker.js — the job-facing API-usage tracking surface.
 *
 * Thin wrapper over @stock/cloud-utils's apiUsageCounter (the actual counter
 * state, shared with stock-api's HttpClient — see that module's header for
 * why the counter itself lives in cloud-utils rather than here: stock-api
 * cannot depend on jobs-runtime without creating a circular dependency).
 * This module adds the one thing cloud-utils can't do itself: persisting a
 * job's summary to the `events` collection via lib/db.js.
 *
 * Attribution is JOB-level (a jobs/Scheduled/<name> directory), not
 * skill-level — see apiUsageCounter.js's header for why: several
 * jobs-runtime scripts back multiple registry.json skills, and some are in
 * turn invoked by multiple jobs, so "skill" was an ambiguous attribution key
 * for exactly the scripts most in need of auditing.
 *
 * NO shared "active job" global (fixed 2026-09-06, per Darshan's review):
 * there is no `setActiveJob()`/`isActive()`/`activeJob()` here — every
 * function below takes the job name as an EXPLICIT argument. This closes a
 * real gap the earlier ambient-global design had: a single process handling
 * more than one logical run internally (nested requires, sequential
 * sub-jobs, or two concurrent async runs in one process) could have a second
 * `setActiveJob()` call silently clobber the first run's still-in-flight
 * counts. Keying the counter by job (apiUsageCounter.js's `Map<job, ...>`)
 * and requiring an explicit job argument everywhere makes concurrent/nested
 * recording correct by construction rather than by convention.
 *
 * Wiring a script for this: set `jobName` once at the top of its `main()` on
 * whichever @stock/api client instance(s) it uses (e.g.
 * `stockscans.setJobName(jobName)` — see StockscansClient.js/
 * ScreenerClient.js/PerplexityClient.js's `setJobName`, which mutates that
 * client's OWN HttpClient instance, not any shared state), then call
 * `flush(jobName)` near the end of the run (after `data:push` is a good
 * place) so the run's summary is persisted and available for the next
 * email's footer (see cloud-utils/src/emailService.js's
 * `appendApiUsageFooter`, wired into sendHtmlEmail). See
 * lib/scriptJobName.js for how a script resolves its own job name
 * (STOCKMARKET_JOB_NAME env var, then --job flag, then a documented
 * per-script default for direct/manual runs).
 */

const counter = require('@stock/cloud-utils').apiUsageCounter;

const { record, totalCalls, getSummary, activeJobs, resetJob, reset } = counter;

/**
 * Persist one job's summary to the `events` collection
 * (type: api_usage_summary) via lib/db.js, per DATA_RULES §2 (a new `type`
 * inside an existing collection, not a new collection).
 * No-ops (returns null) if the job made zero calls this process.
 *
 * @param {string} jobName - the job whose counts to flush (required — there
 *   is no "current"/ambient job to default to).
 * @param {Object} [opts]
 * @param {string} [opts.date] - YYYY-MM-DD market/run date; defaults to IST today.
 * @returns {Object|null} the appendEvents stats, or null if nothing to persist.
 */
function flush(jobName, { date } = {}) {
  if (!jobName) return null;
  const summary = getSummary(jobName);
  if (summary.total === 0) return null;

  const db = require('./db');
  const ist = require('./ist');
  // db.js requires strict YYYY-MM-DD for event records; ist.js has no helper
  // producing that exact shape (nowIstDate → "27 Jun 2026", istYmd → "20260627"
  // with no dashes), so build it from istDate() directly.
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
    type: 'api_usage_summary',
    date: runDate,
    job: jobName,
    byApi: summary.byApi,
    totalCalls: summary.total,
  };
  const stats = db.appendEvents([eventRecord], { creator: jobName });
  resetJob(jobName); // free the in-memory bucket now that it's durably persisted
  return stats;
}

module.exports = { record, totalCalls, getSummary, activeJobs, flush, reset };
