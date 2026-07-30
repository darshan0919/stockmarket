---
name: watchlist-sync-stockmarket
description: Watchlist Sync — sync StockScans watchlists (Upcoming Results + Near Highs)
---

Follow the `watchlist-sync` skill (stockmarket/skills/equity-research/watchlist-sync/SKILL.md) — read it from the local mounted repo path first; only fall back to the GitHub-hosted copy via `github-skill-invoker` if the local path is unavailable.

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`): execute `python scripts/metrics/track_invocation.py --name watchlist-sync-stockmarket --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`. No `modelUsed` needed on the sync records — `watchlistUpdater.js` requires no model judgment.
