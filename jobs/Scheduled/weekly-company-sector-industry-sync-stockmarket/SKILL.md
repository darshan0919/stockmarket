---
name: weekly-company-sector-industry-sync-stockmarket
description: Weekly sync of sector/industry classification for every company in the company-master DB
---

## Context

Weekly sync of sector/industry classification for every company in the stockmarket company-master DB (`data/companies.json`), sourced from Stockscans' `/api/company/scans/run` scan endpoint. This keeps sector/industry current for later sector/industry-specific KPI and valuation-metric reporting.

## Execution Plan

Call the following exact script in order:

1. Execute script (via the yarn workspace command — Workspace Facade Pattern, AGENTS.md §4-7, never invoke node directly):

   `yarn workspace @stock/api sync-company-sector-industry`

   (equivalent to: `node stock-api/bin/sync-company-sector-industry.js`)

   IMPORTANT rate-limit note baked into the script already, but reiterate in case a fallback/manual run is needed: this endpoint's rate limiter bans for several minutes (confirmed ~8-9 min) after roughly 40-90 requests regardless of concurrency. The script defaults to sequential fetching (concurrency 1, ~1s between pages) with automatic exponential-backoff retry on HTTP 429 (up to ~8.5 min cumulative backoff) — do NOT pass a higher `--concurrency` or lower `--page-delay-ms` without re-confirming the rate limit live first. A full run covers ~6500 companies across ~130 pages and takes roughly 5-15 minutes end-to-end depending on how many 429 backoffs occur.

2. (if the script reports it wrote data — check `dbStats.inserted`/`updated` in its JSON summary) Execute: `yarn data:push` (idempotent, push-only — see `docs/DATA_RULES.md` §5), then include a "Files touched" section in the run summary listing every file created or modified (the script's own `touchedFiles` field plus the push `↑` lines — `docs/DATA_RULES.md` §7).

3. (FINAL STEP ALWAYS) Execute script: `python scripts/metrics/track_invocation.py --name weekly-company-sector-industry-sync-stockmarket --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`.

Do NOT run any logic, calculations, data fetching, or file modifications directly — the script above does all of that deterministically. Your only job is to run it and report its output (the JSON summary it prints, plus the `data:push` output and files-touched manifest).

This run is purely scripted (fetch/parse/normalize/upsert) — no LLM judgment step writes a DTO, so no `modelUsed` field is needed on any data record.
