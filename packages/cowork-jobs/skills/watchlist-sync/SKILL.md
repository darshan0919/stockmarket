---
name: watchlist-sync
description: Sync a Stockscans watchlist from a saved scan — fetch all scan companies, exclude a Radar list, replace the target watchlist by diff, and email a summary. Invoke with defaults for the nightly "Near Highs" sync, or pass custom scan/watchlist IDs on demand.
---

# Watchlist Sync

Thin wrapper over the deterministic companion job `watchlistUpdater.js`. The job does
everything (fetch → diff → apply → email); this skill just invokes it with the right
parameters. No model judgment is required.

## Parameters (all optional — omit for the nightly default)

| Param | Default | Meaning |
|---|---|---|
| `sourceScanId` | `9493efc2c969d602c5dedbe2` (Chartist Near High Scan) | scan to pull companies from |
| `targetWatchlistId` | `0a365ec2139aa6ca7f74c250` (Near Highs) | watchlist to replace |
| `radarWatchlistId` | `7ca0e1a60c3fd0d8b1ab61ce` (Radar) | companies to exclude |
| `dryRun` | `false` | compute + print the diff without applying or emailing |

> The defaults are baked into `watchlistUpdater.js`; only pass overrides you actually
> want to change. (Custom scan/watchlist IDs require the job to support flags — for now
> override by editing the constants or running a `--dry-run` preview.)

## Setup

```bash
JOB=$(find /sessions -path '*cowork-jobs/watchlistUpdater.js' 2>/dev/null | head -1)
DATA="$(dirname "$JOB")/data"   # data + .env now live with the jobs in the monorepo
export COWORK_ENV="$DATA/.env"        # STOCKSCANS_AUTH_TOKEN + GOOGLE_APP_PASSWORD live here
```

## Run

Default (nightly):
```bash
node "$JOB"
```

On-demand dry run (preview the add/remove diff, no changes, no email):
```bash
node "$JOB" --dry-run
```

## Output

The job prints a step log and the final `added / removed / final count`, and emails a
✅/❌ summary. Report that summary back; nothing else to do.
