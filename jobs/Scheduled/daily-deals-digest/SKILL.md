---
name: daily-deals-digest
description: Email top 10 NSE/BSE bulk, block, SAST and insider trades by value, daily at 7:30 PM IST (Mon–Fri)
---

## Context
Daily NSE/BSE deals digest (like screener.in/filings "Latest Trades"). The companion script fetches bulk deals, block deals, SAST Reg 29 and insider (PIT) trades from NSE/BSE, sorts each category by deal value, keeps the top 10, and emails an HTML digest to djplearner@gmail.com via Gmail.

## Execution Plan
Call the following exact script:
1. Execute script (bash): `cd "/Users/darshan.patel/code/personal/stockmarket/packages/jobs-runtime" && node dealsDigest.js`
   (If running inside a sandbox where the folder is mounted, the equivalent mounted path of the stockmarket folder + `/packages/jobs-runtime` is fine — same script.)
2. Read the JSON summary the script prints to stdout and report: per-category counts, top 3 items per category, and the `email` status.
3. If the script exits non-zero, or `email.status` is "error" or "skipped", surface the exact error/reason in your report.

Do NOT run any logic, calculations, data fetching, filtering, sorting, or file modifications directly. Your only job is to orchestrate the script above exactly as specified and report its output.