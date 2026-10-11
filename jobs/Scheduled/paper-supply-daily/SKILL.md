---
name: paper-supply-daily
description: Paper Supply Daily — SOIC valuation-playbook watch for block selling and QIP/preferential fundraises in P/E>50 names, into the signal ledger
---

## Context

From `kba_x-soic-handles_valuation-playbook_paper-supply`. High-PE universe = Stockscans scan (mcap >= Rs 300 Cr, P/E > 50). P1 = NSE BLOCK-deal SELL value over the last 5 sessions (>= Rs 25 Cr detected, >= Rs 100 Cr confirmed; bulk deals excluded, 70-row cap; NSE-listed symbols only). P2 = QIP / preferential announcements in the last 7 days (Stockscans keyword search, then title/description classification; warrant-conversion allotments are capped at `detected`). Thresholds are ASSUMPTIONS (`lib/paperSupply.js`). Context flag, not a trade signal. IPO/OFS supply is not covered. Creator: `paper-supply`.

## Execution Plan

1. `export STOCKMARKET_JOB_NAME=paper-supply-daily`
2. Execute script (bash): `yarn paper-supply-daily`
3. Execute script (bash): `yarn signal-ledger-digest`
4. Execute script (bash): `yarn workspace @stock/jobs-runtime data:push`
5. Report from step 2's JSON: flagged names with signal/state/evidence, errors, `filesTouched`.

If step 2 exits non-zero, surface the exact error. Do NOT run logic directly.

Final step: `python scripts/metrics/track_invocation.py --name paper-supply-daily --type task --model <exact model>`. Purely scripted.
