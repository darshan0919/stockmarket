'use strict';

/**
 * apiUsageCounter.js — dependency-free, process-wide, per-job API-call counter.
 *
 * Lives in @stock/cloud-utils (not @stock/api or @stock/jobs-runtime) on
 * purpose: stock-api's HttpClient (every outbound call in this repo funnels
 * through it) needs to record counts, and jobs-runtime's db.js (data
 * persistence) needs to read and flush them — but stock-api cannot depend on
 * jobs-runtime (jobs-runtime already depends on stock-api; the reverse would
 * be circular, see conventions.md §15's note on the same constraint for
 * companyId sanitization). cloud-utils has no dependency on either, and both
 * of them already depend on cloud-utils, so this is the one place both sides
 * can reach without a cycle.
 *
 * Attribution dimension: JOB, not skill (changed 2026-09-06). A "job" is a
 * jobs/Scheduled/<name> directory — the actual 1:1 unit with a cron schedule
 * and a single outbound email.
 *
 * NO shared "active job" global (fixed 2026-09-06, per Darshan's review): an
 * earlier version had a single module-level `state.job`/`setActiveJob()`, set
 * once and read implicitly by every `record()` call. Two DIFFERENT node
 * processes never actually shared that state (every scheduled job here is a
 * plain `node script.js` invocation — no fork/worker_threads/cluster — so
 * cross-job clobbering across processes was never really possible), but a
 * SINGLE process handling more than one logical run internally (a script
 * that processes several sub-jobs sequentially, or a nested require of
 * another job's module — e.g. postCloseScanInsights.js requiring functions
 * out of watchlistInsights.js) could have a second `setActiveJob()` silently
 * stomp the first run's still-in-flight counts, or two concurrent async runs
 * in the same process interleave into one bucket. Fixed by keying the
 * counter itself by job (`Map<job, Map<api, counts>>`) and requiring every
 * caller to pass its job name explicitly to `record()`/`getSummary()`/
 * `flush()` — there is no ambient/ "currently active" job anywhere, so
 * concurrent or nested recording within one process is correct by
 * construction rather than by convention.
 *
 * This module does ONLY in-memory counting. Persisting a run's summary to the
 * `events` collection is `packages/jobs-runtime/lib/apiUsageTracker.js`'s job
 * (it wraps this counter + lib/db.js). Every skill/script that makes outbound
 * HTTP calls should go through THAT wrapper's flush(job), not this module
 * directly — this module is the low-level primitive HttpClient calls into on
 * every request (passing the jobName it was constructed with — see
 * stock-api/src/http/HttpClient.js).
 */

// Map<job, Map<api, {count, ok, failed}>>
const byJob = new Map();

/**
 * Record one outbound call. Called by HttpClient on every request/response —
 * not meant to be called directly by job scripts.
 * @param {string} job - the job name to attribute this call to. A falsy job
 *   (no job name was ever passed down to this HttpClient instance) is a
 *   silent no-op — tracking is opt-in, never a source of errors for an
 *   untracked/ad-hoc script.
 * @param {Object} opts
 * @param {string} opts.api - short host label (stockscans, screener, nse, bse, perplexity, other)
 * @param {boolean} opts.ok - whether the call succeeded (2xx) or threw/errored
 */
function record(job, { api, ok } = {}) {
  if (!job) return;
  const key = api || 'other';
  const jobMap = byJob.get(job) || new Map();
  const entry = jobMap.get(key) || { count: 0, ok: 0, failed: 0 };
  entry.count += 1;
  if (ok) entry.ok += 1;
  else entry.failed += 1;
  jobMap.set(key, entry);
  byJob.set(job, jobMap);
}

/** Total calls recorded so far for this job, across all APIs. */
function totalCalls(job) {
  const jobMap = byJob.get(job);
  if (!jobMap) return 0;
  let total = 0;
  for (const { count } of jobMap.values()) total += count;
  return total;
}

/** Plain-object summary for one job: { job, byApi: {api: {count, ok, failed}}, total }. */
function getSummary(job) {
  const jobMap = byJob.get(job) || new Map();
  const byApi = {};
  for (const [api, entry] of jobMap.entries()) byApi[api] = { ...entry };
  return { job, byApi, total: totalCalls(job) };
}

/** Every job name with at least one recorded call in this process. */
function activeJobs() {
  return [...byJob.keys()];
}

/** Clear one job's counts (used after a successful flush, or by tests). */
function resetJob(job) {
  byJob.delete(job);
}

/** Clear ALL jobs' counts (tests only — never call this from job code). */
function reset() {
  byJob.clear();
}

module.exports = { record, totalCalls, getSummary, activeJobs, resetJob, reset };
