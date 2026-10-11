---
name: sector-rotation-daily
description: Sector Rotation Daily — S3 focus-name concentration by industry (daily) and S2 sector relative-strength rising / X4 rollover (weekly) into the signal ledger
---

## Context

From `kba_x-soic-handles_technical-playbook_sector-rs` and taxonomy S2/S3/X4. Purely scripted. S3 (daily, no API calls): industries holding >= 3 names and >= 25% of the names currently in an entry-side ledger state (E1 / E2 / MTF-flush; needs >= 8 such names; industry from `data/companies.json`) — chartist "3-4 of 10-12 focus names in one group". S2/X4 (once per ISO week, `--force` to redo): one Stockscans `Performance` scan of Nifty 500, industry median 1M/3M return vs the universe median; S2 = 1M outperformance and rising (vs last week's snapshot `sector_rs_snapshot`, or recent > 3M monthly average on the first week), X4 = was leading on 3M but now lagging on 1M. Thresholds are ASSUMPTIONS (`lib/sectorRotation.js`); the market is the universe median, not an index return; industries with < 5 members are ignored; "other sectors improving" is not modelled. Creator: `sector-rotation`.

Suggested slot: ~22:40 IST (after sector-clusters-daily 22:25, before exit-watch 22:55).

## Execution Plan

1. `export STOCKMARKET_JOB_NAME=sector-rotation-daily`
2. Execute script (bash): `yarn sector-rotation-daily`
3. Execute script (bash): `yarn signal-ledger-digest`
4. Execute script (bash): `yarn workspace @stock/jobs-runtime data:push`
5. Report from step 2's JSON: S3 flagged industries with names, weekly S2/X4 top/bottom industries (when it ran), errors, `filesTouched`.

If step 2 exits non-zero, surface the exact error. Do NOT run logic directly.

Final step: `python scripts/metrics/track_invocation.py --name sector-rotation-daily --type task --model <exact model>`. Purely scripted.
