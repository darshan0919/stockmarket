---
name: soic-setups-rotation-daily
description: SOIC Setups, Breadth, Sector Rotation & Exits Suite — Technical Setups (E1-E2), Sector Clusters (S1), Sector Rotation (S2-S3), Valuation Stretch (V1), Exit Watch (X1-X7), and Funnel Gaps with transition digest email
model: flash_lite
---

## Context

Consolidated daily suite for bottom-up setups, breadth clusters, rotation, and exits (`docs/SOIC_SIGNAL_PLAN.md`).
Runs at 19:15 IST on weekdays.

Executes sequentially:

1. **Technical Setups** (`yarn technical-setups-daily`): RS>=90 leaders scanned for base-breakout (E1) and pullback (E2).
2. **Sector Clusters** (`yarn sector-clusters-daily`): Near-high industry concentration (S1).
3. **Sector Rotation** (`yarn sector-rotation-daily`): Industry concentration (S3) and relative strength (S2).
4. **Valuation Stretch** (`yarn valuation-stretch-daily`): PEG / industry premium stretch flags (V1).
5. **Exit Watch** (`yarn exit-watch-daily`): Watchlist exit signals (X1-X7).
6. **Funnel Gaps** (`yarn funnel-gaps-daily`): QoQ earnings gap lists.
7. **Signal Ledger Digest** (`yarn signal-ledger-digest`): Emails a consolidated transition digest only if state transitions occurred.
8. **Data Push** (`yarn data:push`): Idempotent git sync.

## Execution Plan

Call the exact script:

1. `export STOCKMARKET_JOB_NAME=soic-setups-rotation-daily`
2. Execute script (bash): `yarn soic-setups-rotation-daily`
3. Report the summary output for each step.

Do NOT run any data fetching or formatting directly. Your only job is to execute the script and report the result.

Final step: `python scripts/metrics/track_invocation.py --name soic-setups-rotation-daily --type task --model <exact model>`.
