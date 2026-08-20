---
name: daily-deals-digest
description: Deals Digest — top 10 NSE/BSE bulk/block/SAST/insider trades by value
---

## Context

Daily NSE/BSE deals digest (like screener.in/filings "Latest Trades"). The companion script fetches bulk deals, block deals, SAST Reg 29 and insider (PIT) trades from NSE/BSE, sorts each category by deal value, keeps the top 10, and emails an HTML digest to djplearner@gmail.com via Gmail.

## Output DTO

The script writes the canonical JSON DTO to `the events collection (type=`deal`) + data/runs/{YYYY}/{MM}/digest_{YYYYMMDD}.json` via `StorageService.saveJson` BEFORE composing the email — each per-company group record (`bulk10`/`block10`/`sast10`/`insider10`) carries `companyId` (`EXCH:SYMBOL`), `creationTime`, `modifiedTime`, and `creator: "daily-deals-digest"` per `skills/tooling/output-dto-standard/SKILL.md`. The email HTML is a render of that JSON, never an independent draft.

## Execution Plan

Call the following exact scripts, in order:

1. Execute script (bash): `yarn deals-digest`
   Optional flags (defaults shown match today's behavior — omit them for the normal scheduled run):
   `--top-n <n>` (default 10, companies per category), `--sast-quote-limit <n>` (default 40, max
   symbols priced for the SAST value estimate), `--max-xbrl <n>` (default 600), `--date YYYY-MM-DD`,
   `--no-email`, `--force`.
2. Read the JSON summary the script prints to stdout and report: per-category counts, top 3 items per category, and the `email` status.
3. If the script exits non-zero, or `email.status` is "error" or "skipped", surface the exact error/reason in your report.
4. Execute script (bash): `yarn verify-deals-digest` (same `--date` as step 1, if one was passed).
   This is a read-only reconciliation pass over the JSON snapshot step 1 just wrote — it never
   re-fetches NSE/BSE. It checks for the exact bug classes that silently dropped/duplicated
   companies on 2026-07-30 (see `packages/jobs-runtime/verifyDealsDigest.js` header): fetch errors,
   duplicate company identities within a category, never-filter watchlist companies missing from
   output, `company-master.json` staleness (`--stale-days N`, default 5), and an all-zero-rows
   sanity check.
5. Read the JSON the verify script prints to stdout. If `hasIssues` is `true`, include the full
   `issues` array in your report to Darshan — each issue names the specific company/category
   affected, not just "something's wrong". If `hasIssues` is `false`, a one-line "reconciliation:
   OK" is enough.

Do NOT run any logic, calculations, data fetching, filtering, sorting, or file modifications directly. Your only job is to orchestrate the scripts above exactly as specified and report their output.

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`): execute `python scripts/metrics/track_invocation.py --name daily-deals-digest --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`. No `modelUsed` needed on the deal records — this is a purely scripted sort-by-value digest, no LLM judgment.
