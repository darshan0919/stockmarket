---
name: exit-watch-daily
description: Exit Watch Daily — SOIC exit signals (weekly lower highs, failed breakout, 20/50 DMA loss, structural line) on the Portfolio watchlist into the signal ledger
---

## Context

Exit-side detector (`docs/SOIC_SIGNAL_PLAN.md`, taxonomy X1/X2/X3/X7). Tracked set = Stockscans watchlist "Portfolio" (id 838b3f7ec88e17ba127ba8a3). Purely scripted from daily candles; X7 uses the support level stored by the entry detectors (E1/E2) for names that have one. X4 (sector RS rollover), X5 (distribution/deals) and X6 (fundamental) are NOT covered. Parameters are uncalibrated ASSUMPTIONS (`lib/exitSignals.js`). Creator: `exit-watch`. Position sizing / stop-loss rules are out of scope.

Suggested slot: ~22:55 IST (≥30 min after sector-clusters-daily).

## Execution Plan

1. `export STOCKMARKET_JOB_NAME=exit-watch-daily`
2. Execute script (bash): `yarn exit-watch-daily`
3. Execute script (bash): `yarn signal-ledger-digest`
4. Execute script (bash): `yarn workspace @stock/jobs-runtime data:push`
5. Report from step 2's JSON: flagged names with signal/state, errors, `filesTouched`.

If step 2 exits non-zero, surface the exact error. Do NOT run logic directly.

Final step: `python scripts/metrics/track_invocation.py --name exit-watch-daily --type task --model <exact model>`. Purely scripted.
