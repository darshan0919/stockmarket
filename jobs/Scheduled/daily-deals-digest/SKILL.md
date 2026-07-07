---
name: daily-deals-digest
description: Deals Digest — top 10 NSE/BSE bulk/block/SAST/insider trades by value
---

## Context
Daily NSE/BSE deals digest (like screener.in/filings "Latest Trades"). The companion script fetches bulk deals, block deals, SAST Reg 29 and insider (PIT) trades from NSE/BSE, sorts each category by deal value, keeps the top 10, and emails an HTML digest to djplearner@gmail.com via Gmail.

## Output DTO
The script writes the canonical JSON DTO to `jobs/data/documents/deals_digest/{YYYY}/{MM}/digest_{YYYYMMDD}.json` via `StorageService.saveJson` BEFORE composing the email — each per-company group record (`bulk10`/`block10`/`sast10`/`insider10`) carries `companyId` (`EXCH:SYMBOL`), `creationTime`, `modifiedTime`, and `creator: "daily-deals-digest"` per `skills/tooling/output-dto-standard/SKILL.md`. The email HTML is a render of that JSON, never an independent draft.

## Execution Plan
Call the following exact script:
1. Execute script (bash): `cd "/Users/darshan.patel/code/personal/stockmarket/packages/jobs-runtime" && node dealsDigest.js`
   (If running inside a sandbox where the folder is mounted, the equivalent mounted path of the stockmarket folder + `/packages/jobs-runtime` is fine — same script.)
2. Read the JSON summary the script prints to stdout and report: per-category counts, top 3 items per category, and the `email` status.
3. If the script exits non-zero, or `email.status` is "error" or "skipped", surface the exact error/reason in your report.

Do NOT run any logic, calculations, data fetching, filtering, sorting, or file modifications directly. Your only job is to orchestrate the script above exactly as specified and report its output.