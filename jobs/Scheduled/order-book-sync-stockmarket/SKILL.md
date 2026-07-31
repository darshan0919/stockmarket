---
name: order-book-sync-stockmarket
description: Order Book Sync — refresh the unexecuted order book and new order wins for every Radar watchlist company
---

Follow the `order-book-tracker` skill (stockmarket/skills/equity-research/order-book-tracker/SKILL.md) — read it from the local mounted repo path first; only fall back to the GitHub-hosted copy via `github-skill-invoker` if the local path is unavailable.

Run it in **sync mode**:

1. `yarn order-book-sync` — refreshes every company on the Radar watchlist. This is cache-first, so companies with no new concall and no new filings cost nothing.
2. Work the `needsAttention` list the run reports, following the skill's "Resolving what the scripts could not" section. Resolve each item once and record it, so it never comes back:
   - `needsLlmFallback` on the base → read the bullets in `llmFallbackPrompt` and call `recordLlmResolution`.
   - `pendingLlmFallback` announcements → read the cached PDF text and call `recordAnnouncementResolution`.
     Skip anything reported as `notApplicable` — that verdict is already settled and needs no judgment.
3. `yarn data:push`.
4. Report the run summary, including a "Files touched" section built from `db.touchedFiles()` and the `data:push` output — never from memory.

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`): execute `python scripts/metrics/track_invocation.py --name order-book-sync-stockmarket --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`. Set `modelUsed` on any record you resolved by judgment in step 2, since those did involve a model.
