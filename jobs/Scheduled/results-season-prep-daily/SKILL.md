---
name: results-season-prep-daily
description: Results Season Prep — pre-results watchlist of liquid names whose last good result faded (PAT YoY>20%, negative return since result, 70-120 days since result) into the signal ledger
---

## Context

From `kba_x-soic-handles_process-playbook_results-season-prep`. Stockscans-native columns only (Days From Result — NEGATIVE for past results —, Returns Since Result, PAT Growth YoY). Return since result is NOT market-adjusted, so a weak tape inflates the list. Daily concall list = Stockscans native Concall Scans (not rebuilt). Related-party >5-10% of sales and negative-CFO-with-rising-receivables flags need filing extracts and are NOT covered. Thresholds are ASSUMPTIONS (`lib/resultsSeasonPrep.js`). Creator: `results-season-prep`.

## Execution Plan

1. `export STOCKMARKET_JOB_NAME=results-season-prep-daily`
2. Execute script (bash): `yarn results-season-prep-daily`
3. Execute script (bash): `yarn signal-ledger-digest`
4. Execute script (bash): `yarn workspace @stock/jobs-runtime data:push`
5. Report from step 2's JSON: counts, sample, `filesTouched`.

If step 2 exits non-zero, surface the exact error. Do NOT run logic directly.

Final step: `python scripts/metrics/track_invocation.py --name results-season-prep-daily --type task --model <exact model>`. Purely scripted.
