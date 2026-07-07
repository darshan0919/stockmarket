---
name: upload-stock-reports-to-google-drive
description: Upload stock reports to Google Drive (data:offload), then audit the repo for data-like files (json/csv/pdf/xlsx) missing from the data schema/offload pipeline and propose fixes
---

Run this in order. This is an unattended scheduled run — execute autonomously, don't ask questions, and only take the specific actions listed below (no other writes, deletes, code edits, or file moves).

STEP 1 — Offload sync (existing behavior)
Run: `cd /Users/darshan.patel/code/personal/stockmarket && yarn cowork:data:offload` (if `yarn` isn't on PATH, use `corepack yarn cowork:data:offload`).
Report: files synced, files removed locally, and any "Skipped (could not remove)" or "WARNING: N file(s) ... NOT recognized by classifyLocalDocument()" lines verbatim — the latter is a real schema gap, not noise.

STEP 2 — Repo data-file health checkup (read-only audit)
Goal: confirm every "data-like" file in the repo (extensions: .json, .jsonl, .csv, .xlsx, .xls, .pdf) is either (a) covered by the data schema/offload pipeline, or (b) a legitimate non-data file that's correctly out of scope.

2a. Inside the tracked data root (jobs/data/):
Run `node packages/jobs-runtime/lib/driveDataStore.js doctor` and `node packages/jobs-runtime/lib/driveDataStore.js manifest`.
The schema/classifier lives in `classifyLocalDocument()` inside packages/jobs-runtime/lib/driveDataStore.js — it decides which files under jobs/data/ get offloaded. offloadToDrive.js (run in Step 1) already snapshots every file under jobs/data/ and reports any NOT matched by classifyLocalDocument() as unclassified (exit code 2 + a warning list). Any such file is a real discrepancy: it sits in the data root but is never uploaded to Drive or cleaned up locally.

2b. Outside jobs/data/, scan the rest of the repo:
```
find /Users/darshan.patel/code/personal/stockmarket \( -iname "*.json" -o -iname "*.jsonl" -o -iname "*.csv" -o -iname "*.xlsx" -o -iname "*.xls" -o -iname "*.pdf" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/.next/*" -not -path "*/.yarn/*" \
  -not -path "*/dist/*" -not -path "*/build/*" -not -path "*/coverage/*" -not -path "*/.turbo/*"
```
Classify each hit into:
 - "config/lockfile/manifest — no action needed": package.json (any workspace), tsconfig*.json, skills-lock.json, .claude/settings.local.json, extensions/*/manifest.json, skills/registries/workflow-dependencies.json, scripts/skills/registries/workflow-dependencies.json, jobs/tasks/platforms.json, jobs/tasks/manifest.json. These are code/config, not research data — correctly excluded from the Drive schema. Don't flag these.
 - "data-like file outside the pipeline — real discrepancy": anything that looks like generated research/report output or app data sitting outside jobs/data/, e.g. standalone equity-report PDFs at repo root or in docs/assets/ (baseline as of 2026-07-07: ./AASTHA_equity_report_2026-07-07.pdf, ./docs/assets/INFY_equity_report_29Jun2026.pdf, ./docs/assets/Dashboard_complete_GuideExtraction___Generation_18_04_26_lyst1776605515998.pdf), or standalone data files like ./data/announcement-scan-ignore-keywords.json. Compare today's scan to this baseline and only call out NEW additions or removals — don't re-report the same known items every day.

STEP 3 — Report & mitigation plan (no code changes, no file moves/deletes)
Summarize:
 - Step 1 offload result.
 - Any files unclassified inside jobs/data/ (needs a new pattern added to classifyLocalDocument() in packages/jobs-runtime/lib/driveDataStore.js) — name the exact file path(s).
 - Any NEW data-like files found outside jobs/data/ since the 2026-07-07 baseline.
 - For every discrepancy, propose one concrete fix, e.g.: "Add a classifyLocalDocument() rule matching `<path pattern>`" or "Move `<file>` into jobs/data/documents/... so the existing offload picks it up, or explicitly confirm it should stay in git and add it to the known-exclusions baseline."
 - If there are zero discrepancies, say so plainly — don't invent findings.
This step is read-only: do not edit code, move files, or delete anything — only report and propose.

End your response with a run summary: what the offload did, whether any schema/offload discrepancies exist (new or previously known), and what changed since the last run.