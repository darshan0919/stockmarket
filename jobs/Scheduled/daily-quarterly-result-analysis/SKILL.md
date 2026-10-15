---
name: daily-quarterly-result-analysis
description: Daily quarterly result analysis for companies in Stockscans scan a7e61c9232e2ba38de792c27 (Quality Result - DND)
model: flash_lite
---

## Context

Run `quarterly-result-analysis` for all companies in the Stockscans saved scan [Quality Result - DND](https://www.stockscans.in/scans/saved/a7e61c9232e2ba38de792c27) (using `ratiosType: "Growth"` and `orderBy: "PAT Growth TTM"` in the payload for `api/scans/stock/run` API), paginating until all companies are fetched.

If the output of the scan is empty (zero companies), do NOT call the `/quarterly-result-analysis` skill; simply return with an email mentioning zero companies in the scan.

For each company returned from the scan:

1. Run `/quarterly-result-analysis` to produce the analysis DTO and PDF report.
2. Push the generated PDFs to Google Drive via `yarn data:push`.
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

   **Purpose:** Calls Stockscans `api/scans/stock/run` with `ratiosType: "Growth"` and `orderBy: "PAT Growth TTM"` (order: "desc"), paginates until all companies are retrieved, and persists the scan universe.

   **Critical Zero-Company Gate:**
   If the scan returns zero companies (`count: 0`), the script automatically dispatches the zero-company heartbeat email and exits.
   **STOP immediately.** Do NOT proceed to Step 2. Do NOT invoke `/quarterly-result-analysis`.

2. For each company returned from Step 1, execute skill: `skills/equity-research/quarterly-result-analysis/SKILL.md` (local mounted repo path).
   (Fallback: `https://raw.githubusercontent.com/darshan0919/stockmarket/main/skills/equity-research/quarterly-result-analysis/SKILL.md`)

   **Parameters:** Pass each companyId as `--companyId <NSE:SYMBOL>`.

   **Output:**
   - Persists `quarterly-result` report DTO to DB.
   - Renders interactive widget + deterministic PDF to `data/assets/quarterly-result-analysis/<Company>_Q<X>_FY<YY>_ResultAnalysis.pdf`.

3. Execute data push: `yarn data:push`
   (idempotent, push-only: uploads generated PDFs and records to Google Drive and records Drive file IDs in `sync-state.json`).

4. Deliver summary email: `yarn daily-quarterly-result-analysis --email`
   (Fallback: `node packages/jobs-runtime/dailyQuarterlyResultAnalysis.js --email`)

   **Purpose:** Resolves Drive URLs for the generated analysis PDFs and delivers an email with the table:
   `Company Name (linkified) | Market Cap | Revenue YoY | PAT YoY | PAT TTM | Link to analysis doc`
   (strictly preserved in original order of PAT Growth TTM).

5. (FINAL STEP ALWAYS) Execute tracking:
   `python scripts/metrics/track_invocation.py --name daily-quarterly-result-analysis --type task --model gemini-3.8-flash-high`

Do NOT run any ad-hoc data fetching or manual calculations directly. Orchestrate the companion script and skill strictly in order.
