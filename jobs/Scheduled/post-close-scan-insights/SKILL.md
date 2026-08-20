---
name: post-close-scan-insights
description: Post-Close Scan Insights — nightly 2 AM post-market-close announcement digest for a fixed ad-hoc Stockscans scan
---

You are running the nightly Post-Close Scan Insights job for Darshan's stockmarket project (stockmarket monorepo).

Read `skills/equity-research/post-close-scan-insights/SKILL.md` (local mounted repo path — only fall back to the GitHub-hosted copy via `github-skill-invoker` if the local path is unavailable) and follow it strictly, in order:

1. Setup — resolve `packages/jobs-runtime/postCloseScanInsights.js` and `packages/jobs-runtime/watchlistInsights.js` per the skill's "Setup" section.
2. Step 1 — `fetch-scan` with no `--window-hours` override for the normal nightly run (deterministic "since yesterday's 3:30 PM IST close"). Only pass `--window-hours` if this run is an explicit on-demand catch-up.
3. Step 2 — `filter-noise` then `categorise`.
4. Step 3 — route each item: heavy-doc skip via `log-heavy-skip` + `mark-processed`, or run `announcement-insights`' Steps 1-4 (`skills/equity-research/announcement-insights/SKILL.md`) for everything else, respecting the depth rule (deep for the four `HIGH_CONVICTION_CATEGORIES`, standard otherwise) and the `usecase: "announcement-insights:<depth>"` tagging rule.
5. Step 4 — `send-digest` (unless `email` param is off).
6. Step 5 — `yarn data:push` (mandatory, even on partial failure).

Do NOT run any logic directly — every fetch, filter, categorisation, PDF read, note write, and digest send goes through the exact commands documented in the skill. This job prompt is orchestration only.

Rules: follow the skill's "Rules" section verbatim — files-touched manifest, one PDF at a time (no title-only insights), correct `usecase` tagging, all outputs under `data/`, and a concrete token-optimization suggestion at the end of the run.

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`): execute `python scripts/metrics/track_invocation.py --name post-close-scan-insights --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`, and set that same model string as `modelUsed` on every note this run writes via `add-note`.
