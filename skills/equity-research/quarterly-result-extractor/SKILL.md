---
name: quarterly-result-extractor
description: >
  Stage 1 of the 2-skill quarterly-result pipeline: fetches the latest PPT +
  Result + Transcript (and the prior quarter's Transcript, for narrative-shift
  comparison) for an Indian listed company from Stockscans, runs the
  deterministic income-statement-signals scan against the Result filing,
  always computes the unfiltered headline financial snapshot (Revenue/EBITDA
  margin/PAT/tax rate/EPS, QoQ+YoY — the KPI-strip backbone), and a
  locates the balance sheet and cash flow statement in whichever document
  carries them (Result filing or PPT), normalizes and staleness-checks them
  (SEBI requires both only half-yearly, so Q1/Q3 filings usually repeat or omit
  them) and runs their signal scans, plus a
  cheap/recall-first excerpt pass over the Transcript+PPT that pulls out
  every passage plausibly relevant to tone, guidance, strategic commentary,
  or an operational/governance KPI — without judging what it MEANS. Persists
  ONE durable DB record
  per company (type quarterly-result-documents) so quarterly-result-analysis
  can read it without re-fetching or re-running the same scan. Use for
  "fetch this quarter's result documents for X", "pull the latest result +
  transcript for X", "extract result data for X" — or let
  quarterly-result-analysis auto-invoke this when no record exists yet.
  Fetch + signal scan cost zero-to-cheap tokens; the judgment call
  (Structural/Cyclical/Temporary, tone classification, the 3-basket
  interpretation) is deliberately NOT done here — that's
  quarterly-result-analysis's job, reading this skill's DB output.
---

# Quarterly Result Extractor

Stage 1 of `quarterly-result-extractor` → `quarterly-result-analysis`. This
used to be Phase 1 of a single `quarterly-result-analysis` skill; it is
broken out because fetching + deterministic extraction is a pure-script (or
cheap-model) job, while the 3-basket interpretation downstream is a flagship
LLM reasoning job — splitting them means re-running the interpretation (a
different angle, a follow-up question, a template change) never re-fetches
or re-extracts, and other skills that want this quarter's raw signals
(without the interpretive layer) can read the same DB record instead of
reimplementing acquisition.

Follow [`skills/_shared/conventions.md`](../../_shared/conventions.md)
throughout — in particular §1 (Rs Cr, FY26, Q3 FY26), §2 (citation
discipline), §3 (anti-hallucination: Source → Extract → Verify), and the
downloaded-PDF rule (re-fetchable source documents are never persisted
under `data/` — write them to `/tmp/`, only the extracted JSON goes to the
DB).

## Input

`--companyId NSE:X` — single company (this skill is company-scoped, unlike the
batch-oriented guidance pipeline — quarterly interpretation is normally
requested one company at a time).

**Optional parameters:**

- `--date YYYY-MM-DD` — scope extraction to a specific date (for daily scheduled jobs).
  When provided, fetches documents filed on that exact date instead of the latest quarter.
  Defaults to the current/latest quarter if omitted.

## Step 1 — Fetch documents (script, zero LLM)

```bash
# Standard usage (latest quarter):
export STOCKSCANS_AUTH_TOKEN="$(grep '^STOCKSCANS_AUTH_TOKEN' .env | cut -d= -f2-)"
COMPANY_ID="NSE:SWARAJENG"
SAFE=$(echo "$COMPANY_ID" | tr ':' '_')
DOCS_DIR="/tmp/${SAFE}_qra_docs"
node skills/equity-research/quarterly-result-extractor/scripts/fetch_result_documents.js \
  --companyId "$COMPANY_ID" --out-dir "$DOCS_DIR" > "${DOCS_DIR}/manifest.json"

# Scheduled task usage (specific date):
node skills/equity-research/quarterly-result-extractor/scripts/fetch_result_documents.js \
  --companyId "$COMPANY_ID" --date "2026-08-10" --out-dir "$DOCS_DIR" > "${DOCS_DIR}/manifest.json"
```

`fetch_result_documents.js` wraps `documentsFetcher.js` (`fetchDocuments()`)
and `get-concall-transcript-url.js` (`ConcallTranscriptResolver`) — the same
two primitives the old single-skill Phase 1 called inline, now behind one
script instead of ad-hoc bash:

1. **Date-scoped behavior:** If `--date` is provided, fetches documents filed on that
   specific date; otherwise fetches the latest quarter's documents.
2. PPT + Result, straight from Stockscans (`fetchDocuments`
   with `types: ['PPT', 'Result']`, `startDate`/`endDate` = either the specific
   date window or current quarter).
3. Latest Transcript: resolved via `ConcallTranscriptResolver` first (guaranteed
   to exist for every reported quarter now), then downloaded through
   `fetchDocuments` if resolution succeeds. On resolver `error` with PPT/Result
   also empty, results genuinely aren't out yet — stop and say so. On resolver
   `error` with PPT/Result present, proceed without a transcript and set
   `transcriptMissing: true` in the manifest — don't fail the whole fetch.
4. The PRIOR quarter's Transcript (`--last-n 2` semantics), for the
   narrative-shift comparison `quarterly-result-analysis` needs. Which of
   the two returned entries is "prior" depends on whether the resolver
   call succeeded for the target quarter — see the script's inline comment;
   this logic moved verbatim from the old Phase 1, it did not change.

Output: `manifest.json` — `{ticker, companyId, quarter, found: {PPT, Result, Transcript, PriorTranscript}, transcriptMissing, pdfPaths}`.
`pdfPaths` are downloaded PDFs, not text — run each through
[`stock-api/src/utils/pdfUtils.js`](../../../stock-api/src/utils/pdfUtils.js)
(the same extraction every other document-consuming skill uses) before
Steps 2 and 3.

## Step 2 — Deterministic income-statement signal scan (script, zero LLM)

```bash
node -e "
const { getOrCompute } = require('./stock-api/src/analyzers/incomeStatementSignals.js');
// lineData parsed from the Result filing text (pdfUtils.js output of manifest.pdfPaths.Result)
console.log(JSON.stringify(getOrCompute(companyId, period, lineData, context)));
" > "${DOCS_DIR}/income_statement_signals.json"
```

Runs the full line-by-line + combination scan from
[`skills/_shared/income-statement-signals.md`](../../_shared/income-statement-signals.md)
against QoQ and YoY baselines (Other Income composition, RM cost, the
inventory-gains check, employee cost vs. revenue, D&A/interest step-ups,
exceptional items, tax-rate swings, EPS dilution, plus holistic combination
reads) — this is the SAME cached scan every P&L-reading skill uses
(`getOrCompute` checks `data/cache/income-statement-signals/` first), so if
another skill already scanned this company/period this quarter, this step
is a cache hit, not a recompute. Only lines/combinations clearing the
materiality bar are returned — this is Extraction First; do not have an LLM
re-derive the arithmetic.

**Sourcing rule (unchanged from the old Phase 1):** P&L line items come from
the actual Result filing via `documentsFetcher.js`, never web search or
news-article summaries.

## Step 2.5 — Headline financial snapshot (script, zero LLM)

```bash
node skills/equity-research/quarterly-result-extractor/scripts/compute_headline_financials.js \
  --current "${DOCS_DIR}/current_period.json" \
  --prior-q "${DOCS_DIR}/prior_q_period.json" \
  --prior-y "${DOCS_DIR}/prior_y_period.json" \
  > "${DOCS_DIR}/headline_financials.json"
```

This is the KPI-strip's deterministic backbone — restoring the "bird's-eye
view of key metrics" earlier sessions of `quarterly-result-analysis` used to
show at the top of the report. It reuses the SAME three period P&L snapshots
already parsed for Step 2 (current quarter, prior quarter, same quarter
prior year) but, unlike Step 2, applies NO materiality filter: Revenue,
EBITDA margin, PAT, effective tax rate, and EPS are always computed and
returned, QoQ and YoY, because the reader wants to see the standard numbers
regardless of whether they're "interesting" — Step 2 answers "what's
unusual", this step answers "what are the 4-5 numbers everyone checks
first". The two are complementary; don't collapse one into the other.

## Step 2.6 — Balance sheet + cash flow: locate, normalize, staleness-check (script, zero LLM)

```bash
node skills/equity-research/quarterly-result-extractor/scripts/extract_statements.js \
  --companyId "$COMPANY_ID" \
  --result-text "${DOCS_DIR}/result.txt" \
  --ppt-text "${DOCS_DIR}/ppt.txt" \
  --prior-statements "${DOCS_DIR}/prior_statements.json" \
  --quarter-end "2026-09-30" \
  > "${DOCS_DIR}/statements.json"
```

The income statement is the easy one: every Result filing carries one, always
for the quarter just ended. The other two statements are not like that in
India, and this step exists because of the difference. **SEBI LODR Reg 33(3)
requires a statement of assets and liabilities and a statement of cash flows
only as at / for the half-year**, filed as notes to the half-yearly results —
so a Q1 or Q3 filing normally carries neither, an investor PPT in those
quarters often shows a balance sheet that is simply the last published one
repeated, and cash-flow figures when present are cumulative (H1 year-to-date
or full-year), never a single quarter.

Analysing a repeated statement as if it were new is the worst failure
available here — a confident write-up about numbers that did not move — so
that judgment is made deterministically, not by a model reading raw PDF text.
The script looks in the **Result filing first, then the PPT** (either may carry
them, and the PPT sometimes carries a fresher or more readable version),
prefers the consolidated statement over the standalone one where both appear,
normalizes labelled rows onto the schemas the two analyzers consume, captures
the filing's own printed comparative column as the prior-period snapshot, and
returns a status per statement:

| Status         | Meaning                                            | What the downstream skill does                                                   |
| -------------- | -------------------------------------------------- | -------------------------------------------------------------------------------- |
| `fresh`        | A genuinely new statement for this period          | Analyse it                                                                       |
| `stale-repeat` | Numerically identical to the one already on record | Say so in one line, don't analyse                                                |
| `stale-asof`   | `as at` date precedes this quarter's end           | Say so in one line, don't analyse                                                |
| `absent`       | Neither document carries it                        | Report "not disclosed this quarter" — compliance-normal in Q1/Q3, not a red flag |

Staleness is detected by fingerprinting the normalized numeric vector, so it
survives a re-parse in a different row order and needs no model in the loop.
Pass `--prior-statements` pointing at the previous `quarterly-result-documents`
record's `statementAvailability` fingerprints (or omit it on a first run).

Any row the label map could not assign comes back in `unmatched[]` rather than
being silently dropped — filings use inconsistent labels, and a line that might
be material deserves a look rather than a shrug. Assigning that small residue
is the only part of this step that needs judgment; do it here (cheap tier, same
rule as Step 3) before running the scans below, and only for rows whose value
is large enough to matter.

Then run the two signal scans — the same Extraction-First contract as Step 2,
and skipped entirely for any statement not marked `fresh`:

```bash
node -e "
const bs = require('./stock-api/src/analyzers/balanceSheetSignals.js');
const st = require('${DOCS_DIR}/statements.json');
if (st.analysable.balanceSheet) {
  console.log(JSON.stringify(bs.getOrCompute(companyId, bsPeriod, st.balanceSheet.current, st.balanceSheet.priorColumn, bsContext)));
}
" > "${DOCS_DIR}/balance_sheet_signals.json"

node -e "
const cf = require('./stock-api/src/analyzers/cashflowSignals.js');
const st = require('${DOCS_DIR}/statements.json');
if (st.analysable.cashflow) {
  console.log(JSON.stringify(cf.getOrCompute(companyId, cfPeriod, st.cashflow.current, st.cashflow.priorColumn, cfContext)));
}
" > "${DOCS_DIR}/cashflow_signals.json"
```

Both follow the full frameworks in
[`skills/_shared/balance-sheet-signals.md`](../../_shared/balance-sheet-signals.md)
and [`skills/_shared/cashflow-signals.md`](../../_shared/cashflow-signals.md),
are cached by `getOrCompute` the same way the P&L scan is, and return only what
cleared a materiality bar. Two context rules matter more here than they do for
the P&L:

- Key the cache `period` by the **statement's own date/window** (`2026H1`,
  `2026FY`), not the quarter being discussed — the same H1 statement is
  legitimately re-read from Q3's filing, and keying by date makes that a cache
  hit instead of a second scan of identical numbers.
- Every context figure handed to `cashflowSignals` (`ebitdaForPeriod`,
  `patForPeriod`, `revenueForPeriod`, `taxChargeForPeriod`,
  `financeCostForPeriod`) must cover **exactly** the window the cash-flow
  statement covers. A half-year cash flow set against full-year P&L figures
  makes every conversion ratio silently wrong. Same for
  `balanceSheetSignals`'s `revenueAnnualised`/`cogsAnnualised`, which are
  annualised precisely so the day-counts mean what they normally mean.

## Step 3 — Cheap, recall-first excerpt pass (cheap-tier reasoning, NO external API calls)

"Cheap model" means the same thing it means in `guidance-document-extractor`:
whichever agent is executing this skill does this pass itself (or spawns a
cheap-tier subagent), never a separately-billed external API call. This step
has no bundled script for that reason — the absence is intentional.

Read the Transcript + PPT text and pull out every passage relevant to:

- **Tone evidence** — any passage where management characterises the
  quarter, outlook, or a specific risk in its own words (this feeds
  `quarterly-result-analysis`'s six-label tone classification later — don't
  classify the tone here, just capture candidate quotes).
- **Guidance / forward-looking statements** — same recall-first rule as
  `guidance-document-extractor` Step 2: a number near a future-period cue,
  copied close to verbatim with surrounding context, full Q&A turn if the
  signal sits inside an analyst question.
- **Strategic / capital-allocation commentary** — capex plans, M&A, buyback,
  dividend policy, 3-5yr direction statements.
- **Topics present in the PRIOR transcript but silent this quarter** — do a
  simple keyword/topic diff between this quarter's excerpts and the prior
  transcript's excerpts (topics mentioned there, absent here); flag as
  `possiblyDropped`, don't editorialise on why.
- **Quantified operational/governance KPIs outside the P&L** — anything with
  a number that Step 2.5 can't reach because it isn't a P&L line: ROCE/ROE,
  volume or utilisation growth (actual or guided), related-party transaction
  amounts flagged as at-risk, working-capital/inventory-build swings called
  out in commentary, order book, capacity utilisation. Capture the number
  with its comparison basis (prior period value, or the guided figure it's
  being measured against) verbatim — this is recall, not selection; don't
  decide yet whether it belongs in the final KPI strip.

Same explicit permissiveness rules as `guidance-document-extractor` Step 2:
don't judge explicit-vs-directional, don't compute anything, keep dense
sections as one excerpt, keep nearby historical numbers if they're the base
value for a forward figure.

Output: `${DOCS_DIR}/excerpts.json` —
`{ticker, quarter, toneExcerpts: [...], guidanceExcerpts: [...], strategicExcerpts: [...], possiblyDropped: [...], kpiExcerpts: [{label, value, comparison, source}]}`.

## Step 4 — Persist to DB (script, no LLM)

```bash
node skills/equity-research/quarterly-result-extractor/scripts/save_result_documents.js \
  --manifest "${DOCS_DIR}/manifest.json" \
  --signals "${DOCS_DIR}/income_statement_signals.json" \
  --headline "${DOCS_DIR}/headline_financials.json" \
  --excerpts "${DOCS_DIR}/excerpts.json" \
  --statements "${DOCS_DIR}/statements.json" \
  --bs-signals "${DOCS_DIR}/balance_sheet_signals.json" \
  --cf-signals "${DOCS_DIR}/cashflow_signals.json"
```

Saves ONE `quarterly-result-documents` report via `db.saveReport()`, envelope
per `docs/DATA_RULES.md` §4 (`id`, `creationTime`, `modifiedTime`,
`creator: "quarterly-result-extractor"`, `companyId`, `date`). The `date` field
is set to:

- The `--date` parameter value if provided (scoped extraction for scheduled jobs)
- The extracted document's filing date otherwise (for interactive/manual runs)

The record carries `statementAvailability` (per-statement found/source/as-at/
staleness verdict) alongside the normalized `balanceSheet`/`cashflow` snapshots
and their signal scans. Always save the availability block even when both
statements are `absent` — a stored "not disclosed this quarter" is what lets
`quarterly-result-analysis` answer a balance-sheet question without re-fetching
the documents to discover there was nothing there.

Always save, including a genuine "nothing found" record when results aren't out yet —
this is what lets `quarterly-result-analysis` tell "never run" apart from
"run, results genuinely not filed" the same way `forward-guidance-extractor`
does for the guidance pipeline. No `modelUsed` field unless Step 3 ran on an
external model call (it shouldn't — see the cheap-tier note above); Step 3's
excerpt selection itself doesn't need `modelUsed` since it's recall, not
judgment (matches `guidance-document-extractor`'s convention).

Downloaded PDFs/text stay in `/tmp/` — never copied into the DB record; only
`textPaths` (session-local, re-fetchable) are informational, not something
downstream should rely on surviving past this session. `quarterly-result-analysis`
must be able to do its job from the DB record alone.

## File tree

```
quarterly-result-extractor/
├── SKILL.md
└── scripts/
    ├── fetch_result_documents.js       (Step 1)
    ├── compute_headline_financials.js  (Step 2.5)
    ├── extract_statements.js           (Step 2.6 — BS/CF locate + normalize + staleness)
    └── save_result_documents.js        (Step 4)
```

## Related skills

- `quarterly-result-analysis` — Stage 2, reads this skill's
  `quarterly-result-documents` DB record and produces the 3-basket
  interpretive note + widget. Auto-invokes this skill when given only a
  ticker and no record exists yet.
- `stock-documents-fetcher` — the generic underlying fetcher this skill's
  Step 1 script wraps; use that skill directly if you need documents without
  the signal-scan/excerpt layer this skill adds.
