---
name: forward-guidance-extractor
description: >
  Extracts management's FORWARD guidance -- Revenue/Sales/Volume,
  EBITDA/Gross/Operating/Net margins, PAT/EPS, Debt/Depreciation/Tax/Cashflow,
  Capacity/Utilisation/Order Book/ROCE/ROE/ROA -- directly from Stockscans'
  own AI-synthesized reports: the latest concall's `Guidance & Commitments`
  and `Key Metrics` tables (concall-notes endpoint), supplemented by the
  growth-catalysts report for forward-looking context a single transcript
  may not restate. No raw-transcript search and no separate fetch/filter
  skill needed -- Stockscans already distinguishes explicit guidance from
  narrative for us; this skill's job is mapping that structured output onto
  a fixed metric taxonomy, computing absolute/relative deltas, and comparing
  against the prior quarter's stored guidance to flag what's reaffirmed vs.
  new vs. dropped. Accepts a Stockscans saved-scan URL or a ticker list. Use
  for "extract guidance", "forward guidance", "what did management guide
  for", "guidance tracker across my watchlist", "pull PAT/revenue guidance
  for these tickers". Always use even for a single ticker: enforces a
  zero-assumption rule (blank cell over guessed cell), dual
  absolute/relative computation, and quarter-over-quarter reconciliation.
  Outputs a `forward-guidance` DTO per company plus one consolidated .xlsx,
  and includes Market Cap/P-E/CFO-PAT/FII-holdings columns from the scan
  table when a scan URL was used. Can OPTIONALLY chain pead-surprise-ranker
  at the end -- but ONLY when the user explicitly asks for a PEAD/surprise
  ranking, never automatically. NOT for past results or
  guidance-vs-actual history -- that's `management-credibility-tracker`.
---

# Forward Guidance Extractor

**2026-09-20 rewrite.** This skill used to be Stage 2 of a 3-skill pipeline
(`guidance-document-extractor` bulk-fetched Transcript/PPT/Result and ran a
cheap-model relevance filter; this skill then read those filtered excerpts
with a flagship model). That pipeline is now replaced: Stockscans migrated
its concall-notes and growth-catalysts reports to `server: uvicorn` endpoints
on 2026-09-16 that return AI-synthesized `Guidance & Commitments` and
`Key Metrics` tables -- the explicit/directional judgment call this skill
used to make by searching 20-40 pages of raw transcript is now already done,
upstream, by Stockscans itself. `guidance-document-extractor` is deprecated
(see its SKILL.md) -- its bulk-fetch-and-filter job no longer has anything
to do.

```
StockscansClient.latestTranscript()      →    concallNotes() + growthCatalysts()    →    forward-guidance-extractor (THIS SKILL)    →    (optional, explicit) pead-surprise-ranker
(resolve latest quarter's ssUrl)              (2 API calls, already-synthesized tables)        (map onto taxonomy + QoQ diff)                    (flagship model, only if user asks)
```

This skill's `forward-guidance` DTO output shape is UNCHANGED from the old
pipeline -- `pead-surprise-ranker` and `consecutive-filings-diff` (both of
which depend on this skill) need no changes at all. Only the input side
changed.

Follow [`skills/_shared/conventions.md`](../../_shared/conventions.md)
throughout -- in particular §3 (all persistence via `db.js`), §8
(context-first), §9 (files-touched manifest), and §11 (token-optimization
suggestion, added below).

## Why this is now a much cheaper skill

The old design's flagship-model spend existed because searching raw
transcript prose for "is this passage EXPLICIT, quantified,
management-stated forward guidance, or not?" is genuinely hard and
cheap models missed it badly (see the Model-tier note below, kept for
historical reference -- the pilot numbers are still the reason a flagship
model stays in the loop here, just for a smaller job now). Stockscans'
`concallNotes()` response already contains a `Guidance & Commitments` table
with Commitment/Specifics/Timeline columns and a `Key Metrics` table with
Metric/Value columns, both synthesized by their own AI layer from the same
transcript. What remains for THIS skill to do with a model is:

1. Map each free-text `Guidance & Commitments` row onto the fixed metric
   taxonomy (Top Line/Margins/Bottom Line/Balance Sheet/Key Metrics) --
   Stockscans' rows are prose ("US manufacturing EBITDA break-even |
   Steady-state EBITDA break-even, followed by PAT break-even | By end of
   FY27"), not pre-tagged with a metric category.
2. Parse ranges into midpoints ("26%-30%" -> `relative_pct: 28`) and pull
   any stated base value out of the `Key Metrics` table or the surrounding
   prose in `finalReport`, exactly as before.
3. Compare this quarter's table against the LAST stored `forward-guidance`
   DTO for the same company (if one exists) to flag reaffirmed / revised /
   new / dropped commitments -- see Phase 1b. This is new: the old pipeline
   never had persistent cross-quarter comparison built in (only an
   in-transcript `stale_reference` flag when management referenced their own
   older guidance out loud); doing it as an explicit DTO diff is both cheap
   (comparing two small tables, not re-reading transcripts) and more
   reliable than depending on management to restate context.

This is still a reasoning step, not a pure script -- but it is a fraction of
the old cost: one short table read per company instead of a 20-40 page
transcript search. It stays on a flagship model for the same reason as
before (see Model-tier note): the NSE:IFBIND pilot showed a cheap model
silently missing an explicit guidance item entirely, and there is no new
evidence that mapping prose rows onto a taxonomy is meaningfully easier than
the original extraction task -- both require reading management's actual
words and not pattern-completing a plausible-looking number.

## Input Parameters

**For interactive use:**

- Stockscans saved-scan URL or explicit ticker list

**For scheduled daily jobs:**

- `--date YYYY-MM-DD` — scope to companies whose latest concall (per
  `documents()`) falls in the relevant results window for that date; mainly
  useful for a morning job re-running only on names with a fresh transcript
  since the prior run.

## Phase 0 -- Fetch (script, no LLM)

For each company (resolved from the scan URL via the SAME `resolveUniverse()`
call `guidance-document-extractor` used to use -- see
[`stock-api/src/analyzers/runScan.js`](../../../stock-api/src/analyzers/runScan.js),
so the same `scanRow` data, Market Cap/P-E/CFO-PAT/FII Holdings, is available
for the final output -- or directly from an explicit ticker list):

```js
const { StockscansClient } = require('stock-api/src/clients/StockscansClient.js');
const client = new StockscansClient();

const latest = await client.latestTranscript(companyId); // { date, documentType, ssUrl, hasNotes } | null
```

Three cases:

1. **`latest` is `null`** — no Transcript document on file at all for this
   company. Goes straight to the "No Visibility" / exclusion list with
   reason "no transcript found" — do not guess, do not re-prompt the user
   per-company, just note it in the final workbook.
2. **`latest.hasNotes` is `false`** — a transcript exists but Stockscans has
   not synthesized AI notes for it yet (can happen for a just-filed
   transcript). Treat the same as case 1 for THIS run but with reason
   "transcript on file, AI notes not yet available — retry in a day or two",
   distinct wording so the user knows it's likely to resolve on its own
   rather than needing any action.
3. **`latest.hasNotes` is `true`** — proceed to fetch:

```js
async function retryOnce(fn) {
  try { return await fn(); }
  catch (e) {
    // concallNotes/growthCatalysts occasionally return a transient bare
    // 401 {} that clears on an unmodified retry within ~1.5s -- see
    // StockscansClient.js's doc comments on both methods. Not a real auth
    // failure; retry once before treating it as one.
    await new Promise((r) => setTimeout(r, 1500));
    return await fn();
  }
}

const notes = await retryOnce(() => client.concallNotes(companyId, latest.ssUrl));
// { finalReport, date, companyName, src, eventUtcDatetime, limits, subscription }

const catalysts = await retryOnce(() => client.growthCatalysts(companyId));
// { finalReport, dateLabel, toc }
```

Both `finalReport` fields are Markdown text. `notes.finalReport` contains
(among narrative sections you don't need for this skill) two tables to pull
verbatim: a `## Guidance & Commitments` table (columns: Commitment |
Specifics | Timeline) and a `## Key Metrics` table (columns: Metric |
<Quarter> value, each cell a bolded figure with YoY/QoQ context in
parentheses). `catalysts.finalReport` is a numbered list of forward-looking
catalysts, each a short paragraph — read for supplementary context/evidence
in Phase 1, not as a source of new taxonomy rows (growth-catalysts prose is
narrative, not a guidance commitment table, and mixing the two would blur
the zero-assumption rule below).

Write each company's raw fetch to its own file, e.g. `NSE_X_raw.json`
(`{ticker, quarter: notes.date, concallNotes: notes, growthCatalysts:
catalysts}`), so Phase 1's reasoning pass and Phase 1b's DB lookup don't
re-fetch.

## Phase 1 -- Extract guidance (reasoning -- this is the one part a script cannot do)

For each company, read its `Guidance & Commitments` table and `Key Metrics`
table from `notes.finalReport`, plus `catalysts.finalReport` for
supplementary evidence, and produce one JSON item per commitment matching
the schema documented at the top of `scripts/compute_guidance_value.py`
(UNCHANGED from before):

```json
{
  "metric_category": "Top Line",
  "metric": "Revenue",
  "period_guided": "FY27",
  "absolute_value": null,
  "absolute_unit": "cr",
  "relative_pct": 28.0,
  "base_value": null,
  "base_period": null,
  "base_value_source_quote": null,
  "quote": "FY27 revenue growth 26%-30% (raised from 24%-27%)",
  "confidence": "explicit",
  "source": "ConcallNotes"
}
```

Cover the same metric groups as before:

| Category      | Metrics                                                                        |
| ------------- | ------------------------------------------------------------------------------- |
| Top Line      | Revenue / Sales / Volume                                                        |
| Margins       | EBITDA margin, Gross Profit margin, Operating Profit margin, Net Profit margin  |
| Bottom Line   | PAT, EPS                                                                        |
| Balance Sheet | Debt, Depreciation, Tax, Cash flow                                              |
| Key Metrics   | Capacity, Utilisation, Order Book, ROCE, ROE, ROA                               |

**Zero-assumption rule -- unchanged, still the whole point of the skill:**

- Only extract rows from the `Guidance & Commitments` table (or an
  unambiguous forward-looking figure in `Key Metrics`, e.g. "FY27 revenue
  growth guidance: 26% to 30%") — never a `growth-catalysts` sentence alone,
  since that report is narrative synthesis about what's ramping, not a
  quote-backed commitment table. Use `growthCatalysts` only to add a
  `catalyst_context` note on an item already sourced from
  `Guidance & Commitments`/`Key Metrics`, or to inform `pead-surprise-ranker`'s
  later `evidence` field — never to originate a new guidance row by itself.
- `source` is now `"ConcallNotes"` (replaces the old `"Transcript"|"PPT"|
  "Result"` values, since this skill no longer distinguishes those — Stockscans'
  synthesis already merged whichever documents it drew from).
- Range handling unchanged: "26%-30%" -> `relative_pct: 28` (midpoint), full
  range preserved verbatim in `quote`.
- `base_value` / `base_value_source_quote` may ONLY be filled if the SAME
  `Key Metrics` table (or `Guidance & Commitments` row) states that base
  actual explicitly (e.g. "26%-30% (raised from 24%-27%)" gives you the
  PRIOR guidance, not a base actual — don't conflate the two; a base actual
  looks like "Revenue ₹484 cr, up 50% YoY from ₹323 cr in Q1 FY26"). If no
  quotable base actual is present, leave both `null` — the computation
  script then correctly leaves the derived field blank.
- Skip anything in `Key Metrics` that is a pure trailing actual with no
  forward component (e.g. "Net debt: ₹24 cr" alone, no target stated) — that
  belongs to `management-credibility-tracker`'s domain, not this skill's.

Write each company's items to its own JSON array file, e.g. `NSE_X_items.json`.

## Phase 1b -- Quarter-over-quarter reconciliation (reasoning, cheap)

Before computing/persisting, look up the company's MOST RECENT prior
`forward-guidance` DTO:

```js
const db = require('packages/jobs-runtime/lib/db.js');
const prior = db.find('reports', { type: 'forward-guidance', companyId })
  .filter((r) => r.quarter !== thisQuarter)
  .sort((a, b) => b.date.localeCompare(a.date))[0];
```

If `prior` exists, `db.readReport(prior.id)` and compare its `guidance` array
against this run's freshly-extracted items, matching on
`metric_category`+`metric`+`period_guided`. For each match, set one of:

- `qoq_status: "reaffirmed"` — same period, same or near-identical value.
- `qoq_status: "revised"` — same period, value changed (e.g. "24%-27%" ->
  "26%-30%") — this is common and worth surfacing prominently, not just a
  footnote; a raised guide is itself a signal.
- `qoq_status: "new"` — no prior item for this metric+period. Default when
  no `prior` DTO exists at all (first time this company has been run).
- `qoq_status: "dropped"` — a prior item's metric+period has no match in
  this run's extraction; note it in the exclusion/methodology text rather
  than silently losing it (management may have simply not repeated it, or
  may have quietly walked it back — worth flagging either way, don't guess
  which).

This replaces the old pipeline's `stale_reference` flag (which only fired
when management verbally referenced their own older guidance) with something
more reliable: an explicit table diff that doesn't depend on management
choosing to restate context out loud. Set `qoq_status` on each item before
Phase 2.

## Phase 2 -- Compute absolute <-> relative (script, no LLM)

Unchanged:

```bash
python3 skills/equity-research/forward-guidance-extractor/scripts/compute_guidance_value.py \
  --batch NSE_X_items.json > NSE_X_enriched.json
```

## Phase 3 -- Persist per company (script, no LLM)

Unchanged in mechanics; `--stale-note` is now populated from Phase 1b's
`dropped` items rather than an in-transcript stale reference:

```bash
node skills/equity-research/forward-guidance-extractor/scripts/save_forward_guidance.js \
  --ticker NSE:X --quarter Q1FY27 --date 2026-09-20 \
  --guidance-file NSE_X_enriched.json \
  --transcript-available true \
  --model claude-sonnet-5 \
  [--stale-note "FY26 debt-reduction target (prior quarter) not repeated this quarter"]
```

Storage destination unchanged (`docs/DATA_RULES.md` §2): `reports.json` +
`reports/<id>.json`, `type: "forward-guidance"`, written exclusively via
`db.saveReport()`. Collect each printed `id` for Phase 4.

## Phase 4 -- Build the consolidated workbook (script, no LLM)

Unchanged:

```bash
python3 skills/equity-research/forward-guidance-extractor/scripts/build_guidance_workbook.py \
  --dtos all_company_dtos.json \
  --missing missing_companies.json \
  --out "Forward_Guidance_$(date +%Y%m%d).xlsx"
```

Add a "QoQ Status" column (reaffirmed/revised/new/dropped) to the Forward
Guidance sheet, sourced from Phase 1b's `qoq_status` field per item —
this is new relative to the old workbook.

**When the input was a scan URL**, add Market Cap, P/E, CFO/PAT, "Change in
FII Holdings Latest Quarter", and FII Holdings columns from each company's
`scanRow` (from `resolveUniverse()`, same as before), to both sheets.

Copy the finished file to the user's workspace folder and present it.

## Phase 5 -- Finish the run

1. `yarn data:push` (mandatory, per `conventions.md` §6).
2. Report a **Files touched** section: every `reports.json`/`reports/<id>.json`
   written (with the record count), plus the `.xlsx` path, read from
   `db.touchedFiles()` / the `data:push` output — never from memory.
3. **Always end the run with a "How to save tokens/time next run" note**
   (see below).

## Phase 6 -- Optional PEAD/surprise ranking (ONLY when the user explicitly asks)

Unchanged: `pead-surprise-ranker` reads this skill's `forward-guidance` DTOs
directly, no change needed on its side. Only invoke it when the user's
request explicitly asks for a ranking in the same turn — see that skill's
SKILL.md for the full framework. When chaining, also pass along each
company's `growthCatalysts` finalReport text (not persisted in the DTO
itself, just the fetch-time text file from Phase 0) so
`pead-surprise-ranker`'s `evidence`/`thesis` fields can draw on it directly
without a re-fetch.

## Model-tier note (cost) -- kept for historical reference

This is still the one stage that stays on a flagship model. The original
2026-08-06 pilot evidence for why a cheap model cannot be trusted with this
judgment call:

| Ticker       | Sonnet items | Haiku items | Recall |
| ------------ | ------------ | ----------- | ------ |
| NSE:GULPOLY  | 11           | 5           | 45%    |
| NSE:SUPRAJIT | 8            | 2           | 25%    |
| NSE:IFBIND   | 7            | **0**       | **0%** |
| NSE:CARRARO  | 2            | 1           | 50%    |

NSE:IFBIND was a silent, total miss on exactly the item this skill exists to
catch (a directly-quantified INR150cr cost-initiative PAT lever). That pilot
tested full-transcript extraction, not table-mapping from Stockscans'
pre-synthesized report — no new pilot has been run on the smaller table-mapping
task specifically. Until one is, treat this note as the reason to keep a
flagship model here, not as stale/inapplicable evidence.

## Token-optimization suggestion (every run, no exceptions)

This skill's token cost per company should now be dramatically lower than
the old pipeline's (no raw transcript search, two short structured tables
instead). At the end of every run, report:

- How many companies hit case 1/2 in Phase 0 (no transcript / no AI notes
  yet) — if a large fraction, that's worth flagging as "re-run in N days"
  rather than treating as a permanent gap.
- How many `revised`/`dropped` QoQ statuses this run surfaced — these are
  the most actionable rows for the user, worth calling out by name in the
  summary, not just left in the spreadsheet.
- Whether the two-endpoint-per-company fetch (Phase 0) is now the dominant
  cost driver (it should be near-free relative to Phase 1's reasoning, by
  design) — report actual token/time numbers if available, since that's the
  confirmation this redesign is paying off relative to the old pipeline.

## Pitfalls

- **Don't originate a guidance row from `growthCatalysts` alone.** It's
  narrative synthesis, not a quote-backed commitment table — use it only as
  supplementary context on a row already sourced from
  `Guidance & Commitments`/`Key Metrics`.
- **Margins are already a %, don't relative-ize them into nonsense.**
  Unchanged from before — `absolute_unit: "%"` items skip the relative-growth
  formula; see `compute_guidance_value.py`.
- **Ranges → midpoint, full range preserved in `quote`.** Unchanged.
- **A `hasNotes: false` transcript is not "no guidance found" — it's "not
  synthesized yet".** Use the distinct exclusion reason from Phase 0 case 2,
  don't fold it into the same bucket as case 1 (no transcript at all).
- **Transient 401s from `concallNotes`/`growthCatalysts` are not auth
  failures.** Retry once per `StockscansClient.js`'s documented behavior
  before treating either as a real error.
- **One company, one reasoning pass.** Same as before — don't hold multiple
  companies' tables in context at once "for efficiency"; that's what causes
  cross-company hallucination at scale. Batch the deterministic steps
  (Phases 0, 2, 4), never Phase 1/1b's reasoning.

## File tree

```
forward-guidance-extractor/
├── SKILL.md                              (this file)
├── scripts/
│   ├── classify_transcript_status.py     (legacy -- no longer used by this
│   │                                       skill's own flow; Phase 0 now
│   │                                       uses StockscansClient.latestTranscript()
│   │                                       directly. Kept only in case another
│   │                                       skill still references it.)
│   ├── compute_guidance_value.py         (Phase 2 absolute<->relative -- unchanged)
│   ├── save_forward_guidance.js          (Phase 3 DB write -- unchanged)
│   └── build_guidance_workbook.py        (Phase 4 .xlsx builder -- add QoQ Status column)
└── references/
    └── metric_taxonomy.md                (full metric list + edge-case rulings -- unchanged)
```

## Related skills

- [`guidance-document-extractor`](../guidance-document-extractor/SKILL.md) --
  **DEPRECATED 2026-09-20**, see that skill's SKILL.md for the redirect note.
  Its bulk-fetch-and-cheap-filter job is no longer needed now that Stockscans'
  concall-notes/growth-catalysts endpoints do the synthesis upstream.
- [`pead-surprise-ranker`](../pead-surprise-ranker/SKILL.md) -- reads this
  skill's `forward-guidance` DTOs to build a cross-company PEAD surprise
  ranking, unchanged; only chains in (Phase 6) when the user explicitly asks.
- [`management-credibility-tracker`](../management-credibility-tracker/SKILL.md)
  -- for past guidance-vs-actual history ("did they deliver"), not this
  skill's job.

`guidance-document-fetcher`, `guidance-relevance-filter`,
`transcript-availability-scanner`, `guidance-ppt-fallback`, and now
`guidance-document-extractor` (earlier iterations of the fetch/filter stage)
are all deprecated — see their SKILL.md files for redirect notes if you land
on any of them by an old reference.
