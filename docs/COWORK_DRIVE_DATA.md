# Cowork Jobs Drive Data Store

Generated cowork job data is stored as local files during job execution, then mirrored to
a Google Drive synced folder. This keeps the jobs simple, avoids a paid MongoDB tier for
append/read daily reports, and makes a new computer restore a `data:pull` operation.

This is a file-backed document store, not a query database. It is a good fit for:

- daily snapshots and reports
- ledgers, proposals, and append-style logs
- source/reference caches that jobs read before regenerating
- human-inspectable JSON, CSV, Markdown, and text files

It is not the right backing store for live user-facing screens that need low-latency
queries, concurrent writes from many users, joins, or transactional updates.

## Owner

Drive owner/account:

```text
djplearner@gmail.com
```

Default Drive database root:

```text
StockMarket/cowork-jobs/v1
```

When Google Drive for Desktop is mounted on macOS, the full path is usually:

```text
~/Library/CloudStorage/GoogleDrive-djplearner@gmail.com/My Drive/StockMarket/cowork-jobs/v1
```

If auto-detection does not find it, set `COWORK_DRIVE_ROOT` explicitly.

## Local To Drive Mapping

The jobs keep using the existing local layout under:

```text
packages/cowork-jobs/data
```

The Drive store maps those files into a partitioned structure:

```text
StockMarket/cowork-jobs/v1/
  _meta/
    database.json
    documents.jsonl
  notes/
    current_run.txt
    snapshots/YYYY/MM/notes_*.json
  gainers/
    YYYY/MM/DD/gainers_raw.json
    YYYY/MM/DD/insights.json
  market-data/
    nse-delivery/YYYY/MM/sec_bhavdata_full_DDMMYYYY.csv
  reference/
    bse_scrip_codes.json
  validation/
    ledger/ledger.json
    proposals/proposals.md
    sector-context/YYYY/MM/sector_context_YYYYMMDD.json
    ignored-log/YYYY/MM/ignored_log_YYYYMMDD.json
  legacy/
    company_notes.json
```

The local files are intentionally backward-compatible with the existing jobs:

- `notes/notes_*.json`
- `notes/.current_run`
- `daily_gainers/*_gainers_raw.json`
- `daily_gainers/*_insights.json`
- `delivery_cache/sec_bhavdata_full_*.csv`
- `delivery_cache/bse_scrip_codes.json`
- `validation/ledger.json`
- `validation/proposals.md`
- `validation/sector_context_*.json`
- `validation/ignored_log_*.json`
- `company_notes.json`

Secrets and code helpers are not mirrored:

- `.env`
- `.env.example`
- `*.py`

## Document DTO

Every indexed document is represented in `_meta/documents.jsonl` as one JSON object:

```json
{
  "schemaVersion": "cowork-drive-store.v1",
  "id": "gainers-raw:daily_gainers/2026-06-26_gainers_raw.json",
  "ownerEmail": "djplearner@gmail.com",
  "kind": "daily-report",
  "category": "gainers-raw",
  "producer": "gainersScanner",
  "date": "2026-06-26",
  "retention": "keep",
  "localRel": "daily_gainers/2026-06-26_gainers_raw.json",
  "driveRel": "gainers/2026/06/26/gainers_raw.json",
  "storeRel": "gainers/2026/06/26/gainers_raw.json",
  "contentType": "application/json",
  "sizeBytes": 12345,
  "sha256": "...",
  "modifiedAt": "2026-06-26T03:00:00.000Z",
  "indexedAt": "2026-06-28T10:00:00.000Z"
}
```

The DTO is designed for migration and audits: `localRel` restores the old job layout,
`driveRel` is the portable document address, and `sha256` lets us detect changes even
when file timestamps are close.

## Commands

From the repository root:

```bash
yarn cowork:data:doctor
yarn cowork:data:init
yarn cowork:data:pull
yarn cowork:data:push
yarn cowork:data:sync
yarn cowork:data:manifest
```

Or from the workspace:

```bash
yarn workspace @stock/cowork-jobs data:doctor
yarn workspace @stock/cowork-jobs data:init
yarn workspace @stock/cowork-jobs data:pull
yarn workspace @stock/cowork-jobs data:push
yarn workspace @stock/cowork-jobs data:sync
yarn workspace @stock/cowork-jobs data:manifest
```

Use `data:doctor` first. If `driveRoot` is `null` or `driveRootExists` is `false`, mount
Google Drive for Desktop or set `COWORK_DRIVE_ROOT`.

## Environment

`packages/cowork-jobs/data/.env.example` contains the Drive settings:

```bash
COWORK_DRIVE_EMAIL=djplearner@gmail.com
COWORK_DRIVE_SYNC=1
# COWORK_DRIVE_ROOT=/absolute/path/to/Google Drive/StockMarket/cowork-jobs/v1
# COWORK_DRIVE_LOG=1
# COWORK_DRIVE_STRICT=1
```

Recommended job exports:

```bash
export COWORK_DATA_DIR="/absolute/path/to/packages/cowork-jobs/data"
export COWORK_ENV="$COWORK_DATA_DIR/.env"
export COWORK_DRIVE_EMAIL="djplearner@gmail.com"
```

Set `COWORK_DRIVE_STRICT=1` for scheduled jobs if a missing Drive mount should fail the
job instead of silently running local-only.

## New Computer Restore

1. Clone the repo and install dependencies.
2. Install Google Drive for Desktop and sign in as `djplearner@gmail.com`.
3. Create `packages/cowork-jobs/data/.env` from `.env.example`; do not store secrets in Git or Drive.
4. Run `yarn cowork:data:doctor`.
5. If Drive is detected, run `yarn cowork:data:pull`.
6. Run the relevant cowork job.

## Git Policy

Daily generated data should not be committed to Git. The repo now ignores the runtime
data folders under `packages/cowork-jobs/data`.

At daily frequency, Git will keep every historical blob forever and the repo will grow
even when files are deleted later. Google Drive is the better home for this workload:
the files are mostly immutable daily documents, human-inspectable, easy to copy, and
do not need MongoDB query features.

If a generated data file is already tracked by Git, `.gitignore` prevents new untracked
files but does not remove existing tracked history. Untracking existing data should be a
separate cleanup decision so we do not accidentally delete local working data.
