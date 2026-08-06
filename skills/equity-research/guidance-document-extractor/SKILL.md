---
name: guidance-document-extractor
description: >
  Stages 1+2 of the guidance/PEAD pipeline, merged into one invocation:
  bulk-fetches Transcript+PPT+Result for a batch of companies (a Stockscans
  saved-scan URL, or an explicit ticker list) via a single throwaway
  watchlist + a fixed handful of announcements/scan calls -- never one API
  call per company -- converts each to text, then runs a cheap, recall-first
  pass (performed directly by whichever agent is executing this skill, or a
  cheap-tier subagent it spawns -- NEVER a separate API call to an external
  model provider using a stored key; see Step 2 for why) that pulls out every
  passage PLAUSIBLY containing forward guidance (a number near a
  future-period cue) without judging explicit-vs-directional. Persists one
  durable DB record per
  company (type guidance-documents), always -- including a genuine "nothing
  found" record -- so forward-guidance-extractor can later read it without
  needing the same /tmp files or session. Use whenever the user wants
  guidance documents pulled for a batch of companies: "fetch guidance docs
  for this scan", "get transcripts and PPTs for X", "pull everything filed
  this quarter". Fetch itself costs zero model tokens; only the excerpt pass
  is a (cheap) model turn. Followed by forward-guidance-extractor, which
  reads this skill's DB output and does the actual judgment.
---

# Guidance Document Extractor

Stage 1+2 of `guidance-document-extractor` -> `forward-guidance-extractor`
(optionally chaining `pead-surprise-ranker`). This merges what used to be two
separate skills (`guidance-document-fetcher`, `guidance-relevance-filter`)
into one, because the fetch step is a pure script (zero tokens) and merging
it into the cheap-model step doesn't change token cost at all -- it just
means the user invokes one skill instead of two for the entire acquisition +
pre-filter phase. `guidance-document-fetcher` and `guidance-relevance-filter`
are deprecated in favour of this skill; do not use them for new work.

Follow [`skills/_shared/conventions.md`](../../_shared/conventions.md) — §6
(downloaded PDFs are re-fetchable source documents, never persisted under
`data/` — write them to `/tmp/guidance_docs/<safe_ticker>/`), §11 (report the
compression ratio the excerpt pass achieved), §12 (`ssUrl` -> document URL
resolution), §14 (dummy/throwaway-watchlist pattern for bulk lookups), §15
(companyId sanitization).

## Input

Either:
- `--scan-url <https://www.stockscans.in/scans/saved/...>` — resolves the
  saved scan's full company universe via `resolveUniverse()` (liquidity gate
  OFF: this pipeline wants every company the scan returns, e.g. an "upcoming
  results" list, not just the liquid subset). Every original scan-table
  column (Market Capitalization, Price To Earnings, CFO To PAT, "Change In FII
  Holdings Latest Quarter", FII Holdings, etc. — exact column names as
  returned by the scan, confirmed live 2026-08-06) is preserved per company
  as `scanRow` and carried all the way through to the final DB record —
  nothing needs to be re-fetched later just to report those columns.
- `--tickers NSE:A,NSE:B` or `--tickers-file companies.json` — an explicit
  list, `scanRow` is `null` for these.

## Step 1 — Bulk fetch (script, zero LLM)

```bash
export STOCKSCANS_AUTH_TOKEN="$(grep '^STOCKSCANS_AUTH_TOKEN' .env | cut -d= -f2-)"

node skills/equity-research/guidance-document-extractor/scripts/fetch_guidance_documents.js \
  --scan-url "https://www.stockscans.in/scans/saved/<id>" \
  --out-dir /tmp/guidance_docs > /tmp/guidance_fetch_manifest.json
```

Fetches Transcript, PPT, AND Result for every company in one pass — never
picks one type over another; if two or three exist, all feed extraction.
**Genuinely bulk**: one throwaway watchlist covering the whole batch, then
up to 3 `announcementType`-scoped `scanAnnouncements` calls total (one per
document type — `"Earnings Call"` for Transcript, `"Presentation"` for PPT,
`"Financial Results"` for Result; see
[`docs/stockscans-api-schemas.md`](../../../docs/stockscans-api-schemas.md)
for the confirmed contract, including why `scanId`/`scanName` must be
present on every call), paginated as needed — NOT one API call per company.
If a company found nothing at the default quarter, the whole batch's
"nothing found" subset is retried once against the prior completed quarter
via one more watchlist + up to 3 more calls (still bulk regardless of batch
size).

Output (stdout, redirect to a file): JSON array, one entry per company —
`{ticker, companyId, quarter, quarterYyyymm, found, textPaths,
retriedPriorQuarter, scanRow}`.

## Step 2 — Relevance filter, per company (cheap-tier reasoning, NO external API calls)

"Cheap model" here means: whichever agent/model is currently executing this
skill does this pass itself (or spawns a cheap-tier subagent for it, e.g. a
Haiku-class agent call, if the orchestrating environment supports that) --
it does NOT mean "call out to a separate provider's API using a stored key."
This step has no bundled script for exactly that reason (contrast with Steps
1/3/4, which are scripts) -- the absence is intentional, not a gap to fill by
writing one. The user may invoke this whole skill from Claude, Gemini, or any
other model; Step 2 should ride on whatever is already running the skill,
never spin up a second, separately-billed model client. If that means this
step runs on a flagship-tier model because that's what invoked the skill,
that's fine -- "cheap" describes the JOB (recall-first, no judgment calls),
not a mandate to fetch a specific cheaper model via API.

For EACH company in the manifest with at least one `found` type, read the
raw text at its `textPaths` and extract every passage where a number
(₹/$/%/units/multiplier) appears within roughly the same sentence or table
row as a forward-looking reference: a named future period (FY27, Q1FY27,
"next year", "by FY28"), a guidance-signal verb ("expect", "guide",
"target", "aim", "plan to reach"), or a PPT slide labelled
"Outlook"/"Guidance"/"FY27E"/similar.

**Explicit permissiveness rules (read twice — this is the point of Step 2):**
- Do NOT judge explicit-vs-directional, real-vs-historical, or
  management-vs-analyst here. If it has a number and a forward-period cue
  nearby, extract it — the next stage (forward-guidance-extractor) makes
  that call with full context.
- Do NOT compute or normalise anything (no midpoints, no base-value
  matching). Copy the passage close to verbatim, with 1-2 sentences of
  surrounding context (or the adjacent table row/slide title for a PPT) —
  **when a signal sits inside an analyst's question or a partial answer,
  include the FULL surrounding Q&A turn (question + full answer), not just
  1-2 sentences** — narrow windows around paraphrases are a known recall
  gap (see "Validated" note below).
- Dense sections (a segment-by-segment guidance table, a slide with 6
  targets) stay as ONE excerpt, not split into near-duplicates.
- Nearby historical/trailing numbers ARE worth keeping (often the base value
  the next stage needs) — don't prune them trying to be "guidance-only".

Output one JSON array per company to
`/tmp/guidance_excerpts/<safe_ticker>_relevant_excerpts.json`:

```json
{
  "ticker": "NSE:X",
  "quarter": "Q4FY26",
  "excerpts": [
    {"source": "Transcript", "text": "...", "context": "..."},
    {"source": "PPT", "text": "...", "context": "Slide 14, 'Outlook'"}
  ]
}
```

## Step 3 — Sanity check (script, no LLM)

```bash
python3 skills/equity-research/guidance-document-extractor/scripts/check_excerpt_coverage.py \
  --excerpts /tmp/guidance_excerpts/<safe_ticker>_relevant_excerpts.json \
  --source-texts <Transcript.txt>,<PPT.txt>,<Result.txt>
```

Deterministic word-overlap check against forward-guidance signal keyword
windows in the raw text. Flag (`flag_low_recall: true`, <40% coverage) as a
candidate for tightening Step 1's instructions, not for trusting a thin
excerpt file as final.

## Step 4 — Persist to DB (script, no LLM)

```bash
node skills/equity-research/guidance-document-extractor/scripts/save_guidance_documents.js \
  --manifest /tmp/guidance_fetch_manifest.json \
  --excerpts-dir /tmp/guidance_excerpts
```

Saves ONE `guidance-documents` report per company via `db.saveReport()` —
**always**, including companies where nothing was found at all. This is the
mechanism that lets `forward-guidance-extractor` tell "never run" (no
record) apart from "run, genuinely nothing available" (record exists,
`excerpts: []`, `found` all false) — see that skill's "smart availability
check". `scanRow` (Market Cap, P/E, CFO/PAT, FII columns, etc., when the
input was a scan URL) is stored on the record so the final output can
surface those columns without re-fetching the scan.

If Step 2 hasn't been run for some companies yet, still run Step 4 with
`--excerpts-dir` omitted (or pointing at a partial dir) — records without
excerpts are saved with `excerptsPending: true`, distinct from a genuine
"attempted, nothing found" `found: {all false}` record.

## Validated 2026-08-06 — real improvement, not yet perfect

Piloted end-to-end on NSE:IFBIND (the company that produced a 0/7 total miss
under the old "cheap model does full extraction directly" design): Step 2
captured 71/71 forward-guidance signal keyword windows (100% coverage per
Step 3), compressing an 82KB transcript to a 12.6KB excerpt file (~85%
size reduction). Feeding those excerpts into a flagship-model extraction
pass recovered 5/7 of the items the original full-transcript run found (up
from 0/7). The 2 misses were diagnosable, not silent: one excerpt captured
only an analyst's paraphrase rather than management's own nearby quote
(fixed by the "full Q&A turn" rule above); one genuine passage was omitted
from Step 1 entirely (a real recall gap, still open). Treat the excerpt file
as a strong compression aid, not a guaranteed-complete substitute for the
raw transcript on a single high-stakes name.

## Token-optimization note (report every run)

State: total raw source text size vs. total excerpt file size (compression
ratio), and how many `scanAnnouncements`/watchlist API calls were made
regardless of batch size (should stay roughly constant — 2 watchlists x up
to 3 calls each, ~6-12 calls total — not scale with company count).

## File tree

```
guidance-document-extractor/
├── SKILL.md
└── scripts/
    ├── fetch_guidance_documents.js    (Step 1)
    ├── check_excerpt_coverage.py      (Step 3)
    └── save_guidance_documents.js     (Step 4)
```

## Related skills

- `forward-guidance-extractor` — Stage 3, reads this skill's `guidance-documents`
  DB records and produces the actual judged guidance + Excel, optionally
  chaining `pead-surprise-ranker` when the user explicitly asks for a ranking.
- Deprecated predecessors, do not use: `guidance-document-fetcher`,
  `guidance-relevance-filter`, `transcript-availability-scanner`,
  `guidance-ppt-fallback`.
