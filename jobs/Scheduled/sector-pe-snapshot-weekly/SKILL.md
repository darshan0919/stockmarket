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

## Email delivery (mandatory last step of EVERY run)

The owner reads job output in Gmail, so this job must always end with an email — success, partial or failure, even when there was nothing new (a one-line "nothing to do" email is the heartbeat that proves the job ran).

1. Write the report text — sector PE snapshot: biggest PE moves vs last week, sectors stretched/cheap, any data gaps — as markdown to a temp file _outside the repo_ (`f=$(mktemp)`). Keep it to what matters, lead with the headline.
2. Execute script (bash): `STOCKMARKET_JOB_NAME=sector-pe-snapshot-weekly yarn job-report-email --job sector-pe-snapshot-weekly --status <ok|partial|failed> --title "<one-line outcome>" --body-file "$f"`
3. If the run stopped early (a dependency check failed, a script exited non-zero), still run step 2 with `--status failed` and the exact error as the body.
4. If the command exits non-zero (`email.status` is `skipped` or `error`, e.g. `GOOGLE_APP_PASSWORD not set`), surface the exact reason in your final report — never report the job as delivered.
