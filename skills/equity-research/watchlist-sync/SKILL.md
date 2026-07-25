---
name: watchlist-sync
description: Sync a Stockscans watchlist from a saved scan — fetch the scan's companies (using its own saved filters), exclude a Radar list, replace the target watchlist by diff, and email a summary. Invoke with defaults for the nightly "Near Highs" sync, or pass any scan/watchlist ID pair. ID-agnostic — the caller supplies the mapping.
---

# Watchlist Sync

Thin wrapper over the deterministic companion job `watchlistUpdater.js`. The job does
everything (fetch → diff → apply → email); this skill just invokes it with the right
flags. No model judgment is required.

The job is **agnostic of any specific scan/watchlist** — pass the pair you want. To sync
several watchlists, the caller (e.g. a scheduled task prompt) holds the list of mappings
and invokes the job once per pair. Do NOT hardcode specific IDs in this skill.

## Flags (all optional — omit for the nightly Near Highs default)

| Flag               | Default                                 | Meaning                                               |
| ------------------ | --------------------------------------- | ----------------------------------------------------- |
| `--scan-id`        | `9493efc2c969d602c5dedbe2` (Near Highs) | scan to pull companies from                           |
| `--watchlist-id`   | `0a365ec2139aa6ca7f74c250` (Near Highs) | watchlist to replace                                  |
| `--scan-name`      | `Chartist Near High Scan`               | label used in logs/email                              |
| `--watchlist-name` | `Near Highs`                            | label used in logs/email                              |
| `--radar-id`       | `7ca0e1a60c3fd0d8b1ab61ce` (Radar)      | watchlist of companies to exclude                     |
| `--dry-run`        | off                                     | compute + print the diff without applying or emailing |

> Any **non-default** `--scan-id` runs with that scan's OWN saved definition/filters
> (fetched from Stockscans), not the built-in Near-High filter payload. The default scan
> keeps its original proven path. This matters: `runScan` sends the payload's filters, so
> a different `--scan-id` without this handling would silently reuse the wrong filters.

## Setup

```bash
JOB=$(find /sessions -name watchlistUpdater.js -not -path '*/node_modules/*' 2>/dev/null | head -1)
ENV="$(dirname "$(dirname "$JOB")")/.env"           # repo-root .env
[ -f "$ENV" ] || ENV="$(dirname "$JOB")/data/.env"  # fallback
export COWORK_ENV="$ENV"        # STOCKSCANS_AUTH_TOKEN + GOOGLE_APP_PASSWORD live here
```

## Run

Default (nightly Near Highs):

```bash
node "$JOB"
```

A specific scan → watchlist pair:

```bash
node "$JOB" --scan-id <scanId> --watchlist-id <watchlistId> \
            --scan-name "<label>" --watchlist-name "<label>"
```

Preview only (no changes, no email) — add `--dry-run` to any command.

## Output

The job prints a step log and the final `added / removed / final count`. Before emailing
the ✅/❌ summary, it now writes the canonical JSON DTO to
`the events collection (type=`watchlist-sync`); legacy path data/runs/{date}_{watchlistName}_watchlist_sync.json` — a top-level
`records[]` array with one entry per ticker added or removed, each carrying `companyId`,
`change` (`added`/`removed`), `creationTime`, `modifiedTime`, and
`creator: "watchlist-sync"` (see `skills/tooling/output-dto-standard/SKILL.md`), plus
run-level fields (`scanName`, `watchlistName`, counts). The summary email is a render of
that file, not a second independent source of facts. Not written on `--dry-run`, since no
change is applied in that mode. When running several mappings, report each mapping's
summary (and its DTO path) and a combined total.
