---
name: daily-quarterly-result-extraction
description: Daily quarterly result extraction at 1:00 AM for companies with results filed yesterday
---

## Context

Run `quarterly-result-extractor` daily at 1:00 AM for all companies that filed results on the previous day. Fetch companies from the Stockscans results/scan API with quality filters (EPS Growth YoY >= 40%, Market Cap >= 300 Cr, EPS Growth QoQ >= 5%), then extract documents, income-statement signals, and excerpts for each, persisting to the DB.

## Execution Plan

1. Execute script: `node scripts/jobs/daily_results_extractor.js --date $(date -d yesterday +%Y-%m-%d)`

   **Purpose:** Fetch all companies with results filed yesterday via the Stockscans resultsScan API.
   **Filters applied:**
   - EPS Growth YoY >= 40%
   - Market Capitalization >= 300 Cr
   - EPS Growth QoQ >= 5%

   **Output:** JSON manifest with list of companies `{date, count, pageCount, companies[], status}`.

2. For each company returned from Step 1, execute skill: `skills/equity-research/quarterly-result-extractor/SKILL.md` (local mounted repo path — only fall back to the GitHub-hosted copy via `github-skill-invoker` if the local path is unavailable).

   **Parameters:** Pass each companyId from Step 1 as `--companyId <NSE:SYMBOL>`.

   **Output:** Persists `quarterly-result-documents` records to DB with `date: <yesterday>` and `creator: "quarterly-result-extractor"`.

3. Execute verification: `node scripts/jobs/check_extraction_success.js --collection quarterly-result-documents --date $(date -d yesterday +%Y-%m-%d)`

   **Purpose:** Verify that at least one `quarterly-result-documents` record was persisted. If this check fails (exit code 1), the downstream `daily-quarterly-result-analysis` task will NOT run.

4. (FINAL STEP) Execute tracking: `python scripts/metrics/track_invocation.py --name daily-quarterly-result-extraction --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`.

## Notes

- This task fetches results for yesterday's date (results that were filed yesterday).
- It uses the Stockscans resultsScan API with quality filters (not the simpler resultsDocuments method).
- Pagination is handled automatically — fetches all pages for the given date.
- It persists deterministic extraction (documents, signals, excerpts) to the `quarterly-result-documents` collection.
- The downstream `daily-quarterly-result-analysis` task will NOT run if this extraction check fails.
- Check the run summary for file-touched manifest listing created/modified records.
