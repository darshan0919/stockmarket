'use strict';

/**
 * tokenUsageTracker.js — the job-facing token-usage tracking surface.
 *
 * Thin wrapper over ./tokenUsageCounter.js, mirroring
 * lib/apiUsageTracker.js's relationship to cloud-utils's apiUsageCounter.js
 * (see that module's header for the full design rationale — job-level
 * attribution, no ambient "active job" global, explicit jobName argument
 * everywhere). This module adds the one thing the counter can't do itself:
 * persisting a job's summary to the `events` collection via lib/db.js.
 *
 * Producer of the numbers this tracks: conventions.md §24 requires every
 * job/skill run to end with a self-reported token-usage observation — the
 * AGENT executing the run notes what it observed about its own token
 * consumption (e.g. from the session's own usage signal) and persists it
 * via `node recordTokenUsage.js --job <name> --input <n> --output <n>`
 * (see that script). This is NOT a script calling an LLM provider API —
 * conventions.md §24 (like Darshan's ruling that removed
 * `lib/anthropicClient.js`) forbids that outright. It is the agent
 * recording a number about itself, the same way a human would fill in a
 * timesheet — mechanical persistence, not LLM reasoning, so it stays
 * script-first per §17.
 */

const counter = require('./tokenUsageCounter');

const { record, totalTokens, getSummary, activeJobs, resetJob, reset } = counter;

/**
 * Persist one job's summary to the `events` collection
 * (type: token_usage_summary) via lib/db.js, per DATA_RULES §2 (a new
 * `type` inside an existing collection, not a new collection) — same
 * pattern as apiUsageTracker.js's flush().
 * No-ops (returns null) if the job has zero recorded tokens this process.
 *
 * @param {string} jobName - the job whose usage to flush (required — no
 *   "current"/ambient job to default to).
 * @param {Object} [opts]
 * @param {string} [opts.date] - YYYY-MM-DD market/run date; defaults to IST today.
 * @param {string} [opts.note] - optional free-text note about this
 *   observation (e.g. how it was measured — "session <total_tokens>
 *   delta", "estimated from prompt+output char count").
 * @param {number} [opts.durationMs] - optional wall-clock duration of the
 *   run this token usage came from, in milliseconds. Piggybacks on this
 *   already-adopted self-report step (conventions.md §24) rather than
 *   requiring a second, separate timing call — a job's SKILL.md/script
 *   wraps its own start (`Date.now()` at the top of `main()`) and end
 *   (`Date.now()` right before this flush) and passes the delta through
 *   `recordTokenUsage.js --duration-ms <n>` / `track_invocation.py`'s
 *   equivalent flag. Absent when the caller doesn't track it — never
 *   estimated or backfilled.
 * @returns {Object|null} the appendEvents stats, or null if nothing to persist.
 */
function flush(jobName, { date, note, durationMs } = {}) {
  if (!jobName) return null;
  const summary = getSummary(jobName);
  if (summary.totalTokens === 0) return null;

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
    type: 'token_usage_summary',
    date: runDate,
    job: jobName,
    byModel: summary.byModel,
    totalTokens: summary.totalTokens,
    ...(note ? { note } : {}),
    ...(Number.isFinite(durationMs) && durationMs >= 0 ? { durationMs } : {}),
  };
  const stats = db.appendEvents([eventRecord], { creator: jobName });
  resetJob(jobName); // free the in-memory bucket now that it's durably persisted
  return stats;
}

module.exports = { record, totalTokens, getSummary, activeJobs, flush, reset };
