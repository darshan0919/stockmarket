---
name: periodic-dead-code-scan
description: Periodic Dead Code & Coding Practice Scan — weekly scan for dead code, unused dependencies, and practice violations
---

## Context
Weekly monorepo dead code audit. The companion script scans workspaces (`screener-api`, `screener-web`, `stock-api`, `cloud-utils`, `packages/jobs-runtime`), scheduled tasks, and skills for unreferenced source files, unused package dependencies, obsolete temporary scripts, and hardcoded absolute path violations.

## Output DTO
The script syncs task action items directly into `data/tasks.json` with the prefix `"Dead Code:"` and updates `DEAD_CODE_ACTION_ITEMS.md`.

## Execution Plan
Call the following exact script:
1. Execute script (bash): `yarn dead-code:scan`
2. Read the summary stdout output and report: total items found, category breakdown, and updated `data/tasks.json` count.
3. If the script exits non-zero, surface the exact error in your report.

Do NOT run any logic, calculations, or file modifications directly. Your only job is to orchestrate the script above exactly as specified and report its output.

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`): execute `python scripts/metrics/track_invocation.py --name periodic-dead-code-scan --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`. No `modelUsed` needed — purely scripted static analysis, no LLM judgment.
