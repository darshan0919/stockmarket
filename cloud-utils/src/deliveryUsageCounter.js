'use strict';

/**
 * deliveryUsageCounter.js — dependency-free, process-wide, per-job email
 * delivery-outcome counter. Mirrors apiUsageCounter.js's design exactly
 * (job-keyed Map, no ambient "active job" global, explicit job argument on
 * every call, lives in cloud-utils for the same reason apiUsageCounter does
 * — emailService.js is itself in cloud-utils, and jobs-runtime already
 * depends on cloud-utils, so this is the one place both sides can reach
 * without a circular dependency).
 *
 * Built to close a real, confirmed gap: sendHtmlEmail() already returns
 * {status: 'sent'|'skipped'|'error', ...} at all 12+ call sites across the
 * repo's digest jobs, but nothing aggregates it. A job silently returning
 * 'skipped' (e.g. GOOGLE_APP_PASSWORD unset) looks identical in a casual
 * glance at logs to a job that ran fine and had nothing to report — it is
 * only noticed by absence, often days later.
 */

// Map<job, {sent, skipped, error, bySkipReason: Map<reason, count>}>
const byJob = new Map();

/**
 * Record one sendHtmlEmail() outcome.
 * @param {string} job - job name this observation is attributed to. A
 *   falsy job is a silent no-op, same as every other counter in this repo.
 * @param {Object} opts
 * @param {'sent'|'skipped'|'error'} opts.status
 * @param {string} [opts.reason] - the skip reason or error message, kept
 *   only for 'skipped'/'error' — bucketed so a recurring cause (e.g.
 *   "GOOGLE_APP_PASSWORD not set") is visible as a count, not just a string
 *   to grep for.
 */
function record(job, { status, reason } = {}) {
  if (!job) return;
  const entry = byJob.get(job) || { sent: 0, skipped: 0, error: 0, bySkipReason: new Map() };
  if (status === 'sent') entry.sent += 1;
  else if (status === 'skipped') entry.skipped += 1;
  else if (status === 'error') entry.error += 1;
  if ((status === 'skipped' || status === 'error') && reason) {
    entry.bySkipReason.set(reason, (entry.bySkipReason.get(reason) || 0) + 1);
  }
  byJob.set(job, entry);
}

/** Plain-object summary for one job: { job, sent, skipped, error, total, bySkipReason: {reason: count} }. */
function getSummary(job) {
  const entry = byJob.get(job) || { sent: 0, skipped: 0, error: 0, bySkipReason: new Map() };
  return {
    job,
    sent: entry.sent,
    skipped: entry.skipped,
    error: entry.error,
    total: entry.sent + entry.skipped + entry.error,
    bySkipReason: Object.fromEntries(entry.bySkipReason),
  };
}

/** Every job name with at least one recorded outcome in this process. */
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

module.exports = { record, getSummary, activeJobs, resetJob, reset };
