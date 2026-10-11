---
name: exit-watch-daily
description: Exit Watch Daily — SOIC exit signals X1-X7 (lower highs, failed breakout, 20/50 DMA loss, industry RS rollover, distribution, fundamental exit, structural line) on the Portfolio watchlist into the signal ledger
---

## Context

Exit-side detector (`docs/SOIC_SIGNAL_PLAN.md`, taxonomy X1-X7). Tracked set = Stockscans watchlist "Portfolio" (id 838b3f7ec88e17ba127ba8a3). Purely scripted from daily candles; X7 uses the support level stored by the entry detectors (E1/E2) for names that have one. Also X4 industry RS rollover (Nifty 500 vs held industries, Performance scan 1M/3M medians), X5 distribution (rising on falling volume, NSE block SELLs ≥₹10 Cr/5d, repeat failed breakouts, FII holding fall), X6 fundamental exit (stretched valuation, muted result reaction, CFO/PAT<0, pledge ≥20%) via `lib/exitSignalsExtra.js`. Not modelled: DII change, insider selling, 'other sectors improving' (X4), thesis-break (thesis-delta jobs own it). Parameters are uncalibrated ASSUMPTIONS (`lib/exitSignals.js`). Creator: `exit-watch`. Position sizing / stop-loss rules are out of scope.

Suggested slot: ~22:55 IST (≥30 min after sector-clusters-daily).

## Execution Plan

1. `export STOCKMARKET_JOB_NAME=exit-watch-daily`
2. Execute script (bash): `yarn exit-watch-daily`
3. Execute script (bash): `yarn signal-ledger-digest`
4. Execute script (bash): `yarn workspace @stock/jobs-runtime data:push`
5. Report from step 2's JSON: flagged names with signal/state, errors, `filesTouched`.

If step 2 exits non-zero, surface the exact error. Do NOT run logic directly.

Final step: `python scripts/metrics/track_invocation.py --name exit-watch-daily --type task --model <exact model>`. Purely scripted.
