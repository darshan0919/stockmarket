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
4. Once done with generating the "Dead Code:" tasks, complete them. Make any necessary refactors and code changes. Commit the changes with "DEAD_CODE: " as the prefix.
5. For all the "Dead Code:" tasks that were completed, mark them as complete in `data/tasks.json`. If any tasks are pending i will check them manually.

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`): execute `python scripts/metrics/track_invocation.py --name periodic-dead-code-scan --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`. No `modelUsed` needed — purely scripted static analysis, no LLM judgment.
