---
name: sector-lifecycle-weekly
description: Sector Lifecycle Weekly — S4 crowding context per industry (sector price 2x in 24m, IPO listing rush, sector P/E premium) with cycle phase and duration, into the signal ledger
model: flash_lite
---

## Context

From SOIC sector teaching (tailwinds ~2-3 years, super-cycles 2-5 years; late cycle = price run + listing rush + stretched sector P/E). Purely scripted, CONTEXT ONLY (never a gate). Per industry with >= 5 names (mcap >= Rs 100 Cr): equal-weight index of its 8 largest names with mcap >= Rs 500 Cr and a full 24M history (>= 3 needed) (4y daily candles, cached in `data/cache/sector-lifecycle-ohlcv/`, refreshed weekly). Flags (user's defaults, uncalibrated, `lib/sectorLifecycle.js`): PRICE_2X_24M (now / 24M low >= 2.0; warm >= 1.7), IPO_SUPPLY (>= 4 mainboard listings in 12m or >= 25% of the industry's names), PE_PREMIUM (sector median P/E >= 1.5x its earliest 13 snapshots; n/a until 26 weekly `sector_pe_snapshot`s, ~Apr 2027). 1 flag = detected, 2+ = confirmed. Phase: base / run (1.3-1.7x) / crowded / fading (peaked >= 1.7x, now >= 15% below peak). Duration = months since the 24M low. Event `sector_lifecycle_snapshot`; ledger signal `S4-sector-lifecycle-crowding`, creator `sector-lifecycle`. Needs `data/cache/ipo-supply-universe.json` (ipo-supply-daily).

Suggested slot: Sunday, after sector-pe-snapshot-weekly (first run fetches ~1,000 candle files, several minutes).

## Execution Plan

1. `export STOCKMARKET_JOB_NAME=sector-lifecycle-weekly`
2. Execute script (bash): `yarn sector-lifecycle-weekly`
3. Execute script (bash): `yarn signal-ledger-digest`
4. Execute script (bash): `yarn workspace @stock/jobs-runtime data:push`
5. Report from step 2's JSON: flagged industries (flags, phase, priceX, months since low), fading industries, errors, `filesTouched`. Judgment only: name any flagged industry that holds an open position or a focus-name.

If step 2 exits non-zero, surface the exact error. Do NOT run logic directly.

Final step: `python scripts/metrics/track_invocation.py --name sector-lifecycle-weekly --type task --model <exact model>`. Purely scripted.
