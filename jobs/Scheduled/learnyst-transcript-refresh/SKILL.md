---
name: learnyst-transcript-refresh
description: Learnyst Transcript & Attachment Refresh — fetches AI transcripts and lesson attachments (PDFs, spreadsheets) across all configured Learnyst memberships (SOIC, Chartitude, ...), cache-first
---

## Context

Weekly refresh of AI-generated transcripts and downloadable attachments
(presentation slide PDFs, Excel models, etc.) for Darshan's Learnyst course
video libraries — every site configured via `LEARNYST_<KEY>_*` env vars (see
`.env.example` and `docs/learnyst-api-schemas.md`), currently SOIC Membership
(school 110998, bundle 97666, ~15 modules) and Chartitude Membership
(learn.chartitude.com). The script (`learnystTranscriptRefresh.js`,
`packages/jobs-runtime/`) loops over every configured site in one run and
prints a combined summary; a site with no auth token set is skipped, not
errored — adding a new membership later needs only new env vars, not a
change to this task. Cache-first: only lessons and attachments not already
cached get fetched (attachments saved to `data/assets/learnyst-attachments/`),
so a run with no new content across all sites is a near-no-op. Personal course
content, not stock-research data — no company scoping. Supports
`--skip-attachments` and `--attachments-only` CLI flags.

## Execution Plan

Call the following exact script:

1. Execute script (bash): `yarn learnyst-transcript-refresh` (runs every
   configured site in one process — do not pass `--site` unless the user
   explicitly asked to refresh only one membership).
2. Read the combined JSON run summary the script prints to stdout and
   report: `sitesProcessed`, `lessonsFetched` (new this run) vs
   `lessonsCachedSkipped` (already had), `attachmentsDownloaded` vs
   `attachmentsCachedSkipped`, `modulesProcessed`, any
   `modulesFailed`/`lessonsFailed`/`attachmentsFailed` entries (each tagged
   with its `site`), and the "Files touched" list the script prints (per
   DATA_RULES.md §7 — sourced from `db.touchedFiles()`, do not reconstruct
   from memory). Also note any "Skipping site ..." lines (missing auth token,
   or missing schoolId/bundleId) — that's an unconfigured site, not a failure.
3. If any failure in `lessonsFailed`/`modulesFailed` contains "authentication
   failed" / "LEARNYST\_<KEY>\_AUTH_TOKEN is likely expired", stop and clearly
   flag in the report which site's token needs manual refresh (see
   `docs/learnyst-api-schemas.md` — DevTools steps) rather than retrying.
4. Execute: `yarn data:push` (idempotent, push-only — docs/DATA_RULES.md §5).
5. End the report with a one-line token/cost-reduction suggestion for next
   run, based on what actually happened this run (conventions.md §11) — e.g.
   if `lessonsCachedSkipped` is high relative to `lessonsFetched`, note that
   the cache-first design is already doing its job and there's nothing
   further to optimize; if a module consistently 0-fetches, that's a signal
   it could move to a slower/less-frequent check.

Do NOT run any logic, calculations, data fetching, or file modifications
directly. Your only job is to orchestrate the script above exactly as
specified and report its output. Purely scripted extraction — no LLM
judgment anywhere in this pipeline, so no `modelUsed` is set on any record it
writes (conventions.md §17).

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`):
execute `python scripts/metrics/track_invocation.py --name learnyst-transcript-refresh --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`.
