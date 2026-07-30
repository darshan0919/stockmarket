---
name: upload-stock-reports-to-google-drive
description: Drive Sync & Audit — push data/ mirror to Drive (StockMarket/data/v2), audit repo for stray data files
---

Run this in order. This is an unattended scheduled run — execute autonomously, don't ask questions, and only take the specific actions listed below (no other writes, deletes, code edits, or file moves).

STEP 1 — Push the v2 data mirror (push-only, keeps all local files)
Run: `yarn workspace @stock/jobs-runtime data:push` (if `yarn` isn't on PATH, use `corepack yarn`; fallback: `node packages/jobs-runtime/scripts/data.js push`).
Report the summary line verbatim (uploaded / merged / skipped) and any per-file errors. Push must NEVER delete local files — if the output suggests otherwise, flag it loudly.

STEP 2 — Pull (two-way completeness)
Run: `node packages/jobs-runtime/scripts/data.js pull` and report downloaded/merged/skipped. Conflicts on non-collection files are saved as `*.local-conflict.*` — list any such files verbatim.

STEP 3 — Repo data-file health checkup (read-only audit)
Goal: every "data-like" file (.json, .jsonl, .csv, .xlsx, .xls, .pdf) must live under `data/` (the Data Ecosystem v2 root — see docs/DATA_ECOSYSTEM.md) or be legitimate code/config.
Scan:

```
find . \( -iname "*.json" -o -iname "*.jsonl" -o -iname "*.csv" -o -iname "*.xlsx" -o -iname "*.xls" -o -iname "*.pdf" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/.next/*" -not -path "*/.yarn/*" \
  -not -path "*/dist/*" -not -path "*/build/*" -not -path "*/coverage/*" -not -path "*/data/*"
```

Classify each hit:

- "config/lockfile/manifest — no action": package.json (any workspace), tsconfig*.json, skills-lock.json, .claude/settings.local.json, extensions/*/manifest.json, skills/registries/_.json, jobs/Scheduled/_/manifest.json, templates/, JSON schemas. Don't flag these.
- "generated data outside data/ — real discrepancy": research/report outputs or app data anywhere else (repo root PDFs, docs/assets/ report PDFs, stray legacy dirs like jobs/data/, daily_gainers/, notes/, validation/, entities/, documents/, delivery_cache/ — these must no longer exist). Known baseline (don't re-report): ./docs/assets/Dashboard_complete_GuideExtraction\_\_\_Generation_18_04_26_lyst1776605515998.pdf. Only call out NEW additions or removals vs baseline.

STEP 4 — Report (no code changes, no file moves/deletes)
Summarize: push + pull results; any `*.local-conflict.*` or unclassified warnings; any NEW data-like files outside data/; for each discrepancy propose one concrete fix (usually: "the producing skill/job must write via packages/jobs-runtime/lib/db.js or StorageService into data/ — see skills/\_shared/conventions.md §6"). If zero discrepancies, say so plainly — don't invent findings.

End with a run summary: what push/pull did, whether any discrepancies exist (new vs known), and what changed since the last run.

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`): execute `python scripts/metrics/track_invocation.py --name upload-stock-reports-to-google-drive --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`. No `modelUsed` needed — this is a sync/audit run, no analytical output.
