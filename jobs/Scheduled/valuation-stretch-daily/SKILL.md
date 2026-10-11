---
name: valuation-stretch-daily
description: Valuation Stretch Daily — SOIC V1 flag (PEG>1.5/2, P/E premium to industry, P/E>50 in weak regime) over the liquid universe into the signal ledger
---

## Context

Valuation context detector from the SOIC valuation playbook (`kba_x-soic-handles_valuation-playbook_stretch-flag`). Universe = Stockscans scan (mcap >= Rs 500 Cr, 20D turnover >= Rs 7 Cr), columns Price To Earnings / PEG / Industry PE Median (platform-native; own-history P/E median is not in the scan — see `peadPricedIn.js` for the per-stock version). Thresholds are single-author / ASSUMPTION (`lib/valuationStretch.js`). Stockscans PEG uses trailing growth. It is a context flag, not a trade signal. Creator: `valuation-stretch`.

Suggested slot: after market-regime-daily (reads M3/M4 states for the weak-regime flag).

## Execution Plan

1. `export STOCKMARKET_JOB_NAME=valuation-stretch-daily`
2. Execute script (bash): `yarn valuation-stretch-daily`
3. Execute script (bash): `yarn signal-ledger-digest`
4. Execute script (bash): `yarn workspace @stock/jobs-runtime data:push`
5. Report from step 2's JSON: counts, sample, `filesTouched`.

If step 2 exits non-zero, surface the exact error. Do NOT run logic directly.

Final step: `python scripts/metrics/track_invocation.py --name valuation-stretch-daily --type task --model <exact model>`. Purely scripted.
