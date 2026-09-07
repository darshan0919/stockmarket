'use strict';

/**
 * scriptJobName.js — resolve which JOB a CLI script's run should be
 * attributed to for API-usage tracking (see lib/apiUsageTracker.js).
 *
 * Job-level, not skill-level (changed 2026-09-06): a "job" is a
 * jobs/Scheduled/<name> directory name — the actual 1:1 unit with a cron
 * schedule and one outbound email. Many jobs-runtime scripts are shared
 * across MULTIPLE skills, and some skills are in turn invoked by MULTIPLE
 * jobs (watchlistInsights.js backs gainers-signal, volume-rocketing,
 * announcement-insights, and more; postCloseScanInsights.js is invoked by
 * five separate slot jobs — mid-session/late-session/post-close/night/adhoc
 * — plus post-close-day-recap) — a single hardcoded default per script file
 * would silently mis-attribute every one of those callers except whichever
 * is treated as "primary". Resolution order:
 *
 *   1. `STOCKMARKET_JOB_NAME` environment variable — the PRIMARY mechanism.
 *      Most job SKILL.md files don't call a jobs-runtime script directly;
 *      they say "follow the <x> skill", and that skill's OWN SKILL.md is
 *      what actually invokes `node script.js` or `yarn <alias>` — often
 *      several layers of shell function/subshell deep (see e.g.
 *      post-close-scan-insights/SKILL.md's `run(){ node "$JOB" "$@"; }`
 *      helper, or volume-rocketing's `$RUNTIME/watchlistInsights.js` calls).
 *      An env var set once at the top of the JOB's own SKILL.md — the one
 *      file that actually knows its own jobs/Scheduled/<name> identity —
 *      propagates through every one of those layers for free, with zero
 *      changes needed to the shared skill files in between. Every job's
 *      SKILL.md sets this via `export STOCKMARKET_JOB_NAME=<job-directory-name>`
 *      as its first orchestration step.
 *   2. explicit `--job <name>` CLI flag — for a script invoked directly
 *      (no shared-skill indirection) or a manual/ad-hoc run that wants to
 *      claim a specific job identity without exporting an env var.
 *   3. the script's own default (`defaultJob` param) — used for direct/
 *      manual runs (`node gainersScanner.js`) where nothing else was set.
 *
 * This mirrors conventions.md §21/§23's "explicit, never a silent default"
 * principle: the default here is a *documented fallback for direct runs*,
 * not a silent mis-attribution — any scheduled run is expected to have
 * STOCKMARKET_JOB_NAME set by its own job SKILL.md.
 *
 * @param {string} defaultJob - fallback job name for a direct/manual run.
 * @param {string[]} [argv] - defaults to process.argv.
 * @param {Object} [env] - defaults to process.env.
 * @returns {string}
 */
function resolveJobName(defaultJob, argv = process.argv, env = process.env) {
  if (env.STOCKMARKET_JOB_NAME) return env.STOCKMARKET_JOB_NAME;
  const i = argv.indexOf('--job');
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith('--job='));
  if (eq) return eq.slice('--job='.length);
  return defaultJob;
}

module.exports = { resolveJobName };
