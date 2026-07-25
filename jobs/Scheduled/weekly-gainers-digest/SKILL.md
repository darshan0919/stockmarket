---
name: weekly-gainers-digest
description: Weekly Gainers Digest — top weekly gainers by Industry/Sector with streak scoring emailed weekly
---

Follow the job at /Users/darshan.patel/code/personal/stockmarket/jobs/Scheduled/weekly-gainers-digest/SKILL.md exactly.

Execute: `cd "/Users/darshan.patel/code/personal/stockmarket/packages/jobs-runtime" && node weeklyGainersDigest.js`

Read the JSON summary the script prints to stdout and report: total gainers, top industries and sectors, and the `email` status. If the script exits non-zero, or `email.status` is "error" or "skipped", surface the exact error/reason. Do NOT run any logic, calculations, data fetching, filtering, sorting, or file modifications directly — your only job is to orchestrate the script exactly as specified and report its output.
