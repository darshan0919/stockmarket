---
name: mtf-flush-suite-daily
description: MTF Flush Trading Suite — MTF flush entry signal scanner, 7-day recovery verification check, and mature signal outcomes tracking
model: flash_lite
---

## Context

Consolidated daily suite for Shashank's Margin Trading Facility (MTF) flush-out strategy (Rule G4).
Runs at 19:30 IST on weekdays.

Executes sequentially:
1. **MTF Flush Daily** (`yarn mtf-flush-daily`): Scans today's new MTF flush entries, scores 0-100 (tiers A/B/C), logs to signal ledger, and emails new entry alerts.
2. **MTF Flush Recovery** (`yarn mtf-flush-recovery`): Reviews last 7 days of signals to verify whether expected bounce/recovery occurred (vs 20/50 EMA), emailing per-signal verdicts.
3. **MTF Flush Outcomes** (`yarn mtf-flush-outcomes`): Tracks realised 5/10/20-session returns as signals mature.
4. **Data Push** (`yarn data:push`): Idempotent git sync.

## Execution Plan

Call the exact script:

1. `export STOCKMARKET_JOB_NAME=mtf-flush-suite-daily`
2. Execute script (bash): `yarn mtf-flush-suite-daily`
3. Report the summary output for each step.

Do NOT run any data fetching or formatting directly. Your only job is to execute the script and report the result.

Final step: `python scripts/metrics/track_invocation.py --name mtf-flush-suite-daily --type task --model <exact model>`.
