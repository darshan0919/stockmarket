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
