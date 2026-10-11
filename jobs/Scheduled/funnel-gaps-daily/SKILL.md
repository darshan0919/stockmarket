---
name: funnel-gaps-daily
description: Funnel Gaps Daily — SOIC process-playbook gap lists (PAT/EPS growth >25% QoQ, IPO <1 year) with liquidity and cap-band filters into the signal ledger
---

## Context

From the SOIC process playbook (`kba_x-soic-handles_process-playbook_funnel-gaps`). Universe = Stockscans scan (mcap >= Rs 500 Cr, 20D turnover >= Rs 7 Cr, PAT Growth QoQ > 25). F1 uses PAT growth as an EPS proxy; F2 flags names with < 250 daily candles (listed < 1 year; no listing-date column exists). Output includes `by_industry` counts for a group-by-count digest. Creator: `funnel-gaps`. Cap band via `--min-mcap/--max-mcap`.

## Execution Plan

1. `export STOCKMARKET_JOB_NAME=funnel-gaps-daily`
2. Execute script (bash): `yarn funnel-gaps-daily`
3. Execute script (bash): `yarn signal-ledger-digest`
4. Execute script (bash): `yarn workspace @stock/jobs-runtime data:push`
5. Report from step 2's JSON: F1 count, F2 list, by_industry top, errors, `filesTouched`.

If step 2 exits non-zero, surface the exact error. Do NOT run logic directly.

Final step: `python scripts/metrics/track_invocation.py --name funnel-gaps-daily --type task --model <exact model>`. Purely scripted.
