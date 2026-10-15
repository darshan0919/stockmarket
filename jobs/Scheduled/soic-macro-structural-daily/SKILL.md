---
name: soic-macro-structural-daily
description: SOIC Macro & Structural Supply Signals Suite — Market Regime (M1-M4), Liquidity Supply (L1-L2), Paper Supply (V2), IPO Supply, and Policy Events Absorption (P1) with consolidated transition digest email
model: flash_lite
---

## Context

Consolidated daily suite for top-down macro and structural supply signals (`docs/SOIC_SIGNAL_PLAN.md`).
Runs at 19:00 IST on weekdays.

Executes sequentially:
1. **Market Regime** (`yarn market-regime-daily`): Nifty 500 breadth, macro (Brent, US10Y, USDINR), FII/DII flows (M1-M4).
2. **Liquidity Supply** (`yarn liquidity-supply-daily`): NSE block-deal supply spikes and 20-session FII outflow (L1-L2).
3. **Paper Supply** (`yarn paper-supply-daily`): Block selling, QIP/preferential fundraises in P/E>50 names (V2).
4. **IPO Supply** (`yarn ipo-supply-daily`): IPO lock-in expiries and OFS announcements.
5. **Policy Events Absorption** (`yarn workspace @stock/jobs-runtime policy-events run`): Zero-LLM daily check of basket return vs CNX500 (P1).
6. **Signal Ledger Digest** (`yarn signal-ledger-digest`): Emails a consolidated transition digest only if state transitions occurred.
7. **Data Push** (`yarn data:push`): Idempotent git sync.

## Execution Plan

Call the exact script:

1. `export STOCKMARKET_JOB_NAME=soic-macro-structural-daily`
2. Execute script (bash): `yarn soic-macro-structural-daily`
3. Report the summary output for each step.

Do NOT run any data fetching or formatting directly. Your only job is to execute the script and report the result.

Final step: `python scripts/metrics/track_invocation.py --name soic-macro-structural-daily --type task --model <exact model>`.
