---
model: flash_lite
name: policy-event-tracker
description: Policy Event Tracker — weekly discovery of dated Indian policy events mapped to sector baskets, then script-computed price absorption vs CNX500 into the signal ledger (P1)
---

## Context

Top-down policy layer (`docs/SOIC_SIGNAL_PLAN.md`; macro playbook §4: "policy is necessary, not sufficient — the test is orders and earnings"). Two halves:

- **Discovery (agent, weekly, Sunday)** — judgement: find genuinely NEW dated policy events from the last 7 days (Union Cabinet approvals, budget/tax/GST changes, tariffs and trade deals, PLI/subsidy schemes, RBI/SEBI regulation, capex programmes) and map each to a basket of 3-25 NSE/BSE tickers that are the direct sector proxies. This is the only LLM step.
- **Absorption (script, daily, zero LLM)** — `policyEventsDaily.js run`: basket equal-weight return since the event minus CNX500 → ledger `P1-policy-absorption` (`detected` <5% excess, `confirmed` 5-20%, `spent` ≥20%; 120-day age-out). Thresholds are ASSUMPTIONS, uncalibrated. `confirmed` means "check orders/earnings", never "buy".

## Execution Plan (weekly discovery)

1. `export STOCKMARKET_JOB_NAME=policy-event-tracker`
2. Candidates, in this order (registry: `packages/jobs-runtime/lib/policySources.json`, never add a URL that has not been fetched successfully):
   a. `node packages/jobs-runtime/lib/policySourcesFetch.js --days 7` — zero-LLM pass over the machine-readable official feeds (RBI press releases, SEBI RSS). Returns dated, https-linked `candidates` (drop `likelyNoise`; `kindHint` is only a hint), `webOnly` sources, and `errors` (a failed feed = say so in the report, do not guess its contents).
   b. For each `webOnly` source (PIB for Union Cabinet decisions, CBIC for GST/customs) follow its `agentHint`: WebSearch (standard first; extended only if thin) then WebFetch the official page.
   c. Every event needs an official-source URL where one exists PLUS a second independent source (WebSearch). Judgement stays with you: is it genuinely NEW, dated within 7 days, and market-relevant (routine auctions/orders are not events)? NEVER invent a date, URL or ticker; if the date or source is not verifiable, skip the event and say so.
3. Skip events already registered: check `yarn workspace @stock/jobs-runtime policy-events run --dry-run` output (`report[].title`).
4. For each new event write `{date, title, kind, sectors, basket, sourceUrls, summary}` to a temp JSON (basket = direct beneficiaries/victims that trade in India with real liquidity; state the mapping rationale in `summary`). Validate with `yarn workspace @stock/jobs-runtime policy-events add --file <json> --dry-run`, fix rejections, then run without `--dry-run`.
5. `yarn workspace @stock/jobs-runtime policy-events run --email` (weekly discovery run only: also emails the absorption table with source links to `DEALS_DIGEST_TO`; the daily run omits `--email` and stays silent) then `yarn workspace @stock/jobs-runtime data:push`.
6. Report: events added (with source links), events skipped and why, current absorption table, `filesTouched`. Set any note's `modelUsed` to the exact executing model.

## Daily absorption (script only)

`yarn workspace @stock/jobs-runtime policy-events run` is appended to the `sector-clusters-daily` plan.

Final step: `python scripts/metrics/track_invocation.py --name policy-event-tracker --type task --model <exact model>`.
