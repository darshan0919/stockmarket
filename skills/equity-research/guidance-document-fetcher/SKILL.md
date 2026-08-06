---
name: guidance-document-fetcher
description: >
  Zero-LLM document acquisition stage for the guidance/PEAD pipeline: for a
  batch of tickers, checks Stockscans for each of Transcript, PPT, and Result
  at the target quarter, downloads WHICHEVER exist (never conditionally,
  never picking one over another -- if both a concall Transcript and an
  investor PPT are filed, both are fetched and both feed the pipeline), and
  converts each to plain text via pdftotext. Auto-retries the prior completed
  quarter if nothing at all was found and the quarter was defaulted (handles
  "upcoming results" watchlists where the naive latest-quarter guess points
  at an unreported quarter). Pure API calls + file I/O -- no model reasoning
  anywhere, run as a script/tool step, never a model turn. Use as the FIRST
  stage before guidance-relevance-filter / forward-guidance-extractor
  whenever the user wants guidance pulled for a batch of companies, or says
  "fetch guidance documents", "get the transcript and PPT for X", "pull
  everything filed this quarter for these tickers".
---

# Guidance Document Fetcher

Stage 1 of the 4-stage guidance/PEAD pipeline
(`guidance-document-fetcher` → `guidance-relevance-filter` →
`forward-guidance-extractor` → `pead-surprise-ranker`). This stage's only
job is getting every guidance-bearing document that exists for a company at
a given quarter onto disk as plain text — it makes no judgment about which
document is "better" or "enough"; that's explicitly NOT this skill's call.

Follow [`skills/_shared/conventions.md`](../../_shared/conventions.md) — §6
(downloaded PDFs are re-fetchable source documents, never persisted under
`data/` — write them to `/tmp/guidance_docs/<safe_ticker>/`), §12 (`ssUrl` →
document URL resolution), §15 (companyId sanitization, handled inside
`StockscansClient`/`documentsFetcher.js`, not re-implemented here).

## Design principle: always fetch everything that exists, never fall back conditionally

The old version of this pipeline treated Transcript as primary and PPT as a
secondary "fallback tier" only checked when the transcript had nothing —
sequential, and it meant a company with BOTH a rich transcript AND a PPT with
additional slide-only numbers (capex tables, order-book charts that rarely
get read out loud on the call) only ever got the transcript read. Going
forward: fetch Transcript, PPT, AND Result for every company in one pass,
every time. If only one type exists, that's what downstream stages get. If
two or three exist, all of them feed the extraction stage together — more
signal, no extra fetch cost (the API calls are cheap; the expensive resource
being protected here is model tokens downstream, not fetch calls).

## Step 1 — Fetch (script, no LLM)

```bash
export STOCKSCANS_AUTH_TOKEN="$(grep '^STOCKSCANS_AUTH_TOKEN' .env | cut -d= -f2-)"

node skills/equity-research/guidance-document-fetcher/scripts/fetch_guidance_documents.js \
  --tickers-file companies.json \
  --types Transcript,PPT,Result \
  --out-dir /tmp/guidance_docs
```

`companies.json`: `[{"ticker":"NSE:A","quarter":"Q4FY26"}, ...]` — `quarter`
per-entry is optional; omitted entries default to `latestCompletedQuarter()`.
For a single ad-hoc ticker, `--tickers NSE:A,NSE:B` works without a file.

Output (stdout): one JSON object per ticker —
```json
{
  "ticker": "NSE:RATEGAIN",
  "quarter": "Q4FY26",
  "quarterYyyymm": "202603",
  "found": { "Transcript": true, "PPT": true, "Result": true },
  "textPaths": {
    "Transcript": "/tmp/guidance_docs/NSE_RATEGAIN/NSE_RATEGAIN_Transcript_202603.txt",
    "PPT": "/tmp/guidance_docs/NSE_RATEGAIN/NSE_RATEGAIN_PPT_202603.txt",
    "Result": "/tmp/guidance_docs/NSE_RATEGAIN/NSE_RATEGAIN_Result_202603.txt"
  },
  "retriedPriorQuarter": false
}
```

**Auto-retry behaviour (built into the script, not a separate step):** if
NONE of the requested types were found AND the quarter was defaulted (not
explicitly passed), the script retries once against the immediately prior
completed quarter before giving up — this is exactly the "upcoming results"
watchlist case (39/39 companies showing `results-not-out` for the naive
latest-quarter guess, discovered the hard way in an earlier run of this
pipeline). If the caller passed an explicit `quarter`, no retry happens —
respect what was asked for.

Note the script can also surface a PARTIAL result honestly — e.g. a company
whose quarterly Result has just been filed but whose Transcript/PPT haven't
been uploaded yet shows `found: {Result: true, Transcript: false, PPT:
false}` for the CURRENT quarter with no retry needed, since something real
was found. Don't conflate "nothing found, retry" with "one type found,
others pending" — the script already keeps these distinct.

## Step 2 — Hand off (still no LLM)

Pass the full output array to `guidance-relevance-filter` — it reads
`textPaths` directly, one company/document-type pair at a time.

Companies where ALL of `found` came back `false` (even after the retry) have
nothing to hand off — carry them forward as an explicit exclusion entry all
the way to the final PEAD ranking's "No Visibility" sheet; never silently
drop a ticker at this stage.

## Token-optimization note

This stage costs zero model tokens per run regardless of batch size — the
per-company cost is a handful of HTTP calls plus a local `pdftotext`
invocation. If a batch is being re-run (e.g. daily during results season),
skip re-fetching a `(ticker, quarter, documentType)` combination whose text
file already exists on disk from a prior run in the same session — the
`fetchDocuments()` module underneath this script already does this
(`cached: true` in its own manifest), so re-running this script is cheap by
construction; no extra caching layer needed here.

## File tree

```
guidance-document-fetcher/
├── SKILL.md
└── scripts/
    └── fetch_guidance_documents.js   (Step 1)
```
