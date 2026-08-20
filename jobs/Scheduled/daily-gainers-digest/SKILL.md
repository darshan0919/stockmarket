---
name: daily-gainers-digest
description: Daily Gainers Digest — top gainers by Industry/Sector breakdown emailed daily
---

## Context

Daily top gainers digest. Fetches daily market gainers from Stockscans, classifies gainers by Industry and Sector breakdown, and emails an HTML digest.

## Execution Plan

Call the following exact script:

1. Execute script (bash): `yarn daily-gainers-digest`
2. Read the JSON summary the script prints to stdout and report: sector counts, top gainers per sector, and email status.
3. If the script exits non-zero, surface the exact error in your report.

Do NOT run any logic, calculations, data fetching, filtering, or file modifications directly. Your only job is to orchestrate the script above exactly as specified and report its output.

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`): execute `python scripts/metrics/track_invocation.py --name daily-gainers-digest --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`. No `modelUsed` needed — purely scripted sector classification, no LLM judgment.
