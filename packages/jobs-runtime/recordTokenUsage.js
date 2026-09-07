#!/usr/bin/env node
'use strict';

/**
 * recordTokenUsage.js — self-report a job/skill run's observed token usage.
 *
 * The producer side of conventions.md §24. There is no script in this repo
 * that calls an LLM provider API directly (that pattern was removed —
 * see `lib/anthropicClient.js`'s deletion and Darshan's ruling against a
 * `lib/gemini.js` stored-key client in the preprocessing-pipeline-plan
 * project memory), so there is no `usage.input_tokens`/`usage.output_tokens`
 * a script can read off an API response the way apiUsageTracker.js's HTTP
 * calls can be counted automatically. The only place that knows what an
 * agent-executed skill run actually cost in tokens is the agent itself —
 * this script is how it self-reports that number at the end of a run, the
 * same way conventions.md §11 already requires every skill to end with a
 * qualitative token-optimization suggestion; this is the quantitative
 * counterpart that makes §11's suggestions checkable against real numbers
 * over time instead of staying anecdotal.
 *
 * Usage (from a skill's own instructions, its LAST step before finishing):
 *   node recordTokenUsage.js --job <job-directory-name> \
 *     --input <observed-input-tokens> --output <observed-output-tokens> \
 *     [--model <label>] [--note "how this was observed"] \
 *     [--duration-ms <run-wall-clock-milliseconds>]
 *
 * Or via the registered yarn command:
 *   yarn record-token-usage --job <name> --input <n> --output <n>
 *
 * `--job` resolution follows the exact same rule as every other
 * job-attributed script in this repo (lib/scriptJobName.js): prefer the
 * `STOCKMARKET_JOB_NAME` env var a job's SKILL.md already exports as its
 * first orchestration step, fall back to an explicit `--job` flag, then to
 * a documented default for a direct/manual run — never a silent guess.
 *
 * This performs ONE record() + immediate flush() (not an accumulate-then-
 * flush-later pattern like apiUsageTracker, which persists inside a
 * process that made many HTTP calls) — a self-report is typically the
 * agent's single closing observation about the whole run, not something
 * called repeatedly within one process.
 */

const { resolveJobName } = require('./lib/scriptJobName');
const tokenUsageTracker = require('./lib/tokenUsageTracker');
const cacheUsageTracker = require('./lib/cacheUsageTracker');
const deliveryUsageTracker = require('./lib/deliveryUsageTracker');
const extractionQualityTracker = require('./lib/extractionQualityTracker');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--job') out.job = argv[++i];
    else if (a === '--input') out.input = Number(argv[++i]);
    else if (a === '--output') out.output = Number(argv[++i]);
    else if (a === '--model') out.model = argv[++i];
    else if (a === '--note') out.note = argv[++i];
    else if (a === '--date') out.date = argv[++i];
    else if (a === '--duration-ms') out.durationMs = Number(argv[++i]);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const jobName = resolveJobName('manual-token-usage-report', process.argv);
  const inputTokens = Number.isFinite(args.input) ? args.input : 0;
  const outputTokens = Number.isFinite(args.output) ? args.output : 0;

  if (inputTokens === 0 && outputTokens === 0) {
    console.error(
      'recordTokenUsage.js: refusing to record a zero-token observation — pass --input and/or --output.'
    );
    process.exitCode = 1;
    return;
  }

  tokenUsageTracker.record(jobName, {
    model: args.model,
    inputTokens,
    outputTokens,
  });
  const stats = tokenUsageTracker.flush(jobName, {
    date: args.date,
    note: args.note,
    durationMs: Number.isFinite(args.durationMs) ? args.durationMs : undefined,
  });

  if (!stats) {
    console.error(`recordTokenUsage.js: nothing flushed for job "${jobName}" (unexpected).`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Recorded token usage for job "${jobName}": ${inputTokens} in + ${outputTokens} out = ${
      inputTokens + outputTokens
    } total.`
  );

  // Piggyback the cache-usage flush onto this same "final step" call site
  // (conventions.md §25) rather than requiring a second call every job's
  // SKILL.md would need to remember to add — cacheUsageCounter accumulates
  // in-process from resolveFilingContent.js calls made earlier in this same
  // run, so by the time this script runs (the documented final step) it has
  // whatever this run actually looked up, if anything. A no-op when the run
  // never called resolveFilingContent.
  const cacheStats = cacheUsageTracker.flush(jobName, { date: args.date });
  if (cacheStats) {
    console.log(`Recorded cache usage for job "${jobName}" alongside it.`);
  }

  const deliveryStats = deliveryUsageTracker.flush(jobName, { date: args.date });
  if (deliveryStats) {
    console.log(`Recorded email delivery usage for job "${jobName}" alongside it.`);
  }

  const extractionQualityStats = extractionQualityTracker.flush(jobName, { date: args.date });
  if (extractionQualityStats) {
    console.log(`Recorded extraction-quality summary for job "${jobName}" alongside it.`);
  }
}

if (require.main === module) main();

module.exports = { main, parseArgs };
