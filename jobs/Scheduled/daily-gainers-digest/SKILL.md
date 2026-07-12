---
name: daily-gainers-digest
description: Daily Gainers Digest — Fetches top gainers from stockscans, analyzes by Industry and Sector, and emails digest
---

## Context
Daily gainers digest scheduled task. The companion script fetches top gainers from stockscans.in based on Market Cap >= 500 and Returns 1D >= 5%. It counts the occurrences per Industry and Sector, sorts them descending, and sends an HTML email digest to DEALS_DIGEST_TO.

## Execution Plan
Call the following exact script:
1. Execute script (bash): `cd "/Users/darshan.patel/code/personal/stockmarket/packages/jobs-runtime" && node dailyGainersDigest.js`
   (If running inside a sandbox where the folder is mounted, the equivalent mounted path of the stockmarket folder + `/packages/jobs-runtime` is fine — same script.)
2. Read the JSON summary the script prints to stdout and report: total gainers, top industries and sectors, and the `email` status.
3. If the script exits non-zero, or `email.status` is "error" or "skipped", surface the exact error/reason in your report.

Do NOT run any logic, calculations, data fetching, filtering, sorting, or file modifications directly. Your only job is to orchestrate the script above exactly as specified and report its output.
