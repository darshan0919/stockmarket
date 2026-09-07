---
name: post-close-scan-insights
description: Announcement Signals — a slot of the full-day corporate-filing signal engine over the "Signals - DND" Stockscans scan
---

You are running one **slot** of Darshan's Announcement Signals workflow
(stockmarket monorepo). This job fires several times a trading day; the slot is
passed in the task's own invocation (see "Which slot am I?" below).

Before doing anything else, run `export STOCKMARKET_JOB_NAME=post-close-scan-insights` in the same shell/subshell that will invoke `postCloseScanInsights.js` — this attributes every outbound API call this run makes (across all slots) to the `post-close-scan-insights` job for the API-usage audit (see `skills/_shared/conventions.md` §23; the env var is required because the script is invoked via the `run(){ node "$JOB" "$@"; }` shell helper below, not directly by this file).

Read `skills/equity-research/post-close-scan-insights/SKILL.md` from the local
mounted repo (only fall back to the GitHub copy via the router if the local path
is unavailable) and follow it strictly, in order. Read its
`references/thesis-rules.md` before writing any insight, and
`references/routing-rules.md` before marking anything routine — the SKILL.md
points at both, and skipping them is how the failure modes those files document
get repeated.

## Which slot am I?

Determine the slot from the current IST time, and pass it as `--slot` to both
`fetch-scan` and `send-digest`:

| IST now       | `--slot`       |
| ------------- | -------------- |
| 12:30 – 14:30 | `mid-session`  |
| 15:00 – 17:00 | `late-session` |
| 18:30 – 20:30 | `post-close`   |
| 21:00 – 22:30 | `night`        |
| anything else | `adhoc`        |

Do NOT pass `--window-hours` on a scheduled run — the shared cursor resolves the
window, and an explicit override would bypass it and re-cover ground a previous
slot already handled. Only use it for a deliberate catch-up after a genuinely
missed day.

## Sequence

1. **Setup** — resolve `packages/jobs-runtime/postCloseScanInsights.js` and
   `packages/jobs-runtime/watchlistInsights.js` per the skill's "Setup" section.
2. **Step 1** — `resolve-scan` (confirm the universe), then
   `fetch-scan --slot <slot>`. **If the output's `scanSource` is not `live`, say
   so prominently in the run report** — a cache or fallback run is scanning a
   possibly-stale universe. Carry `windowStartIstHuman` through to Step 7's
   `--cutoff-human`.
3. **Step 2** — `filter-noise`, then `categorise`. Record `dropped.length` for
   the footer's keyword-filter stat.
4. **Step 3** — route each item: skip `alreadyProcessed`, `log-heavy-skip` +
   `mark-processed` for heavy documents, otherwise run `announcement-insights`
   Steps 1-4. Respect the depth rule (`deep` for the four
   `HIGH_CONVICTION_CATEGORIES`, `standard` otherwise) and the
   `usecase: "announcement-insights:<depth>"` tagging rule.
5. **Step 4** — apply the four thesis rules from `references/thesis-rules.md`:
   J-curve focus (call `rerating-catalysts --mode brief` when the filing alone
   can't tell you whether the sunk cost is already in the base), PAT-before-EPS
   reasoning, `ask-soic` for framework questions, and a merged headline for any
   card that clubs several of one company's filings.
6. **Step 5** — info-classify the top 5 by signal score.
7. **Step 7** — `send-digest --slot <slot> --cutoff-human <...> --stats-file <...>`
   plus `--knowledge-gaps <...>` if any gaps were hit. Assemble the stats file
   across Steps 1-4 and check it reconciles against `total`.
8. **Step 8** — `commit-window` (ONLY if everything above completed cleanly),
   then `yarn data:push` (mandatory even on partial failure).

Do NOT run any logic directly — every fetch, filter, categorisation, PDF read,
note write and digest send goes through the documented commands. This job prompt
is orchestration only.

Rules: follow the skill's "Rules" section verbatim — files-touched manifest, one
PDF at a time (no title-only insights), correct `usecase` tagging, funnel
reconciliation, all outputs under `data/`, and a concrete evidence-based
token-optimization suggestion at the end.

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`):
execute `python scripts/metrics/track_invocation.py --name post-close-scan-insights --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`,
and set that same model string as `modelUsed` on every note this run writes via
`add-note`.
