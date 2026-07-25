---
name: periodic-dead-code-scan
description: Periodic Dead Code & Coding Practice Scan — scans monorepo, skills, scheduled jobs, and screener application to sync tasks to data/tasks.json
---

## Context

Periodic monorepo dead code and coding practice audit. Scans all workspace packages (`screener-api`, `screener-web`, `stock-api`, `cloud-utils`, `packages/jobs-runtime`), scheduled tasks, and skills to identify unreferenced source files, unused package dependencies, obsolete temporary scripts, and coding standard violations (e.g. hardcoded absolute paths).

## Output DTO

The job syncs dead code tasks directly into `data/tasks.json` with prefix `"Dead Code:"` and generates a detailed markdown report at `DEAD_CODE_ACTION_ITEMS.md`.

## Execution Plan

Call the following exact script:

1. Execute script (bash): `cd "/Users/darshan.patel/code/personal/stockmarket" && yarn workspace @stock/jobs dead-code-scanner`
2. Inspect stdout output to confirm action items generated.
3. If the script exits non-zero, surface the exact error in your report.
