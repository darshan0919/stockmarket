'use strict';

/**
 * extractionQualityCounter.js — dependency-free, process-wide, per-job
 * extraction-quality counter, keyed by profile. Mirrors
 * apiUsageCounter.js/tokenUsageCounter.js's design (job-keyed Map, no
 * ambient "active job" global, explicit job argument on every call).
 *
 * Built to close a real, confirmed gap: `preprocessCalibrate.js`'s cmdScore
 * only runs by hand, occasionally, against a curated reference worksheet —
 * it never sees the day-to-day production write stream. The
 * `preprocessing-truncation-bug` project memory is the proof this matters:
 * an 8000-char truncation cap made 42 heavy-doc extracts near-empty for
 * weeks while every one of them still passed L1 verification and read
 * `confidence: high` — because L1 verifies quotes against the CACHED
 * (already-truncated) text, not the source document, so a bad INPUT still
 * produces a technically-consistent, technically-"passing" extract. Only a
 * manual audit caught it. This counter is instrumented at the one place
 * every real production extract's verdict is already known —
 * `docExtracts.put()`, right where it computes `isL1Rejection()` — so a
 * regression like that one would show up as a `truncated_source`/
 * `confidence_low` rate climbing in the next day's numbers, not just in
 * whatever documents happen to get manually spot-checked.
 */

// Map<job, Map<profile, {pass, reject_fail, reject_truncated_source, confidence_low, confidence_high, total}>>
const byJob = new Map();

/**
 * Record one docExtracts.put() outcome.
 * @param {string} job - job name this observation is attributed to. A
 *   falsy job is a silent no-op, same as every other counter in this repo.
 * @param {Object} opts
 * @param {string} opts.profile - the extraction profile (announcement,
 *   result, transcript, ppt, annual_report).
 * @param {string} opts.l1Status - verifyExtract's l1.status
 *   ('pass'|'fail'|'truncated_source'|'no_quotes'|'skipped').
 * @param {'high'|'low'} opts.confidence - the extract's overall confidence.
 */
function record(job, { profile, l1Status, confidence } = {}) {
  if (!job) return;
  const key = profile || 'unknown';
  const jobMap = byJob.get(job) || new Map();
  const entry = jobMap.get(key) || {
    pass: 0,
    reject_fail: 0,
    reject_truncated_source: 0,
    other_l1_status: 0,
    confidence_high: 0,
    confidence_low: 0,
    total: 0,
  };
  entry.total += 1;
  if (l1Status === 'pass') entry.pass += 1;
  else if (l1Status === 'fail') entry.reject_fail += 1;
  else if (l1Status === 'truncated_source') entry.reject_truncated_source += 1;
  else entry.other_l1_status += 1;
  if (confidence === 'high') entry.confidence_high += 1;
  else if (confidence === 'low') entry.confidence_low += 1;
  jobMap.set(key, entry);
  byJob.set(job, jobMap);
}

/** Plain-object summary for one job: { job, byProfile: {profile: {...counts, passRate, truncatedSourceRate, confidenceLowRate}} }. */
function getSummary(job) {
  const jobMap = byJob.get(job) || new Map();
  const byProfile = {};
  for (const [profile, e] of jobMap.entries()) {
    byProfile[profile] = {
      ...e,
      passRate: e.total ? Number((e.pass / e.total).toFixed(4)) : null,
      truncatedSourceRate: e.total ? Number((e.reject_truncated_source / e.total).toFixed(4)) : null,
      confidenceLowRate: e.total ? Number((e.confidence_low / e.total).toFixed(4)) : null,
    };
  }
  return { job, byProfile };
}

/** Every job name with at least one recorded observation in this process. */
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
