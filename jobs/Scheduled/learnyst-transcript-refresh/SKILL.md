---
name: learnyst-transcript-refresh
description: Learnyst Transcript Refresh — fetches AI transcripts for new video lessons across Darshan's SOIC Membership, cache-first
---

## Context

Weekly refresh of AI-generated transcripts for Darshan's Learnyst course
video library (SOIC Membership, school 110998, bundle 97666, ~15 modules).
Cache-first: only lessons not already in the `learnyst-lessons` collection
get fetched, so a run with no new content is a near-no-op. Personal course
content, not stock-research data — no company scoping.

## Execution Plan

Call the following exact script:

1. Execute script (bash): `yarn learnyst-transcript-refresh`
2. Read the JSON run summary the script prints to stdout and report:
   `lessonsFetched` (new this run) vs `lessonsCachedSkipped` (already had),
   `modulesProcessed`, any `modulesFailed`/`lessonsFailed` entries, and the
   "Files touched" list the script prints (per DATA_RULES.md §7 — sourced
   from `db.touchedFiles()`, do not reconstruct from memory).
3. If any failure in `lessonsFailed`/`modulesFailed` contains "authentication
   failed" / "LEARNYST_AUTH_TOKEN is likely expired", stop and clearly flag
   in the report that the token needs manual refresh (see
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
