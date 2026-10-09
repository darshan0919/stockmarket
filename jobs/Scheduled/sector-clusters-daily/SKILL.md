---
name: sector-clusters-daily
description: Sector Clusters Daily — near-high names per industry vs industry size, 5-session persistence (S1) into the signal ledger; emails only signal changes
---

## Context

Top-down sector detector (`docs/SOIC_SIGNAL_PLAN.md`, taxonomy S1/S3). Purely scripted: the user's saved Near Highs scan grouped by industry against the mcap ≥ ₹500 Cr universe per industry. An industry flags only when ≥3 names, ≥10% share, universe ≥8 and share ≥1.5× the market-wide near-high rate (so a broad rally doesn't flag everything). `confirmed` = hit in ≥4 of the last 5 sessions. All thresholds uncalibrated (`lib/sectorClusters.js`). Creator: `sector-clusters`; `sector_snapshot` events hold the history.

Suggested slot: ~22:15 IST (≥30 min after technical-setups-daily). Stockscans rate-limits (429); the job paces pages.

## Execution Plan

1. `export STOCKMARKET_JOB_NAME=sector-clusters-daily`
2. Execute script (bash): `yarn sector-clusters-daily`
3. Execute script (bash): `yarn workspace @stock/jobs-runtime policy-events run` (policy absorption; zero events is fine)
4. Execute script (bash): `yarn signal-ledger-digest`
5. Execute script (bash): `yarn workspace @stock/jobs-runtime data:push`
6. Report from step 2's JSON: clusters with state, near/universe/share, errors, `filesTouched`.

If step 2 exits non-zero, surface the exact error. Do NOT run logic directly.

Final step: `python scripts/metrics/track_invocation.py --name sector-clusters-daily --type task --model <exact model>`. Purely scripted.
