---
name: watchlist-sync-stockmarket
description: Watchlist Sync — sync StockScans watchlists (Upcoming Results + Near Highs, weekdays only)
---

Before doing anything else, run `export STOCKMARKET_JOB_NAME=watchlist-sync-stockmarket` in the same shell/subshell that will invoke the skill's scripts — this attributes every outbound API call this run makes to the `watchlist-sync-stockmarket` job for the API-usage audit (see `skills/_shared/conventions.md` §23; the env var is required because this job's scripts are invoked several layers deep inside the shared skill below, not directly by this file).

Follow the `watchlist-sync` skill (stockmarket/skills/equity-research/watchlist-sync/SKILL.md) — read it from the local mounted repo path. Sync both watchlists:

1. **Upcoming Results**: `yarn watchlist-updater --scan-id 429918e3098ce660baec9f22 --watchlist-id 51a196a79dbc0296493e5174 --scan-name "Upcoming Results - DND" --watchlist-name "Upcoming Results"`
2. **Near Highs**: `yarn watchlist-updater` (default)

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`): execute `python scripts/metrics/track_invocation.py --name watchlist-sync-stockmarket --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`. No `modelUsed` needed on the sync records — `watchlistUpdater.js` requires no model judgment.

## Email delivery (mandatory last step of EVERY run)

The owner reads job output in Gmail, so this job must always end with an email — success, partial or failure, even when there was nothing new (a one-line "nothing to do" email is the heartbeat that proves the job ran).

1. Write the report text — watchlists synced, companies added/removed per watchlist, any errors — as markdown to a temp file _outside the repo_ (`f=$(mktemp)`). Keep it to what matters, lead with the headline.
2. Execute script (bash): `STOCKMARKET_JOB_NAME=watchlist-sync-stockmarket yarn job-report-email --job watchlist-sync-stockmarket --status <ok|partial|failed> --title "<one-line outcome>" --body-file "$f"`
3. If the run stopped early (a dependency check failed, a script exited non-zero), still run step 2 with `--status failed` and the exact error as the body.
4. If the command exits non-zero (`email.status` is `skipped` or `error`, e.g. `GOOGLE_APP_PASSWORD not set`), surface the exact reason in your final report — never report the job as delivered.
