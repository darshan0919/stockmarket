---
name: technical-setups-daily
description: Technical Setups Daily — RS≥90 leaders scanned for base-breakout (E1) and pullback (E2) entry-ready states into the signal ledger; emails only signal changes
---

## Context

Bottom-up entry-ready detector for the SOIC signal system (`docs/SOIC_SIGNAL_PLAN.md`, taxonomy E0-E2). Purely scripted: Stockscans universe scan (mcap ≥ ₹500 Cr, 20D turnover ≥ ₹7 Cr), RS percentile from 3M/6M/1Y returns, 1D candles only for RS≥90 / ≤20% from 52wH / above 200 EMA candidates plus names still active in the ledger.

Thresholds (`lib/technicalSetups.js` header lists the source tweet per parameter) are single-author claims or marked ASSUMPTION and are NOT calibrated. Each observation carries the market gate (active `M4-deep-correction` / `M3-weak-macro` states) in its evidence; the gate informs, it does not block.

Storage (DATA_RULES): `signal-ledger` states + `signal_transition` events via `lib/signalLedger.js`. Creator: `technical-setups`.

Suggested slot: ~21:45 IST, after `market-regime-daily` (≥30 min stagger) so the market gate is current. Slot to be confirmed when scheduled. Stockscans rate-limits (429): the job paces its scan pages; do not re-run repeatedly.

## Execution Plan

Call the following exact scripts, in order:

1. `export STOCKMARKET_JOB_NAME=technical-setups-daily`
2. Execute script (bash): `yarn technical-setups-daily`
3. Execute script (bash): `yarn signal-ledger-digest` (emails only if there were transitions since yesterday; use `--no-email` to preview)
4. Execute script (bash): `yarn workspace @stock/jobs-runtime data:push`
5. Report from the JSON of step 2: session date, universe/candidate counts, `fetchErrors` (a failed fetch is skipped, not treated as a miss), `entryReady` list with levels, and the `filesTouched` manifest.

If step 2 exits non-zero, surface the exact error. Do NOT run any logic, fetching or calculations directly.

Final step (every run): `python scripts/metrics/track_invocation.py --name technical-setups-daily --type task --model <exact model>`. No `modelUsed` — purely scripted.
