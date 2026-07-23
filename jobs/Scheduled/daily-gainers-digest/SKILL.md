---
name: daily-gainers-digest
description: Daily Gainers Digest — top gainers by Industry/Sector breakdown emailed daily
---

Follow the job at /Users/darshan.patel/code/personal/stockmarket/jobs/Scheduled/daily-gainers-digest/SKILL.md exactly.

Execute: `cd "/Users/darshan.patel/code/personal/stockmarket/packages/jobs-runtime" && node dailyGainersDigest.js`

Read the JSON summary the script prints to stdout and report: total gainers, top industries and sectors, and the `email` status. If the script exits non-zero, or `email.status` is "error" or "skipped", surface the exact error/reason. Do NOT run any logic, calculations, data fetching, filtering, sorting, or file modifications directly — your only job is to orchestrate the script exactly as specified and report its output.