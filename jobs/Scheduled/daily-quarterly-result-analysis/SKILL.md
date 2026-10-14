---
name: daily-quarterly-result-analysis
description: Daily quarterly result analysis at 1:15 AM (runs only if extraction succeeded)
---

## Context

Run `quarterly-result-analysis` daily at 1:15 AM for all companies that had results extracted at 1:00 AM (the `daily-quarterly-result-extraction` job). This task ONLY runs if the extraction check passed (i.e., `quarterly-result-documents` records were persisted to the DB). Apply the 3-basket interpretation framework and produce a widget + PDF for each company.

## Execution Plan

1. Execute dependency check: `node scripts/jobs/check_extraction_success.js --collection quarterly-result-documents --date $(date -d yesterday +%Y-%m-%d)`

   **Purpose:** Verify that `quarterly-result-extractor` persisted records successfully.
   **If this fails (exit code 1):** STOP immediately. Do not proceed to Step 2. Log the failure and exit.

2. For each company in yesterday's `quarterly-result-documents` records, execute skill: `skills/equity-research/quarterly-result-analysis/SKILL.md` (local mounted repo path).

   **Parameters:** Pass each companyId as `--companyId <NSE:SYMBOL>`.

   **Output:**
   - Persists `quarterly-result` report (3-basket interpretation, KPI strip, monitoring checklist) to DB with `date: <yesterday>`, `creator: "quarterly-result-analysis"`, and `modelUsed: <model_string>`.
   - Renders interactive widget + PDF (saved to `data/agent-outputs/pdfs/`).

3. Execute data push: `yarn data:push` (push all generated PDFs and records to Google Drive — idempotent, push-only).

4. (FINAL STEP) Execute tracking: `python scripts/metrics/track_invocation.py --name daily-quarterly-result-analysis --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`.

## Critical Dependency Gate

This task MUST NOT run if Step 1 fails. The extraction task (1:00 AM) must succeed and persist records to the DB before this analysis task (1:15 AM) runs. If the check fails, exit with non-zero code and log the failure for troubleshooting.

## Notes

- This task only runs 15 minutes after extraction completes, allowing time for DB writes to complete.
- All 3-basket interpretation (Business / Risk / Management) is judgment-based and must include tone analysis, narrative-shift detection, and forward monitoring checklist.
- Every observation must be tagged STRUCTURAL / CYCLICAL / TEMPORARY.
- PDFs are saved and pushed to Drive for sharing; full file-touched manifest must be included in the run summary.

## Email delivery (mandatory last step of EVERY run)

The owner reads job output in Gmail, so this job must always end with an email — success, partial or failure, even when there was nothing new (a one-line "nothing to do" email is the heartbeat that proves the job ran).

1. Write the report text — per-company one-line verdict (signal, key YoY/QoQ moves) plus failures/skips — as markdown to a temp file _outside the repo_ (`f=$(mktemp)`). Keep it to what matters, lead with the headline.
2. Execute script (bash): `STOCKMARKET_JOB_NAME=daily-quarterly-result-analysis yarn job-report-email --job daily-quarterly-result-analysis --status <ok|partial|failed> --title "<one-line outcome>" --body-file "$f"` `--attach <PDF>` for each analysis PDF this run produced (skip attachments if more than 8; list their paths instead).
3. If the run stopped early (a dependency check failed, a script exited non-zero), still run step 2 with `--status failed` and the exact error as the body.
4. If the command exits non-zero (`email.status` is `skipped` or `error`, e.g. `GOOGLE_APP_PASSWORD not set`), surface the exact reason in your final report — never report the job as delivered.
