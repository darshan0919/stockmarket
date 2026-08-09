---
name: forward-guidance-extractor
description: >
  Stage 2 (flagship model, final) of the now-2-skill guidance/PEAD pipeline:
  reads guidance-document-extractor's persisted DB records (guidance-documents
  reports -- cheap-model-filtered candidate excerpts covering whichever of
  Transcript/PPT/Result exist for that company) and extracts management's
  FORWARD guidance only (never historical actuals) -- Revenue/Sales/Volume,
  EBITDA/Gross/Operating/Net margins, PAT/EPS, Debt/Depreciation/Tax/Cashflow,
  Capacity/Utilisation/Order Book/ROCE/ROE/ROA. Accepts a Stockscans saved-scan
  URL or a ticker list -- same input shape as guidance-document-extractor.
  Checks the DB smartly: if a company has no guidance-documents record at all,
  prompts the user to run guidance-document-extractor first; if a record
  exists but is genuinely empty, just notes a no-visibility exclusion instead
  of re-prompting. Use for "extract guidance", "forward guidance", "what did
  management guide for", "guidance tracker across my watchlist", "pull
  PAT/revenue guidance for these tickers". Always use even for a single
  ticker: enforces a zero-assumption rule (blank cell over guessed cell), dual
  absolute/relative computation, and multi-source reconciliation. Outputs a
  `forward-guidance` DTO per company plus one consolidated .xlsx, and includes
  Market Cap/P-E/CFO-PAT/FII-holdings columns from the scan table when a scan
  URL was used. Can OPTIONALLY chain pead-surprise-ranker at the end -- but
  ONLY when the user explicitly asks for a PEAD/surprise ranking, never
  automatically. NOT for past results or guidance-vs-actual history -- that's
  `management-credibility-tracker`.
---

# Forward Guidance Extractor

Stage 2 (final) of the 2-skill guidance/PEAD pipeline:

```
guidance-document-extractor            →         forward-guidance-extractor         → (optional, explicit) pead-surprise-ranker
(bulk fetch + cheap-model filter + DB save)      (flagship model, THIS SKILL, reads DB)      (flagship model, only if user asks)
```

`guidance-document-fetcher` and `guidance-relevance-filter` (the two skills
that used to sit before this one) are merged into `guidance-document-extractor`
as of 2026-08-06 -- see that skill's SKILL.md. The overall pipeline is now
exactly 2 skill invocations end to end, plus an optional 3rd call this skill
can make on the user's explicit request.

This skill's job is the one no earlier stage can do: reading the pre-filtered
candidate excerpts for a company (which may span Transcript, PPT, and Result
sources) and making the actual judgment call -- is this passage EXPLICIT,
quantified, management-stated forward guidance, or not? -- never historical
actuals, never vague directional language ("we expect to grow" is not
guidance; "we expect 18-20% revenue growth in FY27" is). Built to run over a
handful of tickers or several hundred in one pass without burning tokens on
network calls or re-deriving arithmetic the model can get wrong under load.

Follow [`skills/_shared/conventions.md`](../../_shared/conventions.md) throughout
-- in particular §3 (all persistence via `db.js`), §8 (context-first), §9
(files-touched manifest), and §11 (token-optimization suggestion, added below).

## Why this skill no longer fetches or pre-scans documents itself

Earlier versions of this skill inlined the transcript-availability gate
(no model needed) and read the FULL raw transcript directly (a model turn on
20-40 pages per company, once). That responsibility now lives entirely in
`guidance-document-extractor`, which fetches Transcript, PPT, AND Result
together (never conditionally) via bulk API calls, runs a cheap-model
recall-first pass over the raw documents, and persists both the fetch
manifest and the filtered excerpts as one DB record per company (type
`guidance-documents`). This skill reads THOSE persisted excerpts, not the raw
documents or any /tmp file left over from the same session -- cutting this
stage's own token cost substantially while (per the 2026-08-06 pilot on
NSE:IFBIND) still recovering the large majority of real guidance items a
full-document read would find (71/71 signal-keyword coverage, 5/7 final items
recovered vs. an earlier design's 0/7 -- see `guidance-document-extractor`'s
SKILL.md for the full pilot numbers). This skill's extraction quality is
bounded by that upstream recall, so if a company's output looks thin, the
first thing to check is whether that DB record's excerpts actually captured
the relevant passages, not whether this stage's reasoning missed something
already in front of it.

## Smart DB-availability check (read this before Phase 1)

For each company being processed, first look up its `guidance-documents`
report: `db.find('reports', {type: 'guidance-documents', companyId})`, then
`db.readReport(id)` for the full body. Three distinct cases -- do not
conflate them:

1. **No record at all** — `guidance-document-extractor` was never run for
   this company. Do NOT silently skip it and do NOT guess. Tell the user:
   "N companies have no guidance-documents record yet — run
   guidance-document-extractor first" and list them, before proceeding with
   whatever companies DO have a record.
2. **Record exists, `excerpts` non-empty** — proceed to Phase 1 normally.
3. **Record exists, `excerpts` empty AND `found` all false** (or
   `excerptsPending: true` with `found` all false) — `guidance-document-extractor`
   WAS run and genuinely found nothing (checked, not missing). Do NOT
   re-prompt the user about this company. Just carry it straight to the
   final output's "No Visibility" / exclusion list with reason "no
   Transcript/PPT/Result found for {quarter} (attempted, genuinely
   unavailable)" — this is real information, not a gap in the pipeline.
4. **`extractionFailed` is set (non-null)** — a fourth case, distinct from
   all three above, added 2026-08-09 after the NSE:REDTAPE incident: the
   relevance-filter model DID run and DID produce output, but that output was
   syntactically invalid JSON that `save_guidance_documents.js` could not
   parse even after its auto-repair pass (see that script's
   `parseJsonWithRepair`). This is NOT "genuinely no guidance" (case 3) and
   NOT "never run" (case 1) — it's a recoverable data-quality failure.
   `excerptsPending` will still read `true` for these, so check
   `extractionFailed` specifically before concluding a `true`-pending record
   means "attempted, nothing found." Surface these to the user by name
   ("N companies have unparseable relevance-filter output — re-run
   `guidance-document-extractor` for just these tickers") rather than folding
   them into the silent "No Visibility" exclusion list, since re-running
   Stage 1's relevance-filter step (not Stage 2/3) is what actually fixes it.

This distinction is the entire point of always persisting a record even on a
"nothing found" outcome (see `guidance-document-extractor`'s Step 4) — a
missing record, an empty-but-attempted record, and an attempted-but-corrupted
record must never be treated the same way.

Two failure modes this design still guards against, same as before:
1. **Hallucinated guidance.** An LLM asked to fill "300 companies x 15
   metrics" in one pass will pattern-complete blanks with plausible-sounding
   numbers. The fix is procedural: extraction happens ONE company at a time
   (own reasoning pass per company's excerpt set), and the absolute<->relative
   conversion arithmetic is done by a script (`compute_guidance_value.py`),
   not by the model doing mental math under a growing context window.
2. **Wasted model spend.** Re-reading a full transcript that a cheap model
   has already distilled to relevant excerpts, or extracting from a company
   whose latest results aren't even out yet, is pure waste at scale --
   Stages 1 and 2 are both zero-or-cheap-cost filters that run before this
   stage's flagship-model spend starts.

## Model-tier note (cost) -- confirmed necessary on 2 separate pilots, 2026-08-06

This is the one stage in the whole 4-stage pipeline that stays on a
flagship model (Sonnet-class or stronger), for reasons confirmed by direct
evidence rather than assumption:

**Pilot 1 (full-document extraction on a cheap model, rejected):** ran the
FULL extraction job (find numbers, judge explicit-vs-directional, attach
base values -- everything this skill does) on a Haiku-class model against 4
already-processed transcripts, with the Sonnet-class extraction already on
file as ground truth:

| Ticker | Sonnet items | Haiku items | Recall |
|---|---|---|---|
| NSE:GULPOLY | 11 | 5 | 45% |
| NSE:SUPRAJIT | 8 | 2 | 25% |
| NSE:IFBIND | 7 | **0** | **0%** |
| NSE:CARRARO | 2 | 1 | 50% |

NSE:IFBIND was a silent, total miss on exactly the item this skill exists to
catch (a directly-quantified INR150cr cost-initiative PAT lever), reported
back as "no explicit FY27 guidance found." This ruled out running THIS
skill's actual judgment step on a cheap model.

**Pilot 2 (recall-first pre-filter + flagship judgment, the current design):**
the fix wasn't "make the cheap model smarter" -- it was "give the cheap model
an easier job" (see `guidance-relevance-filter`). Re-tested end-to-end on the
same NSE:IFBIND transcript: cheap-model relevance filter → flagship-model
extraction on the excerpts recovered 5/7 items (vs. 0/7 running the cheap
model on the full extraction task directly). This is the currently-deployed
design. It is not yet 1:1 recovery -- see `guidance-relevance-filter`'s
SKILL.md for the two specific gaps found and a concrete refinement to try --
so for a single high-stakes company where completeness matters more than
cost, still consider having this stage read the RAW document directly
(bypass Stage 2's excerpt file) rather than trusting the filtered set blind.

## Inputs

Same input shape as `guidance-document-extractor` -- either:
- `--scan-url <https://www.stockscans.in/scans/saved/...>` — resolve the
  scan's companies (same `resolveUniverse()` call as the fetch stage, so the
  same `scanRow` data — Market Cap, P/E, CFO/PAT, "Change in FII Holdings
  Latest Quarter", FII Holdings, etc. — is available for the final output),
  then look up each company's `guidance-documents` DB record.
- An explicit ticker list — look up each ticker's `guidance-documents` DB
  record directly.

Per-company candidate excerpts come from the `excerpts` field of that DB
record (persisted by `guidance-document-extractor`), covering whichever of
Transcript/PPT/Result were found. If a caller wants to bypass the
relevance-filter for a single high-stakes company (see the completeness note
above), the raw document text at the record's `textPaths` works as a direct
substitute input to this stage. Always report the `quarter` the DB record
used (including its `retriedPriorQuarter` case), in case a caller assumed
the current one.

## Phase 1 -- Extract guidance (reasoning -- this is the one part a script cannot do)

For each company, read its excerpt file (or raw document text, per the note
above) and pull out every instance where management states a FORWARD,
quantified target. When multiple source types exist for the same company
(e.g. both Transcript and PPT excerpts), read them TOGETHER in one pass --
this is new relative to the old sequential design, and it matters: a PPT
slide's bare number ("FY27E Revenue: INR2,500cr") often gets its full
context (base year, driver, confidence) from something management said on
the call, and vice versa. Note which source each item came from
(`"source": "Transcript"|"PPT"|"Result"`) so a reader can trace it back.

Cover these metric groups, but only where a number is actually said:

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
  "confidence": "explicit",
  "source": "Transcript"
}
```

**Zero-assumption rule -- this is the whole point of the skill:**
- Only extract statements with `"confidence": "explicit"` -- a specific number,
  percentage, or range tied to a specific period, stated by MANAGEMENT (not
  an analyst's paraphrase an excerpt happened to capture -- if the excerpt
  only contains an analyst restating a number, do not treat that as
  management's own explicit statement; this is a real gap the Pilot 2
  evidence above surfaced, not a hypothetical). Skip "we remain confident
  about growth", "healthy pipeline", "should do well" entirely -- do not
  invent a row for it.
- `base_value` / `base_value_source_quote` may ONLY be filled if the SAME
  excerpt set (or a confirmed prior filing you have already read this run)
  states that base actual explicitly. If you don't have a quotable base
  actual, leave `base_value` and `base_value_source_quote` as `null` -- the
  computation script will then correctly leave the derived field blank rather
  than you guessing it.
- If management refers back to OLDER guidance (e.g. "as we said last quarter,
  we still expect...") and that prior quarter's transcript is not something
  you've confirmed this run, still record the guidance (it's being
  reaffirmed live, so it's confirmed as of THIS transcript) but set
  `"stale_reference": true` on the item and note which prior quarter it
  referenced. If the prior guidance is being referenced WITHOUT reaffirmation
  ("our FY28 target remains" said in passing, un-reaffirmed) and you cannot
  verify the original quarter's transcript, flag the company via
  `--stale-note` in Phase 3 rather than silently including it.
- If a metric looks like it SHOULD be covered by the excerpts (e.g. you'd
  expect margin guidance to exist for this company) but simply isn't present
  in what Stage 2 handed you, that's a legitimate "not found" -- do not go
  fetch the raw document yourself to compensate unless the run is explicitly
  the single-company/completeness-over-cost case described above.

Write each company's items to its own JSON array file, e.g. `NSE_X_items.json`.

## Phase 2 -- Compute absolute <-> relative (script, no LLM)

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

## Phase 3 -- Persist per company (script, no LLM)

```bash
node skills/equity-research/forward-guidance-extractor/scripts/save_forward_guidance.js \
  --ticker NSE:X --quarter Q4FY26 --date 2026-08-06 \
  --guidance-file NSE_X_enriched.json \
  --transcript-available true \
  --model claude-sonnet-5 \
  [--stale-note "FY28 target reaffirmed in passing; original guidance quarter's transcript not in DB"]
```

Storage destination (`docs/DATA_RULES.md` §2, "Analysis/report DTO" row):
`reports.json` + `reports/<id>.json`, `type: "forward-guidance"`, written
exclusively via `db.saveReport()` inside the script above -- never a raw file
write. Collect each printed `id` for Phase 4.

`--model` (the model executing this run's Phase 1/2 extraction reasoning, e.g.
`claude-sonnet-5`) is required and gets written into the DTO as `modelUsed` --
this phase's own arithmetic is scripted, but the guidance values it persists
were extracted by an LLM reading the excerpts one company at a time (see
"Why this skill no longer fetches..." above), so per
`output-dto-standard/SKILL.md` the DTO needs `modelUsed` even though
`save_forward_guidance.js` itself has no reasoning of its own.

## Phase 4 -- Build the consolidated workbook (script, no LLM)

```bash
# Assemble the array of full DTOs (read each data/reports/<id>.json back), plus
# the exclusion list (companies with nothing found in guidance-document-fetcher's
# `found` map, or Stage 2's excerpt file, or this stage's own extraction), then:
python3 skills/equity-research/forward-guidance-extractor/scripts/build_guidance_workbook.py \
  --dtos all_company_dtos.json \
  --missing missing_companies.json \
  --out "Forward_Guidance_$(date +%Y%m%d).xlsx"
```

Produces two sheets: **Forward Guidance** (one row per metric per company, the
`Guidance (Absolute (Relative %))` column holding the `display` string, and a
`Source` column showing Transcript/PPT/Result per item) and **Missing
Transcripts** (every company with no DB record at all, OR a record with no
guidance found, with `reason` distinguishing "never run" from "attempted,
genuinely unavailable" per the smart-check above), highlighted. Companies
with `staleGuidanceNote` set get their "Stale Guidance Flag" column
highlighted too.

**When the input was a scan URL**, add Market Cap, P/E, CFO/PAT, "Change in
FII Holdings Latest Quarter", and FII Holdings columns (read from each
company's `scanRow`, already carried on its `guidance-documents` DB record —
no re-fetch needed) to both sheets, so the workbook doubles as a screener
view without a separate lookup.

Copy the finished file to the user's workspace folder and present it with
`present_files`.

## Phase 5 -- Finish the run

1. `yarn data:push` (mandatory, per
   `conventions.md` §6).
2. Report a **Files touched** section (per `conventions.md` §9): every
   `reports.json`/`reports/<id>.json` written (with the record count), plus the
   `.xlsx` path, read from `db.touchedFiles()` / the `data:push` output -- never
   from memory.
3. **Always end the run with a "How to save tokens/time next run" note** (see
   below) -- this applies to every invocation of this skill, no exceptions.

## Phase 6 -- Optional PEAD/surprise ranking (ONLY when the user explicitly asks)

`pead-surprise-ranker` (Stage 3, reasoning) can be chained immediately after
this run finishes -- but strictly opt-in. Only invoke it when the user's
request explicitly asks for a ranking/surprise screen in the same turn (e.g.
"...and rank them by PEAD potential", "who's the best EPS surprise bet",
"best PEAD bets"). If the user only asked for guidance extraction, stop after
Phase 5 -- do not chain automatically "because it's usually wanted together."
When chaining, pass this run's freshly-saved `forward-guidance` DTO ids (and
the same `scanRow` data, so the ranker's output can also carry the Market
Cap/P-E/CFO-PAT/FII columns) straight into `pead-surprise-ranker` rather than
re-reading them from the DB a second time.

## Token-optimization suggestion (every run, no exceptions)

This skill processes hundreds of companies per run, so token spend compounds
fast even after Stages 1-2 have already cut most of the raw-document cost.
At the end of every run, look back at what actually happened and suggest
concretely, based on THIS run's evidence, one or more of:
- How much smaller Stage 2's excerpt files were than the raw documents
  (compression ratio) -- if it's low for a specific company, that's worth
  flagging back to `guidance-relevance-filter`'s prompt tuning, not silently
  absorbed here.
- Whether a large fraction of companies had nothing at any of the 3 document
  types (Stage 1's `found` map all-false) -- in which case re-running before
  the next results season is pure waste, suggest a re-run date.
- Any batching opportunity missed this run (e.g. companies fetched one at a
  time in Stage 1 that should have gone through `--tickers-file`).
- Whether this stage's own extraction reasoning is now the dominant cost
  driver in the pipeline (it should be, by design, since Stages 1-2 are
  cheap-or-free) -- report the ratio if you have the token counts, since
  that's the confirmation the pipeline split is paying off.

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
- **Don't extract analyst-stated numbers as guidance, even via an excerpt.**
  Only management's own words count; an excerpt that captured an analyst's
  question/paraphrase rather than management's answer is not guidance, even
  if it contains the same number -- this exact miss happened in the
  2026-08-06 pilot (see Model-tier note) and is the reason this rule is
  called out twice.
- **One company, one reasoning pass.** Don't try to hold 50 companies' excerpt
  sets in context at once "for efficiency" -- that's exactly what causes
  cross-company hallucination at scale. Batch the deterministic steps
  (Phases 2, 4), never the extraction reasoning itself.
- **A thin excerpt file is not proof a company has no guidance.** Before
  concluding "no explicit guidance found," check whether Stage 2's coverage
  script flagged low recall for that company -- if so, the honest answer may
  be "guidance-relevance-filter under-shot this one," not "management said
  nothing," and the raw-document fallback (see Model-tier note) is the
  correct escalation.

## File tree

```
forward-guidance-extractor/
├── SKILL.md                              (this file)
├── scripts/
│   ├── classify_transcript_status.py     (legacy -- superseded by
│   │                                       guidance-document-extractor's fetch
│   │                                       script; kept for any skill still
│   │                                       referencing it directly)
│   ├── compute_guidance_value.py         (Phase 2 absolute<->relative)
│   ├── save_forward_guidance.js          (Phase 3 DB write)
│   └── build_guidance_workbook.py        (Phase 4 .xlsx builder)
└── references/
    └── metric_taxonomy.md                (full metric list + edge-case rulings)
```

## Related skills (the full pipeline)

- [`guidance-document-extractor`](../guidance-document-extractor/SKILL.md) --
  Stage 1, bulk fetch of Transcript+PPT+Result + cheap-model relevance
  filter + DB persistence, merged into one invocation. Feeds this skill.
- [`pead-surprise-ranker`](../pead-surprise-ranker/SKILL.md) -- Stage 3,
  reads this skill's `forward-guidance` DTOs to build a cross-company PEAD
  surprise ranking; this skill never ranks companies against each other
  itself, and only chains into this (Phase 6) when the user explicitly asks.

`guidance-document-fetcher`, `guidance-relevance-filter`,
`transcript-availability-scanner`, and `guidance-ppt-fallback` (earlier
iterations of this pipeline) are now all deprecated in favor of the 2-skill
design above -- see their SKILL.md files for the redirect note if you land
on any of them by an old reference.
