---
name: sector-pe-snapshot-weekly
description: Sector PE Snapshot Weekly — stores one weekly snapshot of industry median P/E (204 industries) to build the PE history the sector-PE-phase automation needs
---

## Context

Stockscans exposes only the current 'Industry PE Median', so history is accumulated by snapshotting (one event `sector_pe_snapshot` per ISO week; re-runs in the same week skip unless `--force`). Median of constituents (mcap >= Rs 500 Cr, P/E > 0, >= 3 names) is stored beside the platform median (they matched in the first run). The re-rating-phase / terminal-PE evaluator (`kba_x-soic-handles_valuation-playbook_sector-pe-phase`) is NOT built until >= 26 weekly snapshots exist. Zero LLM.

## Execution Plan

1. `export STOCKMARKET_JOB_NAME=sector-pe-snapshot-weekly`
2. Execute script (bash): `yarn sector-pe-snapshot-weekly`
3. Execute script (bash): `yarn workspace @stock/jobs-runtime data:push`
4. Report from step 2's JSON: week, industries, `filesTouched`.

If step 2 exits non-zero, surface the exact error. Suggested slot: Sunday.

Final step: `python scripts/metrics/track_invocation.py --name sector-pe-snapshot-weekly --type task --model <exact model>`. Purely scripted.
