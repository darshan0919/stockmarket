---
name: liquidity-supply-daily
description: Liquidity Supply Daily — NSE block-deal supply spikes and 20-session FII outflow into the signal ledger (L1/L2); emails only signal changes
---

## Context

Liquidity layer of the top-down gates (`docs/SOIC_SIGNAL_PLAN.md`; macro playbook §2 "supply drains"). Purely scripted. L2 = NSE block-deal SELL-side traded value, last 5 sessions vs the median of prior 20 five-session sums (≥2× detected, ≥3× confirmed). L1 = 20-session cumulative FII net from `market_snapshot` history (needs 20 snapshots from `market-regime-daily`; omitted until then). Bulk deals excluded (NSE caps each response at 70 rows). IPO/OFS supply and SIP flows are NOT covered. All thresholds are ASSUMPTIONS (`lib/liquiditySupply.js`). Creator: `liquidity-supply`.

Suggested slot: ~23:25 IST (≥30 min after exit-watch-daily).

## Execution Plan

1. `export STOCKMARKET_JOB_NAME=liquidity-supply-daily`
2. Execute script (bash): `yarn liquidity-supply-daily`
3. Execute script (bash): `yarn signal-ledger-digest`
4. Execute script (bash): `yarn workspace @stock/jobs-runtime data:push`
5. Report from step 2's JSON: blockSpike ratio, fii20 (or its history note), errors, `filesTouched`.

If step 2 exits non-zero, surface the exact error. Do NOT run logic directly.

Final step: `python scripts/metrics/track_invocation.py --name liquidity-supply-daily --type task --model <exact model>`. Purely scripted.
