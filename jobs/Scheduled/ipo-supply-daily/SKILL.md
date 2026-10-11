---
name: ipo-supply-daily
description: IPO Supply Daily — SOIC paper-supply watch for IPO 12-18-month review window, SEBI lock-in expiries and offer-for-sale announcements, into the signal ledger
---

## Context

Second leg of `kba_x-soic-handles_valuation-playbook_paper-supply` (first leg: paper-supply-daily). IPO facts = IPOPlatform performance tracker (mainboard, NSE symbols; BSE-only listings skipped); live price/P/E/PAT = Stockscans Default scan (mcap >= Rs 100 Cr, cached per day in `data/cache/ipo-supply-universe.json` to avoid 429s on reruns). P3 = listed 12-18 months ago (ishmohit1: study IPOs after euphoria cools), `confirmed` if price <= IPO offer price, PAT YoY > 0 and no overpricing flag (IPO P/E > 50, loss-making at IPO, current P/E > 100); 18-24 months only if cooled and growing. P4 = SEBI lock-in expiry within -2..+5 days of today, approximated from the listing date (anchors +30d/+90d, pre-IPO holders +6m, promoter minimum contribution +18m); unlocked share count is unknown. P5 = offer-for-sale mentions in NSE corporate announcements (last 7 days; confirmed if P/E > 50). Thresholds are ASSUMPTIONS (`lib/ipoSupply.js`); lock-in rules are from a secondary source, verify against ICDR. Context flags, not trade signals. Creator: `ipo-supply`.

Suggested slot: ~23:55 IST (>= 30 min after liquidity-supply-daily).

## Execution Plan

1. `export STOCKMARKET_JOB_NAME=ipo-supply-daily`
2. Execute script (bash): `yarn ipo-supply-daily`
3. Execute script (bash): `yarn signal-ledger-digest`
4. Execute script (bash): `yarn workspace @stock/jobs-runtime data:push`
5. Report from step 2's JSON: flagged names with signal/state/evidence, errors, `filesTouched`.

If step 2 exits non-zero, surface the exact error. Do NOT run logic directly.

Final step: `python scripts/metrics/track_invocation.py --name ipo-supply-daily --type task --model <exact model>`. Purely scripted.
