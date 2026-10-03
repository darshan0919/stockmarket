---
name: transcript-availability-scanner
description: >
  Zero-LLM gate: given a list of tickers (and optionally a target quarter),
  bulk-checks Stockscans for each company's concall Transcript status and
  buckets them into available (already in our DB) / fetchable (Stockscans has
  the official filing, not yet cached) / missing (results not out, or no
  Transcript filed for that quarter). This is pure API calls + deterministic
  bucketing logic — no model reasoning is required for any part of it, so an
  orchestrator should invoke this as a plain script/tool step, not as a model
  turn, whenever that's supported. Use as the FIRST step before
  forward-guidance-extractor, consecutive-filings-diff, concall-analysis,
  quarterly-result-analysis, or any other skill that needs to know "does a
  transcript exist for these companies yet" before deciding what to read.
  Was previously inlined as forward-guidance-extractor's Phase 1 — split out
  so downstream skills, and cost-conscious orchestrators, can call the gate
  without paying for a full forward-guidance-extractor model invocation just
  to find out a company's results aren't out yet.
---

# Transcript Availability Scanner

A pure filter: no synthesis, no extraction, no judgment call anywhere in this
skill. Its only job is answering "for these N companies (and this quarter),
which ones have a Transcript we can actually read right now, which ones need
a quick download-and-cache first, and which ones have nothing usable at all?"
— then handing the `available`/`fetchable` bucket to whichever skill asked,
and the `missing` bucket back as an honest exclusion list (never silently
dropped).

Follow [`skills/_shared/conventions.md`](../../_shared/conventions.md) — §2
(`STOCKSCANS_AUTH_TOKEN` from the Env abstraction / `.env`, never parsed by
hand beyond what's shown below), §9 (files-touched — this skill typically
touches nothing under `data/`, since availability checks are not persisted;
say so explicitly rather than listing nothing with no explanation).

## Why this has no LLM step at all

Every downstream consumer used to inline this same bulk-check-and-bucket
logic at the start of its own run, paying for a model turn on the "which
quarter is even completed yet" question before it ever got to real reasoning.
Bucketing on `status` strings returned by the API is a lookup table, not a
judgment call — pulling it into its own skill means an orchestrator (or a
scheduled job) can run it as a bare script/tool invocation with no model
attached, and only spin up a model (cheap or flagship, per the calling
skill's own tier) for the subset of companies that actually have something to
read.

## Step 1 — Resolve tickers + quarter, run the bulk check (script only)

```bash
export STOCKSCANS_AUTH_TOKEN="$(grep '^STOCKSCANS_AUTH_TOKEN' .env | cut -d= -f2-)"

# Build the bulk request: [{"ticker":"NSE:X","quarter":"Q4FY26"}, ...]
# Quarter omitted per-entry => latestCompletedQuarter() is used for that entry.
yarn workspace @stock/api get-latest-concall-transcript --bulk-file <companies.json> \
  > /tmp/bulk_result.json
```

`companies.json` is a plain JSON array of `{ticker, quarter?}` — write it with
a script/one-liner, not by hand-typing many entries. If the caller doesn't
know the right quarter to ask for, **do not assume the current-quarter
default is what they want** — a watchlist of "upcoming results" companies (no
Q*FY* filed yet) should be re-run with the PRIOR completed quarter explicitly,
since `latestCompletedQuarter()` can point at a quarter nobody has reported
yet. Detect this cheaply: if `--bulk-file` with no `quarter` per-entry comes
back 100% `results-not-out`, retry the whole batch with the quarter before
that (see forward-guidance-extractor's own history of this exact gotcha) —
this retry is still zero-LLM, just a second script call.

## Step 2 — Classify (script only)

_(Note: Deprecated — callers now use `StockscansClient.latestTranscript()` directly)._

## Step 3 — Hand off (no LLM here either)

Return `available` + `fetchable` to whichever skill invoked this one (they
proceed to their own extraction/reasoning step), and `missing` as the honest
exclusion list — callers must surface it, never drop it silently.

## File tree

```
transcript-availability-scanner/
└── SKILL.md   (deprecated -- superseded by StockscansClient.latestTranscript())
```
