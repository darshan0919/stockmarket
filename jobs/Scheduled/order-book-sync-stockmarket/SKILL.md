---
name: order-book-sync-stockmarket
description: Order Book Sync — refresh the unexecuted order book and new order wins for every Radar watchlist company
model: flash
---

Follow the `order-book-tracker` skill (stockmarket/skills/equity-research/order-book-tracker/SKILL.md) — read it from the local mounted repo path.

Run it in **sync mode**:

1. `yarn order-book-sync --job order-book-sync-stockmarket` — refreshes every company on the Radar watchlist. This is cache-first, so companies with no new concall and no new filings cost nothing. (The `--job` flag attributes this run's outbound API calls to the `order-book-sync-stockmarket` job for the API-usage audit — see `skills/_shared/conventions.md` §23.)
2. Work the `needsAttention` list the run reports, following the skill's "Resolving what the scripts could not" section. Resolve each item once and record it, so it never comes back:
   - `needsLlmFallback` on the base → read the bullets in `llmFallbackPrompt` and call `recordLlmResolution`.
   - `pendingLlmFallback` announcements → read the cached PDF text and call `recordAnnouncementResolution`.
     Skip anything reported as `notApplicable` — that verdict is already settled and needs no judgment.
3. `yarn data:push`.
4. Report the run summary, including a "Files touched" section built from `db.touchedFiles()` and the `data:push` output — never from memory.

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`): execute `python scripts/metrics/track_invocation.py --name order-book-sync-stockmarket --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`. Set `modelUsed` on any record you resolved by judgment in step 2, since those did involve a model.

## Email delivery (mandatory last step of EVERY run)

The owner reads job output in Gmail, so this job must always end with an email — success, partial or failure, even when there was nothing new (a one-line "nothing to do" email is the heartbeat that proves the job ran).

1. Write the report text — companies refreshed, new order wins found (company, size, customer), errors — as markdown to a temp file _outside the repo_ (`f=$(mktemp)`). Keep it to what matters, lead with the headline.
2. Execute script (bash): `STOCKMARKET_JOB_NAME=order-book-sync-stockmarket yarn job-report-email --job order-book-sync-stockmarket --status <ok|partial|failed> --title "<one-line outcome>" --body-file "$f"`
3. If the run stopped early (a dependency check failed, a script exited non-zero), still run step 2 with `--status failed` and the exact error as the body.
4. If the command exits non-zero (`email.status` is `skipped` or `error`, e.g. `GOOGLE_APP_PASSWORD not set`), surface the exact reason in your final report — never report the job as delivered.
