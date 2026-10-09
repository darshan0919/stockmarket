---
name: cycle-indicators-monthly
description: Cycle Indicators Monthly — agent fetches published India macro-cycle readings (IIP, credit growth, PMI, GST, power demand) with sources; script scores direction into the signal ledger (C1)
---

## Context

Slow macro-cycle layer (macro playbook §6). Agent step = FETCH only (judgement-free transcription of a published number, a cheap-model task); script step = direction logic (`lib/cycleIndicators.js`: `detected` = latest > previous, `confirmed` = 3 consecutive rises; thresholds are ASSUMPTIONS, uncalibrated). Direction says nothing about level or valuation.

Indicators: `iip-yoy`, `credit-growth-yoy`, `pmi-manufacturing`, `pmi-services`, `gst-collections-yoy`, `power-demand-yoy`. Release timing (verify, don't assume): PMI ~1st-3rd working day for manufacturing, ~3rd-5th for services; GST on the 1st; IIP ~28th-30th; RBI sectoral credit ~end-month. Run on the 6th of each month to catch most.

## Execution Plan

1. `export STOCKMARKET_JOB_NAME=cycle-indicators-monthly`
2. Run `yarn workspace @stock/jobs-runtime cycle-indicators run --dry-run` and read `report` to see which indicators already have the latest published period.
3. For each indicator missing its newest published period (and for the 3 prior months if the indicator has <4 readings), WebSearch the official release (MoSPI, S&P Global/HSBC PMI, GST Council/PIB, RBI, Grid-India/CEA). Record the exact published number with an https source URL. NEVER estimate or fill from memory; if a number can't be sourced, skip it and say so.
4. Write `[{indicator, period:'YYYY-MM', value, unit, sourceUrl}]` to a temp JSON; `yarn workspace @stock/jobs-runtime cycle-indicators add --file <json> --dry-run`, fix rejections, then without `--dry-run`.
5. `yarn workspace @stock/jobs-runtime cycle-indicators run`, then `yarn workspace @stock/jobs-runtime data:push`.
6. Report: readings added (with links), skipped and why, trend table, `filesTouched`. Set any note's `modelUsed` to the exact executing model.

Final step: `python scripts/metrics/track_invocation.py --name cycle-indicators-monthly --type task --model <exact model>`.
