'use strict';

/**
 * tokenUsageCounter.js — dependency-free, process-wide, per-job LLM
 * token-usage counter. Deliberately mirrors @stock/cloud-utils's
 * apiUsageCounter.js (same Map<job, ...> shape, same no-ambient-global
 * design, same record/getSummary/activeJobs/resetJob/reset surface) so
 * anyone who already understands §23's API-call tracking gets this one for
 * free — see that module's header for the full rationale on why job-level
 * (not skill-level) is the attribution dimension and why there is
 * deliberately no `setActiveJob()`/"current job" anywhere.
 *
 * Lives in jobs-runtime, not cloud-utils, unlike apiUsageCounter. That
 * module lives in cloud-utils because stock-api's HttpClient (shared by
 * every outbound HTTP call in the repo) needs to record into it and
 * stock-api cannot depend on jobs-runtime. Token usage has no equivalent
 * constraint: per conventions.md §24 (see skills/_shared/conventions.md),
 * NO script in this repo is allowed to call an LLM provider API directly —
 * `packages/jobs-runtime/lib/anthropicClient.js` was the one exception and
 * has been removed. The only producer of token-usage numbers is the AGENT
 * (Claude/Cowork) itself, self-reporting what it observed about its own
 * run via `recordTokenUsage.js` — a jobs-runtime-only concern, so this
 * module stays local to jobs-runtime rather than cloud-utils.
 *
 * Attribution dimension: JOB (a `jobs/Scheduled/<name>` directory), for
 * the same reason apiUsageCounter.js uses job over skill — many skills are
 * invoked by more than one job, and several jobs-runtime scripts back more
 * than one skill, so "skill" is an ambiguous key for exactly the runs most
 * worth auditing.
 *
 * This module does ONLY in-memory counting. Persisting a job's summary to
 * the `events` collection is tokenUsageTracker.js's job (mirrors
 * apiUsageTracker.js wrapping apiUsageCounter.js the same way).
 */

// Map<job, Map<model, {calls, inputTokens, outputTokens}>>
const byJob = new Map();

/**
 * Record one self-reported usage observation for a job.
 * @param {string} job - job name this observation is attributed to. A
 *   falsy job is a silent no-op, same as apiUsageCounter.record — tracking
 *   is opt-in, never a source of errors for an ad-hoc/manual run that
 *   didn't resolve a job name.
 * @param {Object} opts
 * @param {string} [opts.model] - model id/label (e.g. 'claude-sonnet-5',
 *   'agent-session'). Defaults to 'agent-session' — self-reported usage
 *   from an agent-executed skill run rarely maps to one exact model id the
 *   way a direct API call would, so an explicit generic default is used
 *   rather than guessing one.
 * @param {number} [opts.inputTokens] - non-negative integer, defaults 0.
 * @param {number} [opts.outputTokens] - non-negative integer, defaults 0.
 */
function record(job, { model, inputTokens = 0, outputTokens = 0 } = {}) {
  if (!job) return;
  const key = model || 'agent-session';
  const jobMap = byJob.get(job) || new Map();
  const entry = jobMap.get(key) || { calls: 0, inputTokens: 0, outputTokens: 0 };
  entry.calls += 1;
  entry.inputTokens += Math.max(0, Number(inputTokens) || 0);
  entry.outputTokens += Math.max(0, Number(outputTokens) || 0);
  jobMap.set(key, entry);
  byJob.set(job, jobMap);
}

/** Total tokens (input+output) recorded so far for this job, across all models. */
function totalTokens(job) {
  const jobMap = byJob.get(job);
  if (!jobMap) return 0;
  let total = 0;
  for (const { inputTokens, outputTokens } of jobMap.values()) total += inputTokens + outputTokens;
  return total;
}

/** Plain-object summary for one job: { job, byModel: {model: {calls, inputTokens, outputTokens}}, totalTokens }. */
function getSummary(job) {
  const jobMap = byJob.get(job) || new Map();
  const byModel = {};
  for (const [model, entry] of jobMap.entries()) byModel[model] = { ...entry };
  return { job, byModel, totalTokens: totalTokens(job) };
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

module.exports = { record, totalTokens, getSummary, activeJobs, resetJob, reset };
