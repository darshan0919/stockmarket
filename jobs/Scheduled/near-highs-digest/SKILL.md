---
name: near-highs-digest
description: Near Highs Digest — Fetches stocks near highs from stockscans, analyzes by Industry and Sector, and emails digest
---

## Context
Near Highs digest scheduled task. The companion script fetches stocks near 52W highs from stockscans.in based on specific criteria (e.g., 52WH distance < 20, Market Cap >= 500, etc.). It counts the occurrences per Industry and Sector, sorts them descending, and sends an HTML email digest to DEALS_DIGEST_TO.

## Execution Plan
Call the following exact script:
1. Execute script (bash): `cd "/Users/darshan.patel/code/personal/stockmarket/packages/jobs-runtime" && node nearHighsDigest.js`
   (If running inside a sandbox where the folder is mounted, the equivalent mounted path of the stockmarket folder + `/packages/jobs-runtime` is fine — same script.)
2. Read the JSON summary the script prints to stdout and report: total near highs, top industries and sectors, and the `email` status.
3. If the script exits non-zero, or `email.status` is "error" or "skipped", surface the exact error/reason in your report.

Do NOT run any logic, calculations, data fetching, filtering, sorting, or file modifications directly. Your only job is to orchestrate the script above exactly as specified and report its output.
