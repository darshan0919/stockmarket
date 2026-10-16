---
name: post-market-digests-suite
description: Post-Market Watchlist Sync, Company Master Sync & Daily Digests Suite — runs watchlist sync, company master reconciliation, deals digest, daily gainers digest, near highs digest, and data push in order on weekdays at 20:30 IST
model: flash_lite
---

## Context

Consolidated Post-Market Watchlist, Universe Sync and Daily Digests Suite.
Runs on weekdays at 20:30 IST after market close and exchange filings dissemination.

Executes the following sequence deterministically:

1. **Watchlist Sync** (`yarn watchlist-updater`): Syncs Near Highs, Upcoming Results & Relative Strength scans to watchlists.
2. **Company Master Sync** (`yarn company-master-sync`): Reconciles Kite Connect instruments, NSE/BSE mappings, and Stockscans universe.
3. **Daily Deals Digest** (`yarn deals-digest`): Top NSE/BSE bulk, block, SAST Reg 29 & insider PIT trades (sends its own HTML email report).
4. **Daily Gainers Digest** (`yarn daily-gainers-digest`): Top daily gainers grouped by sector/industry with streak scoring (sends its own HTML email report).
5. **Near Highs Digest** (`yarn near-highs-digest`): Stocks within 5% of 52W highs with breakdown (sends its own HTML email report).
6. **Data Push** (`yarn data:push`): Idempotent git sync.

## Execution Plan

Call the exact script:

1. `export STOCKMARKET_JOB_NAME=post-market-digests-suite`
2. Execute script (bash): `yarn post-market-digests-suite`
3. Report the summary output for each step.

Do NOT run any data fetching or formatting directly. Your only job is to execute the script and report the result.

Final step: `python scripts/metrics/track_invocation.py --name post-market-digests-suite --type task --model <exact model>`.
