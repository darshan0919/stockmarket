---
name: daily-forward-guidance-with-pead
description: Daily forward guidance extraction with PEAD ranking for saved scan 429918e3098ce660baec9f22
---

## Context

Run the `forward-guidance-extractor` skill daily at 11:45 PM to extract management forward guidance from all companies in the saved Stockscans scan at https://www.stockscans.in/scans/saved/429918e3098ce660baec9f22. Enable PEAD (Post-Earnings-Announcement Drift) ranking to identify companies with highest earnings surprise potential based on guidance vs street estimates. This task ONLY runs if the guidance document extraction check passed (the 11:30 PM `daily-guidance-extractor-scan` job).

## Execution Plan

1. Execute dependency check: `node scripts/jobs/check_extraction_success.js --collection guidance-documents --date $(date +%Y-%m-%d)`

   **Purpose:** Verify that `guidance-document-extractor` persisted records successfully.
   **If this fails (exit code 1):** STOP immediately. Do not proceed to Step 2. Log the failure and exit.

2. Execute skill: `skills/equity-research/forward-guidance-extractor/SKILL.md` (local mounted repo path — only fall back to the GitHub-hosted copy via `github-skill-invoker` if the local path is unavailable).

   **Parameters for the skill:**
   - Scan URL: `https://www.stockscans.in/scans/saved/429918e3098ce660baec9f22`
   - Mode: Bulk extract (auto-detect from saved-scan URL)
   - Enable PEAD ranking: `yes` (chains into `pead-surprise-ranker` automatically)
   - Output: Persisted forward-guidance and pead-ranking records to data collections with `creator: "forward-guidance-extractor"`

3. Execute data push: `yarn data:push` (push all generated records and workbooks to Google Drive — idempotent, push-only).

4. (FINAL STEP) Execute tracking: `python scripts/metrics/track_invocation.py --name daily-forward-guidance-with-pead --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`.

## Critical Dependency Gate

This task MUST NOT run if Step 1 fails. The guidance document extraction task (11:30 PM) must succeed and persist records to the DB before this forward-guidance extraction task (11:45 PM) runs. If the check fails, exit with non-zero code and log the failure for troubleshooting.

## Notes

- This task depends on the 11:30 PM `daily-guidance-extractor-scan` run completing first — the documents must be fetched before guidance can be extracted.
- The skill reads `guidance-documents` records from the DB, extracts forward metrics (Revenue, OPM, PAT, EPS guidance), and compares against street consensus.
- PEAD ranking automatically classifies companies by earnings surprise likelihood (High/Medium/Low conviction).
- Results are persisted as forward-guidance + pead-ranking DTOs with deterministic IDs, so updates merge automatically.
- Check the run summary for file-touched manifest listing created/modified records and updated models.
