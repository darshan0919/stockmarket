---
name: forward-guidance-extractor
description: >
  Extracts management's FORWARD guidance only (never historical actuals) from
  concall transcripts, for one or hundreds of companies at once -- Revenue/
  Sales/Volume, EBITDA/Gross/Operating/Net margins, PAT/EPS, Debt/Depreciation/
  Tax/Cashflow, Capacity/Utilisation/Order Book/ROCE/ROE/ROA. Use for "extract
  guidance", "forward guidance", "what did management guide for", "guidance
  tracker across my watchlist", "pull PAT/revenue guidance for these tickers",
  or a ticker list needing next-quarter/next-FY targets in one sheet. Always
  use even for a single ticker: enforces DB-first transcript checks, dual
  absolute/relative computation, and a zero-assumption rule (blank cell over
  guessed cell). Outputs a `forward-guidance` report DTO per company plus one
  consolidated .xlsx. NOT for past results or guidance-vs-actual history --
  that's `management-credibility-tracker`.
---

# Forward Guidance Extractor

Extracts ONLY forward-looking, explicitly quantified management guidance from
concall transcripts -- never historical actuals, never vague directional
language ("we expect to grow" is not guidance; "we expect 18-20% revenue growth
in FY27" is). Built to run over a handful of tickers or several hundred in one
pass without burning tokens on network calls or re-deriving arithmetic the
model can get wrong under load.

Follow [`skills/_shared/conventions.md`](../../_shared/conventions.md) throughout
-- in particular §3 (all persistence via `db.js`), §8 (context-first), §9
(files-touched manifest), and §11 (token-optimization suggestion, added below).

## Why script-first matters here specifically

Two failure modes make this skill worthless if done by prompting alone at scale:
1. **Hallucinated guidance.** An LLM asked to fill "300 companies x 15 metrics"
   in one pass will pattern-complete blanks with plausible-sounding numbers.
   The fix is procedural, not a stronger prompt: extraction happens ONE
   company at a time (own reasoning pass per transcript), and the
   absolute<->relative conversion arithmetic is done by a script
   (`compute_guidance_value.py`), not by the model doing mental math under a
   growing context window.
2. **Wasted fetches.** Re-downloading a transcript that's already in the DB, or
   re-fetching for a company whose latest results aren't even out yet, is pure
   waste at scale. Phase 1 below is a hard filter before any extraction reasoning
   starts.

## Inputs

- One or more companies as tickers (`NSE:X` / `BSE:XXXXXX`) or company names
  (resolve names to tickers via `StockscansClient.searchCompany` if needed).
- Optionally a specific quarter; defaults to `latestCompletedQuarter()`
  (`stock-api/src/utils/fiscalQuarter.js`) -- i.e. the most recently reported
  quarter, since the current quarter has no transcript yet.

## Phase 1 -- Filter to companies with an available transcript (script-first, no LLM)

```bash
# Build the bulk request array: [{"ticker":"NSE:X","quarter":"Q1FY27"}, ...]
# (quarter omitted per-entry => latestCompletedQuarter() is used for that entry)
node stock-api/bin/get-latest-concall-transcript.js --bulk '[{"ticker":"NSE:X"},{"ticker":"NSE:Y"}]' \
  | python3 skills/equity-research/forward-guidance-extractor/scripts/classify_transcript_status.py \
  > classified.json
```

`classified.json` has three buckets:
- `available` -- transcript text is already in `data/reports/<id>.json`. Go
  straight to Phase 2 for these; no download needed.
- `fetchable` -- Stockscans has the official Transcript filed, just not yet in
  our DB. Download it (`stock-api/python/fetchers/fetch_documents.py <TICKER>
  -t Transcript --last-n 1 -o /tmp/...`), read it, then save it immediately via
  `node stock-api/bin/save-concall-transcript.js` (see
  `concall-transcript-extractor/SKILL.md` for the exact save call) so the next
  run of this skill is an instant DB hit for that company. Then treat as
  `available`.
- `missing` -- nothing usable exists (`results-not-out` or
  `needs-recording-pipeline`). These companies get NO extraction attempt --
  they go straight into the workbook's "Missing Transcripts" sheet at the end,
  with the `reason` field from `classified.json` verbatim.

Do not skip this gate to "save time" -- extracting guidance from a stale prior
quarter's transcript under the current quarter's label is exactly the kind of
silent error this skill exists to prevent.

## Phase 2 -- Extract guidance (reasoning -- this is the one part a script cannot do)

For each `available`/now-fetched company, read the transcript's `fullText`
(`data/reports/<id>.json`) and pull out every instance where management states
a FORWARD, quantified target. Cover these metric groups, but only where a
number is actually said:

| Category | Metrics |
|---|---|
| Top Line | Revenue / Sales / Volume |
| Margins | EBITDA margin, Gross Profit margin, Operating Profit margin, Net Profit margin |
| Bottom Line | PAT, EPS |
| Balance Sheet | Debt, Depreciation, Tax, Cash flow |
| Key Metrics | Capacity, Utilisation, Order Book, ROCE, ROE, ROA |

For every guidance statement found, produce one JSON item matching the schema
documented at the top of `scripts/compute_guidance_value.py`:

```json
{
  "metric_category": "Top Line",
  "metric": "Revenue",
  "period_guided": "FY27",
  "absolute_value": null,
  "absolute_unit": "cr",
  "relative_pct": 20.0,
  "base_value": 1250.0,
  "base_period": "FY26",
  "base_value_source_quote": "we closed FY26 at about 1,250 crores of revenue",
  "quote": "we are guiding for 18-20% revenue growth in FY27",
  "confidence": "explicit"
}
```

**Zero-assumption rule -- this is the whole point of the skill:**
- Only extract statements with `"confidence": "explicit"` -- a specific number,
  percentage, or range tied to a specific period. Skip "we remain confident
  about growth", "healthy pipeline", "should do well" entirely -- do not
  invent a row for it.
- `base_value` / `base_value_source_quote` may ONLY be filled if the SAME
  transcript (or a confirmed prior filing you have already read this run)
  states that base actual explicitly. If you don't have a quotable base
  actual, leave `base_value` and `base_value_source_quote` as `null` -- the
  computation script will then correctly leave the derived field blank rather
  than you guessing it.
- If management refers back to OLDER guidance (e.g. "as we said last quarter,
  we still expect...") and that prior quarter's transcript is NOT in
  `classified.json`'s `available` set, still record the guidance (it's being
  reaffirmed live, so it's confirmed as of THIS transcript) but set
  `"stale_reference": true` on the item and note which prior quarter it
  referenced. If the prior guidance is being referenced WITHOUT reaffirmation
  ("our FY28 target remains" said in passing, un-reaffirmed) and you cannot
  verify the original quarter's transcript, flag the company via
  `--stale-note` in Phase 4 rather than silently including it.

Write each company's items to its own JSON array file, e.g. `NSE_X_items.json`.

## Phase 3 -- Compute absolute <-> relative (script, no LLM)

```bash
python3 skills/equity-research/forward-guidance-extractor/scripts/compute_guidance_value.py \
  --batch NSE_X_items.json > NSE_X_enriched.json
```

This fills whichever of `absolute_value`/`relative_pct` management didn't state
directly, but only when `base_value` + `base_value_source_quote` are both
present (arithmetic on two confirmed facts, not a guess). It also produces the
single-cell `display` string the workbook uses, e.g. `"1500 cr (+20%)"` or
`"20% (+150 cr)"` -- relative always shown in parentheses, exactly as requested.
If neither can be derived, `display` is an empty string -- leave that cell
blank in the sheet, never fill it with a dash-as-placeholder-for-a-guess.

## Phase 4 -- Persist per company (script, no LLM)

```bash
node skills/equity-research/forward-guidance-extractor/scripts/save_forward_guidance.js \
  --ticker NSE:X --quarter Q1FY27 --date 2026-07-15 \
  --guidance-file NSE_X_enriched.json \
  --transcript-id <the id from classified.json/data/reports> \
  [--stale-note "FY28 target reaffirmed in passing; original guidance quarter's transcript not in DB"]
```

Storage destination (`docs/DATA_RULES.md` §2, "Analysis/report DTO" row):
`reports.json` + `reports/<id>.json`, `type: "forward-guidance"`, written
exclusively via `db.saveReport()` inside the script above -- never a raw file
write. Collect each printed `id` for Phase 5.

## Phase 5 -- Build the consolidated workbook (script, no LLM)

```bash
# Assemble the array of full DTOs (read each data/reports/<id>.json back), plus
# the `missing` array from Phase 1's classified.json, then:
python3 skills/equity-research/forward-guidance-extractor/scripts/build_guidance_workbook.py \
  --dtos all_company_dtos.json \
  --missing missing_companies.json \
  --out "Forward_Guidance_$(date +%Y%m%d).xlsx"
```

Produces two sheets: **Forward Guidance** (one row per metric per company, the
`Guidance (Absolute (Relative %))` column holding the `display` string) and
**Missing Transcripts** (every company that never made it past Phase 1, with
`reason`), highlighted. Companies with `staleGuidanceNote` set get their "Stale
Guidance Flag" column highlighted too.

Copy the finished file to the user's workspace folder and present it with
`present_files`.

## Phase 6 -- Finish the run

1. `node packages/jobs-runtime/scripts/data.js push` (mandatory, per
   `conventions.md` §6).
2. Report a **Files touched** section (per `conventions.md` §9): every
   `reports.json`/`reports/<id>.json` written (with the record count), plus the
   `.xlsx` path, read from `db.touchedFiles()` / the `data:push` output -- never
   from memory.
3. **Always end the run with a "How to save tokens/time next run" note** (see
   below) -- this applies to every invocation of this skill, no exceptions.

## Token-optimization suggestion (every run, no exceptions)

This skill processes hundreds of companies per run, so token spend compounds
fast. At the end of every run, look back at what actually happened and suggest
concretely, based on THIS run's evidence, one or more of:
- Which companies could be skipped next time because they're already in
  `available` (no repeated Phase 1 fetch needed) -- report the DB-hit rate.
- Whether a large fraction of `missing` companies were `results-not-out` (in
  which case re-running before the next results season is pure waste -- suggest
  a re-run date).
- Whether the transcript-reading step (Phase 2) is the dominant cost driver
  and, if so, whether a lower-cost model (e.g. Gemini Flash/Haiku-class) could
  do the mechanical "find numeric guidance sentences" pass as a pre-filter,
  reserving the stronger model only for ambiguous "is this explicit or
  directional?" judgment calls.
- Any batching opportunity missed this run (e.g. companies fetched one at a
  time that should have gone through `--bulk`).

This is a standing convention, not specific to a single run's content --
`skills/_shared/conventions.md` §11 records it so every skill (not just this
one) is expected to close its run this way; repeat it here because this skill
is the one most likely to run at real scale.

## Pitfalls

- **Margins are already a %, don't relative-ize them into nonsense.** A
  "we expect EBITDA margin of 18%, up from 16%" is `absolute_value: 18,
  absolute_unit: "%"` with the DELTA expressed as basis points in the quote,
  not run through the revenue-style relative-growth formula.
- **Ranges.** "18-20% growth" -- extract as a range in the `quote`, and put the
  midpoint (19%) in `relative_pct` with the full range preserved in the quote
  column so the user sees the exact language, not just a collapsed number.
- **Don't extract analyst-stated numbers as guidance.** Only management's own
  words count; an analyst's estimate that management merely doesn't contradict
  is not guidance.
- **One company, one reasoning pass.** Don't try to hold 50 transcripts in
  context at once "for efficiency" -- that's exactly what causes cross-company
  hallucination at scale. Batch the deterministic steps (Phases 1, 3, 5), never
  the extraction reasoning itself.

## File tree

```
forward-guidance-extractor/
├── SKILL.md                              (this file)
├── scripts/
│   ├── classify_transcript_status.py     (Phase 1 bucketing)
│   ├── compute_guidance_value.py         (Phase 3 absolute<->relative)
│   ├── save_forward_guidance.js          (Phase 4 DB write)
│   └── build_guidance_workbook.py        (Phase 5 .xlsx builder)
└── references/
    └── metric_taxonomy.md                (full metric list + edge-case rulings)
```
