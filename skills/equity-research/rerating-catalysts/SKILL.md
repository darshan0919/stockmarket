---
name: rerating-catalysts
description: >-
  Single-company re-rating catalyst engine — merges what used to be
  `fundamental-shift-scanner` (last-week announcement pulse) and
  `growth-triggers-1pager` (1-page conviction note) into one workflow built on
  the SOIC "growth catalyst" methodology: a stock re-rates when the market's
  perception of FUTURE earnings power shifts, and that shift is always
  traceable to something NEW happening in the business (new capacity, new
  base, new management, new corporate action, new regulation, new value-added
  mix, new warrants/deleveraging — see references/growth_catalyst_framework.md).
  Use for "growth triggers", "re-rating triggers", "catalyst note", "what's
  changed this week", "any recent news on X", "why will this stock re-rate",
  "growth catalyst", "conviction note", "1-pager", "is anything fundamentally
  different about this company", or any request for a Stockscans ticker that
  wants a forward-looking, EPS-accrual-oriented read rather than a backward
  results recap. Auto-fetches the last 7 days of announcements, last 4
  concall transcripts, last 4 quarterly results, and last 2 investor PPTs when
  given only a ticker. Supersedes fundamental-shift-scanner and
  growth-triggers-1pager — do not use those skills for new work.
---

# Re-rating Catalysts

> A business re-rates when the market's perception of its _future_ earnings
> changes — and that perception shift is never abstract. It always traces
> back to something specific and NEW: a capex commissioning, an order-book
> jump, a management change, a warrant issue, a regulation. Your job is to
> read everything this company has put out recently and surface every such
> "new" thing that moves the needle on future EPS, quantified, timed, and
> sourced — and to say plainly when a document set is quiet.

This skill replaces two prior skills that covered overlapping ground from
different angles: `fundamental-shift-scanner` (breadth — last week's
announcements, noise/signal triage) and `growth-triggers-1pager` (depth — a
5-section conviction note from ARs/transcripts/PPTs). Re-rating catalysts
requires both lenses simultaneously, because a catalyst disclosed in an
announcement this week is the same kind of thing as a catalyst buried in last
quarter's concall — the "new" framework (§ references/growth_catalyst_framework.md)
applies uniformly across document types, and treating them as separate
workflows caused catalysts to be missed when they surfaced in one document
type but not another.

## When to use this skill

- User pastes a Stockscans ticker/URL and asks for growth triggers, a 1-pager,
  catalyst note, or "why will this re-rate"
- "What's changed with [company] this week / recently?"
- "Is anything fundamentally different about this company?"
- Pre-position-sizing conviction check, or pre-call prep before a deeper dive
  (`consecutive-filings-diff`, `quarterly-result-analysis`, `financial-model`)
- Any time another skill needs a per-company re-rating read instead of
  re-implementing catalyst extraction

## How this differs from neighbouring skills

| If you need...                                                           | Route to                     |
| ------------------------------------------------------------------------ | ---------------------------- |
| Multi-company (watchlist) daily catalyst alerts                          | `watchlist-catalyst-scanner` |
| Full single-quarter result interpretation (3-basket)                     | `quarterly-result-analysis`  |
| Forensic red-flag / accounting-quality scan                              | `forensic-accounting`        |
| Quarter-over-quarter deck diff reconciled with concall                   | `consecutive-filings-diff`   |
| 3-year model / bear-base-bull IRR                                        | `financial-model`            |
| Technical/stage/relative-strength timing read                            | `stage2-catalyst-analysis`   |
| **Forward-looking, "new"-framework re-rating catalysts for ONE company** | **THIS SKILL**               |

**Running this across many companies (not one):** this skill is intentionally
company-scoped and expensive (4 transcripts + 4 results + 2 PPTs read at
flagship-model depth) — do not invoke it directly across a watchlist or scan
of hundreds of names. Three scripts implement the scale funnel described in
[`skills/_shared/scale-funnel-pattern.md`](../../_shared/scale-funnel-pattern.md)
so this skill's Phase 1-3 only ever runs on genuine survivors:

- **Stage 0 (zero-LLM pre-filter):**
  [`scripts/prefilter_rerating_candidates.js`](scripts/prefilter_rerating_candidates.js)
  — given a Stockscans saved-scan URL or a ticker list, diffs each company
  against its last `rerating-catalysts` DB report (`db.find('reports',
  {companyId, type: 'rerating-catalysts'})`) and drops companies with no new
  filings and no price/volume flag since that report. First-run companies
  (no prior report) always pass through. Run this FIRST on any batch —
  everything downstream only touches its `candidate: true` output.
- **Stage 1 (zero-LLM recall pass):**
  [`scripts/extract_rerating_signatures.py`](scripts/extract_rerating_signatures.py)
  — once Phase 1 has fetched a candidate company's documents into its
  scratch dir, run this against `manifest.json` before Phase 2's flagship
  read. It regex-matches the "new"-category signature phrases already
  tabulated in `references/growth_catalyst_framework.md` §2, plus a
  generic number-near-forward-cue check, and reports a compression ratio
  (raw chars vs. excerpt chars). Treat its output as a fast orientation
  pass, not a substitute for reading the full text in Phase 2 — this
  script's regex bank is deliberately over-inclusive (cheap false
  positives) since a missed catalyst is far more costly than an extra
  passage to skim.
- **Stage 2 (partial computed scorecard):**
  `computeJCurveScore()` in
  [`stock-api/src/analyzers/catalystRules.js`](../../../stock-api/src/analyzers/catalystRules.js)
  — computes whichever of the framework §5c 9-point scorecard is
  mechanically derivable from a scan row (today: a relative-strength proxy
  for revenue acceleration only; debt/ROCE trend points return `null`,
  not `0`, until those columns exist on the scan table). `scanCatalysts.js`
  attaches this to every `watchlist-catalyst-scanner` alert and to a
  `jcurveByCompany` map in its JSON output — **read this map before
  deciding which candidates from Stage 0 are worth escalating**, but do not
  treat a low partial score as a "skip" signal on its own; it is missing
  more than half the real 9 points by design.

Stage 3 is this skill's own Phase 1-4, run only on the names that survive
Stages 0-2. None of this changes what a single-company, directly-requested
run of this skill does — the funnel only matters when the caller is
iterating over many companies.

## Workflow

### Phase 1 — Document acquisition

Resolve the ticker (bare `NSE:TICKER`/`BSE:CODE`, or a Stockscans company URL —
extract and URL-decode the `EXCH:SYMBOL` segment after `/company/`). Then fetch,
in parallel where the underlying calls allow it, via `stock-documents-fetcher`
(do not reimplement the API calls — see its SKILL.md for the live `documentsFetcher.js`
/ `announcementsFetcher.js` usage, since the once-documented Python CLI does not exist):

1. **Last 7 days of corporate announcements** — `fetchAnnouncements(ticker, {startDate: <7 days ago>, outputDir})`, no `--search` filter (pull everything in the window, classify yourself).
2. **Last 4 concall transcripts** — `fetchDocuments(ticker, {types: ['Transcript'], lastN: 4, outputDir})`. If the bulk fetch misses the latest quarter, resolve it directly with `stock-api/bin/get-concall-transcript-url.js --company <ticker>` per `skills/_shared/conventions.md` §12.
3. **Last 4 quarterly results** — `fetchDocuments(ticker, {types: ['Result'], lastN: 4, outputDir})`.
4. **Last 2 investor PPTs** — `fetchDocuments(ticker, {types: ['PPT'], lastN: 2, outputDir})`.

Per `skills/_shared/conventions.md` §6, none of these downloaded PDFs are
persisted under `<repo>/data/` — write everything to a scratch dir
(`/tmp/<safe_ticker>_rerating/`) and read `manifest.json` to identify which
file is which before extracting text (`pdftotext -f 1 -l <PAGES> <file>.pdf out.txt`).

Also call `buildCompanyContext(companyId)` (per conventions §8) before
analysis — weigh any prior thesis, notes, or validated catalysts already on
file for this company, and record what you considered as `contextUsed`.

**Web (always, lightweight):** CMP, market cap, PE/PB, and — only if a
specific factual claim in a filing needs corroboration (e.g. an anti-dumping
duty, a PLI scheme detail) — a targeted search, cited.

### Phase 2 — Read everything through the "new" lens

Read `references/growth_catalyst_framework.md` in full before analysing — it
defines the "new" taxonomy (new base creation, new industry cycle, new
management change, new corporate action, new capex, new value-added mix, new
geography, new warrants, new deleveraging, etc.), the new-vs-confirmation
discipline, the quantification/conviction rules, and (§5a-5e) the J-curve
lifecycle staging, fake-J-curve checklist, and leading/lagging signal
discipline. Apply it uniformly across all four document sets fetched in
Phase 1 — an announcement, a transcript line, and a PPT slide are just three
different containers for the same kind of "new" fact.

Walk every document and, for anything that isn't routine (AGM notices, book
closures, record dates, routine board-meeting intimations — same NOISE list as
the old fundamental-shift-scanner), extract:

1. **What literally happened** — one sentence, sourced, dated: `[Source:
Transcript Q4FY26 / PPT / Result / BSE filing, DD-Mon-YYYY]`.
2. **Which "new" category** it falls under (§2 of the framework doc) — a fact
   can carry more than one tag.
3. **New or confirmation** — cross-check against the prior quarter's
   transcript/PPT in the same fetched set. Guided-and-now-executing is
   confirmation (lower weight); unguided is new (higher weight).
4. **Quantified impact** — Rs Cr order/capex, % capacity add, bps margin, %
   volume, TAM — sized against TTM revenue/market cap where both are known.
   If undisclosed, say "awaiting disclosure" rather than estimating.
5. **Timeline** — quarter/FY. "Going forward" is not a timeline.
6. **Conviction tag** — `HIGH CONVICTION` (contracted/notified/in the order
   book) / `MEDIUM CONVICTION` (guided, not contracted) / `OPTIONALITY`
   (asymmetric, not yet in consensus).
7. **Forward marker** — one falsifiable checkpoint ("if Q2FY27 revenue from
   this segment doesn't show up by [date], treat as delayed").

Also run the cross-cutting checks from framework §5 explicitly, even when no
single document flags them: order-book step-change across the 4 results,
EBITDA/unit trend across the 4 quarters, debt/finance-cost trajectory across
the 4 transcripts, and theme-maturity (is this a year-1 S-curve or a year-6
theme?).

**J-curve staging (framework §5a-§5d).** For the company overall — and, when
they diverge, for the lead catalyst specifically — classify the current
stage as Base Building / Inflection / Acceleration. Check whether disclosed
growth follows PAT growth > EBITDA growth > Revenue growth (true operating +
financial leverage) before calling a company "Acceleration" stage on PAT
optics alone, and flag explicitly if order-book growth or capacity
commissioning is running ahead of revenue (a leading signal worth calling
out even absent a P&L confirmation yet).

**Income Statement Signal Scan (mandatory).** When the EBITDA/unit or margin trend across the 4 quarters shows expansion, run `skills/_shared/income-statement-signals.md` on each quarter (QoQ and YoY) rather than checking inventory gains alone — Other Income spikes, tax-rate swings, and exceptional items are equally capable of manufacturing a fake margin trend. **Sourcing rule:** pull every relevant P&L line and PBT for each of the 4 quarters from the actual Result filings via `stock-documents-fetcher`, not from concall/PPT summaries. If a quarter's margin strength is driven by an item that clears the shared scan's materiality bar, do not list it as a margin/mix catalyst in the 3b ranking — flag it as non-recurring instead.

### Phase 3 — Synthesize

**3a. Company snapshot** — 3–4 lines (business, value-chain position,
moat/commodity, promoter %) + 8-column KPI table: `FY Rev | FY PAT | EBITDA
Mgn | ROE | ROCE | Debt | PE (TTM) | Div Yield`.

**3b. Re-rating catalysts (5–8, ranked)** — per catalyst: name, 2–3 sentence
body, "new" category tag(s), new-vs-confirmation flag, quantified impact,
timeline, conviction tag, forward marker, and **J-curve stage** (Base
Building / Inflection / Acceleration, per framework §5a). Rank per framework
§4: capacity/capex → new product/geography → M&A/corporate action →
management/promoter change → margin/mix (value-added products) →
regulation/policy → industry structure/S-curve → balance-sheet deleveraging
→ governance. Any catalyst whose PAT contribution traces to a fake-J-curve
item (framework §5b — low base, inventory gain, exceptional income, tax
reversal, one-off order, other-income spike, forex gain, temporary commodity
benefit) is tagged non-recurring here, not ranked as a margin/mix catalyst.

**3c. This week's announcement flow** — the last-7-day scan folded in as its
own subsection (what `fundamental-shift-scanner` used to output standalone):
signal items not already covered as a full catalyst above, noise filtered out
(one line), and — if the week was quiet — say so plainly rather than padding.

**3d. What's in the price** — 2–3 lines: consensus view vs. where the
incremental EPS-perception surprise sits, framed per framework §5e (the
sweet spot is Stage 2/early Stage 3 confirmation before consensus catches
up — not the earliest possible Trigger-stage entry, and not a fully-priced
Stage 3 story).

**3e. Key risks (3–4)** — execution/regulatory/commodity/demand/balance-sheet/
concentration, each with a mitigant or probability qualifier.

**3f. So-what verdict** (3–6 sentences) — does this document set, taken
together, change how the market should price forward EPS? Does it warrant
escalating to `consecutive-filings-diff`, `financial-model`, or
`investment-thesis-engine`? If Darshan holds a documented thesis on file
(from `buildCompanyContext`), does this support/contradict/sit orthogonal to
it?

### Phase 4 — Persist the JSON DTO, then render

Per `output-dto-standard` (`skills/tooling/output-dto-standard/SKILL.md`),
write the canonical JSON DTO before rendering anything — the PDF/markdown is
a reproducible render of this file, never drafted independently of it.
`db.saveReport()` (or the equivalent `data/agent-outputs/` append pattern used
by the old fundamental-shift-scanner, if `saveReport` doesn't yet have a
`rerating-catalysts` type registered — check `docs/DATA_RULES.md` before
adding a new collection vs. reusing an existing one with a new `type`).

Envelope fields (mandatory): `id`, `companyId` (canonical `EXCH:SYMBOL`),
`creationTime`, `modifiedTime` (ISO 8601), `creator: "rerating-catalysts"`,
`modelUsed` (e.g. `"claude-sonnet-5"` — every conviction/tag/new-vs-confirmation
call here is LLM judgment, not scripted), `date`, `contextUsed`.

Domain fields: `cmp`, `marketCap`, `capCategory`, `sector`, `snapshot`,
`kpiHeaders`/`kpiValues`, `catalysts[]` (each with `name`, `body`,
`newCategory[]`, `newVsConfirmation`, `impact`, `timeline`, `conviction`,
`forwardMarker`, `sources[]`), `weeklyFlow` (`dateRangeStart`, `dateRangeEnd`,
`signalItems[]`, `noiseItems[]`), `whatsInThePrice`, `risks[]`, `verdict`.

Then render:

- **Quick pulse-check (conversational, no file):** if the ask is a narrow
  conversational question ("what's changed with X this week", a single
  catalyst lookup) and the DTO is small (1-2 catalysts, no widget rendered),
  an inline markdown response is sufficient on its own — this mirrors
  fundamental-shift-scanner's old "quick pulse-check" default. Nothing else
  in this skill counts as "quick" — a full catalyst note or an HTML widget
  is a report, and reports always get the PDF companion below.
- **Every other run — HTML widget AND a 1-page PDF, always, from the same
  DTO.** Do not gate the PDF on the user asking for a shareable file; a
  Drive link is what makes the note forwardable outside the chat session,
  and per `output-dto-standard` the render is free once the DTO exists —
  skipping it only because nobody explicitly asked defeats the point of
  persisting the DTO in the first place (same reasoning as
  `quarterly-result-analysis`'s Phase 4). Render the widget with the
  card-based severity layout used by `watchlist-catalyst-scanner` (HIGH
  CONVICTION catalysts get stronger visual treatment), and render the PDF
  via `skills/_shared/pdf-design-guide.md`'s palette/component vocabulary
  through the two-step pipeline (`resolve.sh rerating-catalysts --input
data.json --output report.html` then `resolve.sh render-pdf --html
report.html --pdf data/rerating-catalysts/<Company>_Output.pdf`). If
  content spills past 1 page, cut catalyst body text first, then drop to 5
  catalysts — never drop the "what's in the price" section. Mention the
  PDF's path/Drive link in the closing text so the user doesn't have to ask
  for a file separately.
- If the PDF render tooling is genuinely unavailable in the current
  environment (e.g. a sandbox without the render pipeline installed), say so
  explicitly and offer to render it on request — do not silently drop the
  PDF and present only the widget as if that satisfied the requirement.

Close every run with the files-touched manifest (conventions §9) and the
token-optimization suggestion (conventions §11).

## File tree

```
rerating-catalysts/
├── SKILL.md
├── references/
│   └── growth_catalyst_framework.md
└── scripts/
    ├── prefilter_rerating_candidates.js   (Stage 0 — zero-LLM pre-filter for batch runs)
    └── extract_rerating_signatures.py     (Stage 1 — zero-LLM recall pass for a single candidate)
```

`computeJCurveScore()` (Stage 2) lives in
`stock-api/src/analyzers/catalystRules.js` alongside `watchlist-catalyst-scanner`'s
`classify()`, since it operates on the same scan-row shape and is consumed by
that skill's `scanCatalysts.js`, not by this skill directly.

## Conventions

Follow [`management-credibility-tracker`'s shared conventions](../management-credibility-tracker/_shared/conventions.md):
§1 (Rs Cr, FY26 notation), §2 (citation discipline — every catalyst carries a
source), §3 (anti-hallucination — read the actual PDF before sizing a number),
§6 (STRUCTURAL/CYCLICAL/ONE-OFF/GOVERNANCE-SIGNAL taxonomy, useful as a
secondary tag alongside the "new" category when a catalyst's persistence
matters).

## Pitfalls

- **Don't reduce to a valuation call.** Framework §6 — cheapness/expensiveness
  is out of scope here; that's `financial-model`'s job.
- **Don't quantify without a source.** Undisclosed values stay "awaiting
  disclosure," never estimated.
- **Don't treat "Board Meeting Intimation" as signal.** Wait for the outcome
  filing; note the meeting date as a forward marker if the outcome isn't in
  the window yet.
- **Don't call something a fresh catalyst if it's just execution of prior
  guidance.** Tag it new-vs-confirmation honestly — confirmation still counts
  toward the EPS-accrual math, but shouldn't be marketed as new information.
- **Don't skip the quiet-week case.** If the 7-day announcement window is all
  noise and the 4 transcripts/results/PPTs show no new "new" facts beyond
  what a prior run already captured, say so in 2-3 sentences and stop —
  padding erodes trust in every other output this skill produces.
- **SAST/PIT filings never imply direction from the title alone** — open the
  PDF before characterising a promoter/insider stake change as bullish or
  bearish.
