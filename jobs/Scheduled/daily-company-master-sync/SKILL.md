---
name: daily-company-master-sync
description: Daily synchronization of company-master DB (cache/company-master.json) combining Stockscans company universe (sector/industry), Kite instruments dump, cross-exchange NSE/BSE mappings, and companies.json metadata
---

## Context

Daily synchronization of the company master database (`data/cache/company-master.json`) and reconciliation with `data/companies.json`. Combines:

1. **Stockscans Universe**: Fetches all companies from Stockscans (`/api/company/scans/run`) with sector and industry classifications, upserting them into `companies.json` (replacing the deprecated weekly sector/industry sync).
2. **Kite Connect Instruments**: Fetches the public Kite instruments CSV, pairs dual-listed companies across NSE and BSE by symbol and normalized legal name, overlays metadata, and backfills missing BSE scrip codes into `companies.json`.
3. **Enriched Company Master**: Builds `data/cache/company-master.json` enriched with clean names, sectors, and industries.

Runs daily at 10:00 PM (after market close and post-market filings).

## Execution Plan

Call the following exact script in order:

1. Execute script (via yarn Workspace Facade Pattern — AGENTS.md §5, never invoke node directly):

   `yarn company-master-sync`

   (equivalent to: `yarn workspace @stock/jobs-runtime company-master-sync` or `node packages/jobs-runtime/companyMasterSync.js`)

2. Read the JSON summary printed to stdout and report:
   - Stockscans companies fetched, inserted, and updated (with sector & industry)
   - Total companies indexed in company master
   - Dual-listed companies count
   - Companies with sector/industry coverage
   - Backfilled BSE scrip codes in `companies.json`

3. (If data changed) Execute: `yarn data:push`
   (idempotent, push-only — see `docs/DATA_RULES.md` §5), then include a "Files touched" section in the run summary.

4. (FINAL STEP ALWAYS) Execute script:
   `python scripts/metrics/track_invocation.py --name daily-company-master-sync --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`.

Do NOT run any data fetching, CSV parsing, or company reconciliation logic directly — the script above does all of that deterministically. Your only job is to run it and report its output.

This run is purely scripted (fetch/parse/normalize/upsert) — no LLM judgment step writes a DTO, so no `modelUsed` field is needed on any data record.

## Email delivery (mandatory last step of EVERY run)

The owner reads job output in Gmail, so this job must always end with an email — success, partial or failure, even when there was nothing new (a one-line "nothing to do" email is the heartbeat that proves the job ran).

1. Write the report text — the JSON summary printed by `company-master-sync` (counts added/updated/unmapped, any errors) — as markdown to a temp file _outside the repo_ (`f=$(mktemp)`). Keep it to what matters, lead with the headline.
2. Execute script (bash): `STOCKMARKET_JOB_NAME=daily-company-master-sync yarn job-report-email --job daily-company-master-sync --status <ok|partial|failed> --title "<one-line outcome>" --body-file "$f"`
3. If the run stopped early (a dependency check failed, a script exited non-zero), still run step 2 with `--status failed` and the exact error as the body.
4. If the command exits non-zero (`email.status` is `skipped` or `error`, e.g. `GOOGLE_APP_PASSWORD not set`), surface the exact reason in your final report — never report the job as delivered.
