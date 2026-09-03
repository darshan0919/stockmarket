---
name: quarterly-result-analysis
description: Stage 2 (flagship model) of the 2-skill quarterly-result pipeline — industry-agnostic single-quarter result interpretation for Indian listed companies, reading quarterly-result-extractor's persisted DB record (fetched documents + deterministic income-statement signal scan + recall-first tone/guidance/strategic excerpts) and applying the 3-basket framework (Business / Risk / Management) plus a forward 2-8 quarter monitoring checklist. Use whenever the user uploads a quarterly investor presentation, concall, or result PDF and asks "analyse this quarter", "what changed this quarter", "is the business getting better", "what's management signalling", "result analysis", "quarterly snapshot", "post-result note", or provides a Stockscans ticker with result-day intent. Auto-invokes quarterly-result-extractor when given only a ticker and no DB record exists yet. Also supports single-statement quality modes via `--statement income|balance-sheet|cashflow` (comma-separable): a lean, bulk-safe path that grades ONE financial statement CLEAN/WATCH/STRAINED/RED-FLAG from its deterministic signal scan and skips the transcript, tone work, widget and PDF entirely — use it for "income statement quality only", "is the balance sheet clean", "check cash conversion", "run this across today's results", or any bulk screen across many companies' results. Output is BOTH an interactive briefing widget AND a Drive-shareable PDF (same underlying DTO), opening with a bird's-eye KPI strip (Revenue/EBITDA margin/PAT/tax rate/EPS and other decision-relevant metrics, each with a comparison subtext), tagging every observation Structural / Cyclical / Temporary, classifying management tone, tracking narrative shift vs prior quarters, ending with a forward checklist. NOT for two-quarter forensic diffs (use consecutive-filings-diff), transcript-only dives (use concall-analysis), multi-year deep dives (use equity-research-deepdive), or raw document fetching without interpretation (use quarterly-result-extractor directly).
---

# Quarterly Result Analysis

> Your job is NOT to summarize quarterly numbers. Your job is to identify what is improving inside the business, what can accelerate future earnings, what can rerate valuation, what risks are emerging, and how management commentary is evolving.

A focused single-quarter interpretive note built around three baskets — **Business** (what is improving), **Risk** (what can go wrong), **Management** (what they signal between the lines) — and a forward-looking monitoring checklist. Industry-agnostic. Works for FMCG, capital goods, financials, IT, pharma, infra, anything.

Stage 2 of `quarterly-result-extractor` → `quarterly-result-analysis`. Document
acquisition, the deterministic income-statement signal scan, and recall-first
excerpting live in `quarterly-result-extractor` (a separate skill as of
2026-08-08 — previously this skill's own Phase 1). This skill reads that
skill's persisted DB record and does the one job no earlier stage can do:
judging what the quarter's disclosures actually MEAN for the thesis.

## When to use this skill

- User uploads any combination of: quarterly investor presentation, concall transcript, results PDF, and asks for interpretation
- User says any variant of: "analyse this quarter", "what changed", "post-result note", "result interpretation", "quarterly snapshot", "what's improving / what can go wrong", "what is management signalling"
- User provides only a Stockscans ticker plus result-day intent — see "Smart DB-availability check" below for how document acquisition is handled
- Scheduled daily job invocation with `--companyId NSE:X --date YYYY-MM-DD` — analysis is scoped to a specific extraction date (see **Input** below)
- Another skill needs a single-quarter interpretive layer (e.g., to bolt onto a multi-quarter analysis)
- User asks for one statement's quality only — "income statement quality", "is the balance
  sheet clean", "how is cash conversion", "did working capital blow out" — or wants a screen run
  across many companies' results at once; that is `--statement` mode, Phase 0.1

## Input

**For interactive use:**

- Upload result PDF / concall transcript / investor PPT, or provide a ticker

**For scheduled daily jobs:**

- `--companyId NSE:X` — the company to analyze
- `--date YYYY-MM-DD` — the extraction date (scopes DB lookup to records created for that date)

**Statement-quality modes (lean, bulk-safe):**

- `--statement income|balance-sheet|cashflow` — comma-separable. Grades ONE statement instead
  of producing the full 3-basket note. Accepts many companies (repeated `--companyId`, a comma
  list, or a Stockscans saved-scan URL). See Phase 0.1 below.

## How this differs from neighbouring skills

| If you need...                                                               | Route to                           |
| ---------------------------------------------------------------------------- | ---------------------------------- |
| Raw document fetch + signal scan, no interpretation                          | `quarterly-result-extractor`       |
| Two-quarter forensic diff with repricing                                     | `consecutive-filings-diff`         |
| Concall transcript-only deep / brief / multi-Q                               | `concall-analysis`                 |
| Full 15-40 page deep dive across years                                       | `equity-research-deepdive`         |
| 1-page conviction note with growth triggers                                  | `growth-triggers-1pager`           |
| 3-year fraud / accounting quality scan                                       | `forensic-accounting`              |
| Walk-the-talk credibility scoring (4-8 calls)                                | `management-credibility-tracker`   |
| A graded quality read on ONE statement, or a bulk screen across many results | **THIS SKILL**, `--statement` mode |
| **"What does THIS quarter mean for the thesis?" interpretive note**          | **THIS SKILL**                     |

The defining feature: this skill produces an _interpretation_, not an extraction. It looks at one quarter of disclosures and answers "so what?" If the user is asking for a forensic diff, a transcript deep dive, or a multi-year report, route there instead.

## Conventions

Follow [`_shared/conventions.md`](../_shared/conventions.md). Particularly:

- §1 Indian-market conventions — Rs Cr, FY26, Q3 FY26
- §2 Citation discipline — every claim sourced
- §3 Anti-hallucination protocol — Source → Extract → Verify → Interpret
- §6 Conviction taxonomy — Structural / Cyclical / Temporary applied to every observation here

## Workflow — 4 phases

### Phase 0.1 — Mode check (read first)

If `--statement` was passed, this run is a **statement-quality run**, not a quarterly note. Open
[`references/statement_quality_modes.md`](references/statement_quality_modes.md) and follow it
instead of Phases 1.5-4 below. Phase 0 (DB availability) and Phase 1 (reading the extractor's
record) still apply — the mode reads the same record, it just uses a different slice of it and
produces a different artifact.

What the mode does and doesn't do, in one line each, because the whole value of the mode is
what it leaves out:

- **Reads:** the requested statement's normalized snapshot and its pre-computed signal scan
  (`incomeStatementSignals` / `balanceSheetSignals` / `cashflowSignals`), plus
  `statementAvailability` for the staleness verdict.
- **Skips:** the transcript entirely, tone classification, narrative-shift tracking, the
  3-basket framework, the KPI strip, the monitoring checklist, the widget, and the PDF.
- **Produces:** one graded verdict per company per statement (`CLEAN` / `WATCH` / `STRAINED` /
  `RED-FLAG`) with 3-8 ranked findings, persisted as a `statement-quality` report.

This exists so the skill can be run across every result filed on a given evening as a _filter_ —
the names that come back `STRAINED`/`RED-FLAG`, or `CLEAN` with an improving trend, are the ones
that then earn a full note. That economy holds only while the mode stays out of the transcript
and off the render path, and only while every delta and ratio comes from the analyzer scripts
rather than being reasoned out in the run. Both rules are in the reference file; they are the
mode, not decoration on it.

Balance-sheet and cash-flow modes have one hard precondition the income mode does not: **SEBI
LODR Reg 33(3) requires those two statements only half-yearly**, so a Q1/Q3 filing usually omits
them and a PPT in those quarters usually repeats the last published one. Act on
`statementAvailability.<statement>.status` — analyse only `fresh`; for `absent`, `stale-repeat`
or `stale-asof`, say so in one line and stop rather than analysing numbers that did not move.

### Phase 0 — Smart DB-availability check (read before Phase 1)

If the user uploaded files directly, skip straight to Phase 1 and use those
files instead of the DB record (this remains the fastest path when the
documents are already in hand).

Otherwise — the user gave only a ticker (or ticker + date for scheduled jobs) — look up
`quarterly-result-extractor`'s persisted record. Query logic depends on context:

**If `--date YYYY-MM-DD` was provided (scheduled job):**

```
db.find('reports', {type: 'quarterly-result-documents', companyId, date: YYYY-MM-DD})
```

This scopes the lookup to extraction records created for that specific date (the daily job pipeline).

**If no `--date` provided (interactive use):**

```
db.find('reports', {type: 'quarterly-result-documents', companyId})
```

This finds the most recent extraction record regardless of date.

Then `db.readReport(id)` for the full body. Three distinct cases:

1. **No record at all.** `quarterly-result-extractor` was never run for this
   company. Auto-invoke it now (this skill's whole "give me a ticker, get a
   note" UX depends on this — unlike the batch guidance pipeline, a single
   quarterly-result request is cheap enough per company to chain
   automatically rather than stopping to ask). Then proceed to Phase 1 with
   the fresh record.
2. **Record exists, `notYetOut: false`.** Proceed to Phase 1 with this
   record.
3. **Record exists, `notYetOut: true`.** `quarterly-result-extractor` WAS run
   and results genuinely aren't filed yet. Don't re-invoke it — tell the
   user directly and stop (don't paper over the gap with annual report data
   or web summaries).

If the record is more than a few days old and the user's intent is clearly
"result just dropped" (result-day intent), re-invoke `quarterly-result-extractor`
rather than trusting a stale record — a same-day re-run is cheap (Step 2's
income-statement scan is cached by `getOrCompute`, so re-running mostly
re-checks for a newly-filed Transcript).

### Phase 1 — Read the extractor's record

Pull from the `quarterly-result-documents` DB record (or, if the user
uploaded files directly, extract the same shape ad hoc):

- `incomeStatementSignals` — the pre-computed, materiality-filtered P&L scan
  (Basket 1B feeds directly from this; see Core Principles below — do not
  re-derive this arithmetic yourself).
- `headlineFinancials` — the always-on Revenue/EBITDA-margin/PAT/tax-rate/EPS
  snapshot (QoQ+YoY, unfiltered by materiality). This is the KPI-strip's
  backbone — see Phase 1.5.
- `toneExcerpts` / `guidanceExcerpts` / `strategicExcerpts` / `kpiExcerpts` —
  candidate passages; this skill's job is to classify/judge/select these,
  not to re-scan the raw transcript for them. `kpiExcerpts` are candidate
  operational/governance KPIs (ROCE, volume growth, related-party, inventory
  swing, etc.) outside the P&L scan's reach.
- `possiblyDropped` — topics present in the prior transcript's excerpts but
  absent from this quarter's; feeds the "change vs prior quarters"
  sub-section directly.
- `statementAvailability` — per-statement (balance sheet, cash flow) found/source/as-at-date
  and staleness verdict from the extractor's Step 2.6. In the full note this decides whether
  Basket 1C can say anything at all about the balance sheet and cash flow this quarter; in a
  statement mode it is the gate described in Phase 0.1.
- `balanceSheet` / `cashflow` + `balanceSheetSignals` / `cashflowSignals` — the normalized
  snapshots and their pre-computed scans, present only when the statement was `fresh`. Same
  contract as `incomeStatementSignals`: reason over what cleared the bar, never re-derive it.
- `found` / `transcriptMissing` — if `transcriptMissing: true`, flag the gap
  explicitly in the Management basket rather than skipping it silently (same
  rule as before the split).

### Phase 1.5 — Select the KPI strip

A bird's-eye view of 4-8 headline metrics, rendered as cards at the very top
of the widget (right after the header band, before the verdict chips) so the
reader can verify and visualise the numbers this note is about to discuss,
before reading a word of prose. This is a judgment step — the extractor
hands you raw numbers, not a finished strip — so it belongs here, not in
Phase 1:

1. **Start from `headlineFinancials`.** These 4-5 cards (Revenue, EBITDA
   margin, PAT, effective tax rate, EPS — each with `qoqPct`/`yoyPct` or
   prior-period values already computed) are close to always-include: they're
   the numbers every reader checks first. Only drop one if it's genuinely
   uninformative this quarter (e.g. tax rate barely moved and isn't part of
   the story).
2. **Add 0-4 more cards from `kpiExcerpts` or the basket findings** when a
   number is decision-relevant this quarter but isn't in the P&L snapshot —
   ROCE, guided volume/utilisation growth, a related-party amount flagged at
   risk, an inventory-build swing, order book. Pull the number and its
   comparison basis verbatim from the excerpt; don't compute anything new.
3. **Assign each card a tone**: `pos` (favorable YoY/QoQ move or a beat),
   `neg` (risk/deterioration — e.g. a related-party exposure, a margin
   compression), or `neutral` (guided figure or context number with no clear
   direction, e.g. a tax-rate reset that flatters PAT without being
   "good news"). Tone drives the subtext color in the widget — see
   `assets/result_widget_template.html`'s `.kpi-sub-pos/-neg/-neutral`.
4. **Every card needs a comparison** wherever one exists (`vs Rs X Cr Q1FY26`,
   `vs 5.0% in Q4 FY26`, `guided 30%+ FY27`) — a bare number without context
   ("EPS Rs 8.23") tells the reader nothing about whether that's good.

### Phase 2 — 3-basket analysis

Open [`references/basket_framework.md`](references/basket_framework.md) and run the full framework. The three baskets and a final checklist:

| Basket            | Theme              | Sub-sections                                                                                        |
| ----------------- | ------------------ | --------------------------------------------------------------------------------------------------- |
| 1. **BUSINESS**   | What is improving? | Growth drivers · Margin & profitability triggers · Capex, BS & cash flow · Future earnings triggers |
| 2. **RISK**       | What can go wrong? | Business risks · Management commentary risks · Industry & macro risks                               |
| 3. **MANAGEMENT** | Between the lines  | Tone · Change vs prior quarters · Strategic direction (3-5 yr) · Capital allocation quality         |
| **Final**         | What to monitor    | Investor monitoring checklist — 6-10 items over 2-8 quarters                                        |

Two reference files support this phase:

- [`references/tone_taxonomy.md`](references/tone_taxonomy.md) — the six tone labels (aggressive / confident / cautious / defensive / opportunistic / conservative) with evidence patterns
- [`references/monitoring_checklist_patterns.md`](references/monitoring_checklist_patterns.md) — how to build a falsifiable forward checklist (KPI + threshold + horizon)

### Phase 2.5 — Persist the JSON DTO

Before rendering the widget, save the full Phase 1.5 + Phase 2 output as one `quarterly-result`
report via `db.saveReport(dto)` (`packages/jobs-runtime/lib/db.js`) — NOT a hand-placed file
under `data/agent-outputs/`; a `reports.json` + `reports/<id>.json` record is what makes this
DTO Drive-mirrored and re-readable by the Phase 4 PDF step or any other skill, per
`docs/DATA_RULES.md` §2. The DTO: `kpiStrip` (the 4-8 selected cards — `label`, `value`,
`subtext`, `tone`), the verdict chips, Basket 1/2/3 items (each with its
STRUCTURAL/CYCLICAL/TEMPORARY or HIGH/MED/LOW tag), the monitoring checklist rows
(`kpi`, `threshold`, `horizon`, `source`), and the header fields (company, ticker,
quarter, result date, CMP, market cap). The object MUST carry the standard envelope from
`skills/tooling/output-dto-standard/SKILL.md`: `companyId` (canonical `EXCH:SYMBOL`),
`creationTime`, `modifiedTime`, `creator: "quarterly-result-analysis"`, and `modelUsed`
(the model you're running as — required since the Structural/Cyclical/Temporary tagging
and tone classification are LLM judgment, not scripted).

### Phase 3 — Render the briefing widget

The primary output is an interactive HTML widget rendered via `visualize:show_widget`,
templated from the Phase 2.5 JSON DTO — the widget's content must be reproducible from
that file, not drafted separately. Use [`assets/result_widget_template.html`](assets/result_widget_template.html) as the structural reference — copy the `<style>` block and section skeletons, populate with the Phase 2 findings from the JSON DTO.

### Phase 4 — Render the PDF artifact

Always also produce a PDF from the SAME Phase 2.5 DTO — see
[`skills/_shared/pdf-artifact-step.md`](../../_shared/pdf-artifact-step.md) for the full
mechanics (build a hex-color standalone HTML using `pdf-design-guide.md`'s component
vocabulary — the `.kpi`/`.grid4` classes map directly onto the KPI strip, `.chip` onto the
verdict tags, `.hl` onto the callouts — then call `render-pdf`). Save to
`data/assets/quarterly-result-analysis/<Company>_Q<X>_FY<YY>_ResultAnalysis.pdf` and end
the run with `node packages/jobs-runtime/scripts/data.js push` so it's Drive-shareable. Do
this on every run, not only when the user explicitly asks for a file — a Drive link is what
makes the note forwardable, and the whole point of persisting the DTO in Phase 2.5 is that
this step costs no extra analysis, only a render. If the render pipeline (`render-pdf`,
`yarn`/`node` tooling) is genuinely unavailable in the current environment, that is a
blocker to flag explicitly in the closing text ("PDF not rendered — render pipeline
unavailable in this session") — never finish the run silently having produced only the
widget, since that reads to the user as if the PDF requirement was satisfied when it
wasn't.

Widget structure (top to bottom):

1. **Header band** — company + ticker + quarter + result date + CMP + market cap
2. **KPI strip** — 4-8 bird's-eye headline metric cards from Phase 1.5 (`.kpi-strip`/`.kpi-card` in the template) — label, big value, colored comparison subtext
3. **Verdict chips** — 5 to 8 single-word tags summarising the quarter (e.g. `MARGIN INFLECTION`, `EXPORT SCALE-UP`, `CAUTIOUS TONE`, `CAPEX HEAVY`)
4. **Basket 1 — BUSINESS** — growth drivers, margins, capex/BS/CF, future triggers; each item tagged `STRUCTURAL` / `CYCLICAL` / `TEMPORARY`
5. **Basket 2 — RISK** — business, commentary, macro; each item with severity (`HIGH` / `MED` / `LOW`)
6. **Basket 3 — MANAGEMENT** — tone label + evidence quote · narrative shift vs prior · 3-5yr strategic build · capital allocation grade
7. **Monitoring checklist** — table with `# | KPI | Threshold | Horizon | Source`

After the widget renders, write 2-3 short paragraphs outside it. Lead each with a bolded takeaway. These are the analytically-significant observations that need full-sentence treatment — _not_ a rehash of widget content. End with a falsifiable prediction or the specific next catalyst to watch (e.g., "Q1 FY27 result will test whether margin expansion is structural — gross margin must stay above 28% even if commodity prices reverse").

## Core principles

**Tag every observation Structural / Cyclical / Temporary.** This is the most important taxonomy in this skill — it determines whether a development affects fair value (structural) or only the next 1-2 quarters (cyclical/temporary). Never leave an observation untagged.

| Tag          | Meaning                                            | Example                                                                     |
| ------------ | -------------------------------------------------- | --------------------------------------------------------------------------- |
| `STRUCTURAL` | Changes the company's earnings power permanently   | Premium-product mix shifting from 20% → 40% of revenue, ROCE ceiling rising |
| `CYCLICAL`   | Tied to industry / commodity / interest-rate cycle | Steel margin expanding because HRC prices are rising                        |
| `TEMPORARY`  | One-off; will reverse within 1-2 quarters          | Inventory de-stocking by distributors before GST rate change                |

**Interpret tone, don't quote it.** Phase 2 expects you to _classify_ management as one of six tone labels — with one short evidence quote per label. Reproducing five paragraphs of management commentary is not analysis.

**Income Statement Signal Scan (mandatory).** When assessing revenue/margin/profit performance for the period (Basket 1B — Margin & Profitability Triggers), run the full line-by-line + combination scan in `skills/_shared/income-statement-signals.md` against both QoQ and YoY baselines — it covers every P&L line (Other Income composition, RM cost, the inventory-gains check, employee cost vs. revenue, D&A/interest step-ups, exceptional items, tax-rate swings, EPS dilution) plus the holistic combination reads, with a materiality bar so the write-up stays terse. See `references/basket_framework.md` §1B for how this feeds the `SUSTAINABLE`/`CYCLICAL`/`TEMPORARY` tags. A quarter's "blockbuster" result must be explicitly flagged in the verdict chips (e.g. `INVENTORY-GAIN DRIVEN`, `TAX-RATE DRIVEN`, `NON-OPERATING BEAT`) whenever a non-structural driver clears the materiality bar — never buried in a sub-bullet. **Sourcing rule:** every P&L line traces back to the actual quarterly Result filing — this skill reads that scan pre-computed from `quarterly-result-extractor`'s DB record (Phase 1), it does not re-fetch or re-derive it from web search or news-article summaries; web search may only add qualitative color on top of figures already sourced this way. Report only what clears the materiality bar in the shared scan, ranked by contribution to the PBT/PAT delta; if nothing clears the bar, say so in one line.

**Balance Sheet & Cash Flow Signal Scans (mandatory when the statements are fresh).** Basket 1C
reads both scans in full from the extractor's record — `balanceSheetSignals` and
`cashflowSignals`, per `skills/_shared/balance-sheet-signals.md` and
`skills/_shared/cashflow-signals.md`. Same contract as the P&L scan: the scripts have already
computed every ratio, day-count and threshold test, so reason only over what cleared the bar
(and check the `skipped` array for lines that could not be computed because they were not
disclosed — that is itself a finding). Two things are specific to these statements. First,
availability: SEBI LODR Reg 33(3) requires both only half-yearly, so when
`statementAvailability` reports `absent`, `stale-repeat` or `stale-asof`, state that in one line
and analyse nothing — a confident write-up about a repeated statement is worse than no write-up.
Second, dedup: rising receivable days and weak CFO/PAT conversion are one finding seen from two
statements, so report it once with both numbers rather than twice in different words.

**Avoid number-repetition.** The investor presentation already contains the numbers. This skill is for interpretation, not summary. If you find yourself listing "revenue Rs X Cr, EBITDA Rs Y Cr, PAT Rs Z Cr" — stop. State only the numbers that change the thesis.

**Track what management _stopped_ saying.** If a topic that dominated three prior calls (e.g., "exports will scale to 20%") is silent this quarter — that is a yellow flag. The Management basket's "Change vs prior quarters" sub-section is where this lives; `quarterly-result-extractor`'s `possiblyDropped` field is the starting point, not the final word — verify against the prior transcript excerpts before calling something dropped.

**Specific over generic.** "India GDP growth" is not a tailwind. "BS-VI emission norms forcing Tier-1 OEMs to replace legacy ICE platforms, of which 60% of our order book is for new platforms" is a tailwind. No textbook explanations.

**Falsifiable monitoring items only.** Every item in the forward checklist must have a number threshold and a quarter horizon. "Watch margins" is not a checklist item. "Gross margin staying above 28% in Q1 FY27" is.

## Pitfalls

- **Don't reflow the concall.** This skill is _not_ `concall-analysis`. If the user wants a transcript deep dive, route there. Here, the concall is _one_ of three input sources, used for tone, guidance, and dodged-question signals — not for sentence-by-sentence extraction.
- **Don't skip the balance sheet and cash flow because the call didn't mention them.** Both scans run whenever the statements are `fresh` (Basket 1C) — the two statements say things management does not, and a quarter where working capital absorbed the entire operating profit reads identically to a clean one if you only listen to the call. What stays out of scope is the multi-year fraud scan: `forensic-accounting` owns that. The dividing line is horizon, not statement — a `high`-severity combination flag here is escalated by name, not investigated in place.
- **Don't skip the monitoring checklist.** It is the most valuable section for a PM who reads the note today and needs to know what data points to check next quarter. 6-10 items, every one with a number threshold and horizon.
- **Don't let "tone" become editorialising.** "Management seemed nervous" without quotation evidence is hallucination. Every tone label needs one short verbatim quote.
- **Don't conflate cyclical recovery with structural improvement.** A steel company's margin expanding because HRC prices rose is _cyclical_. The same company shifting 30% of volumes to value-added speciality grades is _structural_. Tag carefully.

## Outputs

### Statement-quality runs (`--statement`)

One persisted `statement-quality` DTO per company per statement, plus the inline graded blocks
(and, for a batch, the one ranked worst-first table) described in
[`references/statement_quality_modes.md`](references/statement_quality_modes.md). **No widget
and no PDF by default**, which is a deliberate narrowing of `conventions.md` §18: that rule
exists so a _report_ the user will want to reopen and forward is never left as ephemeral chat
output, and a forty-name screen whose purpose is to pick which companies deserve a real note is
not that artifact — the durable record is the DTO, which is Drive-mirrored and re-readable, and
each graded name can be promoted to a full note (with its PDF) on demand. Render a PDF in this
mode only when the user asks for one, or when a single company grades `RED-FLAG` and the output
is going to be forwarded as a finding in its own right.

### Full runs (default, no `--statement`)

Two artifacts, both from the same Phase 2.5 DTO, every run:

1. The interactive widget (Phase 3) — fast to read in-session, the primary read.
2. The PDF (Phase 4) — `data/assets/quarterly-result-analysis/<Company>_Q<X>_FY<YY>_ResultAnalysis.pdf`, Drive-shareable. Mention its path/Drive link in the closing paragraphs after the widget — don't make the user ask for a file separately.

If the user wants the fuller multi-year format instead of this single-quarter note, route to `equity-research-deepdive`.

## Related skills

- `quarterly-result-extractor` — Stage 1, fetches PPT/Result/Transcript,
  runs the income-statement signal scan, and pulls recall-first
  tone/guidance/strategic excerpts, persisting all of it as one DB record
  this skill reads. Auto-invoked by Phase 0 when no record exists yet; call
  it directly if you only want the raw documents/signals without the
  3-basket interpretation.
- `render-pdf` — invoked by Phase 4 to turn the Phase 2.5 DTO into the
  Drive-shareable PDF artifact; see `skills/_shared/pdf-artifact-step.md`.
