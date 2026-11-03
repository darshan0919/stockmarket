---
name: daily-quarterly-result-analysis
description: Daily quarterly result analysis for companies in Stockscans scan a7e61c9232e2ba38de792c27 (Quality Result - DND)
model: flash_lite
---

## Cadence

Runs twice daily:

- **Evening Slot (8:00 PM IST / 20:00)**: Uses filter `Days From Result = 0` (`--slot evening`). Analyzes companies declaring results during the current trading day.
- **Morning Slot (8:00 AM IST / 08:00)**: Uses scan default filter `Days From Result = -1` (`--slot morning`). Captures results declared yesterday, including late-night filings after 8:00 PM.

## Shared Cursor & Full-Day Consolidation

- **Shared Cursor (`data/cache/daily-quarterly-result-analysis-cursor.json`)**: Both runs share a single cursor. Any company filing analyzed in the evening run is tracked and skipped in the morning run so expensive PDF extraction and LLM interpretation are never run twice.
- **Morning Consolidated Email**: The morning report email consolidates the entire day's results by merging the previous evening's analyzed companies with any new morning filings into a single unified summary table (sorted descending by PAT Growth TTM).

## Context

Run `quarterly-result-analysis` for all companies in the Stockscans saved scan [Quality Result - DND](https://www.stockscans.in/scans/saved/a7e61c9232e2ba38de792c27) (using `ratiosType: "Growth"` and `orderBy: "PAT Growth TTM"` in the payload for `api/scans/stock/run` API), paginating until all companies are fetched.

If the output of the scan is empty (zero companies), do NOT call the `/quarterly-result-analysis` skill; simply return with an email mentioning zero companies in the scan. (Note: in the morning run, if all scan results were already processed in the evening, the morning run delivers the consolidated full-day report instead of an empty-scan notification).

For each company returned from the scan:

1. Run `/quarterly-result-analysis` to produce the analysis DTO and PDF report.
2. Push ONLY the generated PDFs and run manifest to Google Drive via targeted push: `yarn daily-quarterly-result-analysis --push` (do NOT run full repository `yarn data:push`).
3. Send an email with a summary table containing:
   - Company Name (linkified to Stockscans)
   - Market Cap
   - Revenue YoY
   - PAT YoY
   - PAT TTM
   - Link to analysis doc (Google Drive link to the PDF)
     (Sorted by PAT Growth TTM, strictly preserving the original order of fetching).

## Execution Plan

1. Execute scan fetch: `yarn daily-quarterly-result-analysis`
   (Fallback: `node packages/jobs-runtime/dailyQuarterlyResultAnalysis.js`)
   _(Note: Auto-detects slot based on IST time or respects `--slot evening` / `--slot morning`)_

   **Purpose:** Calls Stockscans `api/scans/stock/run` with `ratiosType: "Growth"` and `orderBy: "PAT Growth TTM"` (order: "desc"), paginates until all companies are retrieved, checks the shared cursor, and persists the scan universe with already-processed filings skipped from Step 2.

   **Critical Zero-Company Gate:**
   - If `count: 0` and status is `empty_scan`, the script dispatches the zero-company heartbeat email and exits. **STOP immediately.** Do NOT proceed to Step 2.
   - If `count: 0` and status is `all_processed` (morning run where all companies were analyzed in the evening), proceed straight to Step 4 to deliver the consolidated morning email.

2. For each company returned from Step 1, execute skill: `skills/equity-research/quarterly-result-analysis/SKILL.md` (local mounted repo path).
   (Fallback: `https://raw.githubusercontent.com/darshan0919/stockmarket/main/skills/equity-research/quarterly-result-analysis/SKILL.md`)

   **Parameters:** Pass each companyId as `--companyId <NSE:SYMBOL>`.

   History comes pre-built from `results-history-pack-daily` (the `quarterly-result-history`
   pack). This run is a cheap tier: if `--prepare` reports `historyPackMissing` or pending
   digests, run only the extractor's Step 0 A and C (script) and proceed — never write concall
   digests here; list the companies with incomplete history in the email.

   **Output:**
   - Persists `quarterly-result` report DTO to DB.
   - Renders interactive widget + deterministic PDF to `data/assets/quarterly-result-analysis/<Company>_Q<X>_FY<YY>_ResultAnalysis.pdf`.

3. Execute targeted data push: `yarn daily-quarterly-result-analysis --push`
   (Fallback: `node packages/jobs-runtime/dailyQuarterlyResultAnalysis.js --push` or `yarn workspace @stock/jobs-runtime data:push --files <generated-pdfs>`)
   **Speed note:** Do NOT run global `yarn data:push` (which crawls the entire repository). The targeted push uploads only the job's generated PDFs and run manifest directly in seconds and records Drive file IDs in `sync-state.json`.

4. Deliver summary email: `yarn daily-quarterly-result-analysis --email`
   (Fallback: `node packages/jobs-runtime/dailyQuarterlyResultAnalysis.js --email`)

   **Purpose:** Resolves Drive URLs for the generated analysis PDFs and delivers an email with the table:
   `Company Name (linkified) | Market Cap | Revenue YoY | PAT YoY | PAT TTM | Link to analysis doc`
   (strictly preserved in original order of PAT Growth TTM; in morning run, consolidates previous evening + morning results).

5. (FINAL STEP ALWAYS) Execute tracking:
   `python scripts/metrics/track_invocation.py --name daily-quarterly-result-analysis --type task --model gemini-3.8-flash-high`

Do NOT run any ad-hoc data fetching or manual calculations directly. Orchestrate the companion script and skill strictly in order.
