---
name: market-regime-daily
description: Market Regime Daily — Nifty 500 breadth, macro (Brent/US10Y/USDINR), FII/DII flows into the signal ledger (M1-M4); emails only signal changes
---

## Context

Daily top-down gate for the SOIC signal system (`docs/SOIC_SIGNAL_PLAN.md`, taxonomy M1-M4). Purely scripted: Stockscans breadth counts, TradingView macro snapshot, NSE FII/DII flows. Thresholds are single-author claims from tweets and are NOT calibrated (every state carries `calibrated: false`).

Storage (DATA_RULES): `market_snapshot` + `signal_transition` events in the events collection, current states in the `signal-ledger` collection (written only through `lib/signalLedger.js`). Creator: `market-regime-daily`.

Suggested slot: ~21:15 IST (after NSE publishes FII/DII; ≥30 min from other jobs, ≥60 min from other events writers per DATA_RULES §6) — final slot to be confirmed when scheduled.

## Execution Plan

Call the following exact scripts, in order:

1. `export STOCKMARKET_JOB_NAME=market-regime-daily`
2. Execute script (bash): `yarn market-regime-daily`
3. Execute script (bash): `yarn signal-ledger-digest` (emails only if there were transitions since yesterday; use `--no-email` to preview)
4. Execute script (bash): `yarn workspace @stock/jobs-runtime data:push`
5. Report from the JSON printed by steps 2-3: session date, any `errors` (a failed source is skipped, not treated as zero), the transitions list, and the `filesTouched` manifest (DATA_RULES §7).

If step 2 exits non-zero, surface the exact error. Do NOT run any logic, fetching or calculations directly.

Final step (every run): `python scripts/metrics/track_invocation.py --name market-regime-daily --type task --model <exact model>`. No `modelUsed` — purely scripted.
