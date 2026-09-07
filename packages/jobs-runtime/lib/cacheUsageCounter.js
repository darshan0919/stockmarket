'use strict';

/**
 * cacheUsageCounter.js — dependency-free, process-wide, per-job cache
 * hit/miss counter. Mirrors tokenUsageCounter.js / apiUsageCounter.js's
 * design exactly (job-keyed Map, no ambient "active job" global, explicit
 * job argument on every call) — see those modules' headers for the full
 * rationale.
 *
 * Built to close a real, confirmed gap: conventions.md §17 mandates caching
 * the Extraction pass (docExtracts.js, buildBaselines.js) so a second skill
 * or a second run over the same underlying facts gets a cache hit, not a
 * recomputation — but nothing in the repo counted whether that's actually
 * happening. A low hit rate on a job that should be re-reading the same
 * companies day over day is silent, expensive rework disguised as ordinary
 * token/API spend.
 *
 * Instrumented at `lib/resolveFilingContent.js` — the single "check before
 * you fetch" choke point every document-touching skill is meant to call
 * (see that module's header) — rather than inside `docExtracts.js`/
 * `buildBaselines.js` directly, so this counts what a CONSUMER experienced
 * (hit vs. miss), not internal cache-store mechanics.
 */

// Map<job, Map<cacheName, {hits, misses}>>
const byJob = new Map();

/**
 * Record one cache lookup outcome.
 * @param {string} job - job name this observation is attributed to. A
 *   falsy job is a silent no-op, same as every other counter in this repo.
 * @param {Object} opts
 * @param {string} opts.name - which cache was checked (e.g.
 *   'extract-cache', 'baseline-cache' — resolveFilingContent's own
 *   `source` values, so a caller reading this data can cross-reference
 *   directly against that function's return shape).
 * @param {boolean} opts.hit - true for a hit, false for a miss.
 */
function record(job, { name, hit } = {}) {
  if (!job) return;
  const key = name || 'other';
  const jobMap = byJob.get(job) || new Map();
  const entry = jobMap.get(key) || { hits: 0, misses: 0 };
  if (hit) entry.hits += 1;
  else entry.misses += 1;
  jobMap.set(key, entry);
  byJob.set(job, jobMap);
}

/** Plain-object summary for one job: { job, byCache: {name: {hits, misses, hitRate}}, totalLookups, overallHitRate }. */
function getSummary(job) {
  const jobMap = byJob.get(job) || new Map();
  const byCache = {};
  let totalHits = 0;
  let totalLookups = 0;
  for (const [name, { hits, misses }] of jobMap.entries()) {
    const lookups = hits + misses;
    byCache[name] = { hits, misses, hitRate: lookups ? Number((hits / lookups).toFixed(4)) : null };
    totalHits += hits;
    totalLookups += lookups;
  }
  return {
    job,
    byCache,
    totalLookups,
    overallHitRate: totalLookups ? Number((totalHits / totalLookups).toFixed(4)) : null,
  };
}

/** Every job name with at least one recorded lookup in this process. */
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
