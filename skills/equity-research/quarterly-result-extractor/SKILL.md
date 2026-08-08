---
name: quarterly-result-extractor
description: >
  Stage 1 of the 2-skill quarterly-result pipeline: fetches the latest PPT +
  Result + Transcript (and the prior quarter's Transcript, for narrative-shift
  comparison) for an Indian listed company from Stockscans, runs the
  deterministic income-statement-signals scan against the Result filing, and
  a cheap/recall-first excerpt pass over the Transcript+PPT that pulls out
  every passage plausibly relevant to tone, guidance, or strategic
  commentary — without judging what it MEANS. Persists ONE durable DB record
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

`--ticker NSE:X` (single company; this skill is company-scoped, unlike the
batch-oriented guidance pipeline — quarterly interpretation is normally
requested one company at a time).

## Step 1 — Fetch documents (script, zero LLM)

```bash
export STOCKSCANS_AUTH_TOKEN="$(grep '^STOCKSCANS_AUTH_TOKEN' .env | cut -d= -f2-)"
TICKER="NSE:SWARAJENG"            # replace with the actual ticker
SAFE=$(echo "$TICKER" | tr ':' '_')
DOCS_DIR="/tmp/${SAFE}_qra_docs"
node skills/equity-research/quarterly-result-extractor/scripts/fetch_result_documents.js \
  --ticker "$TICKER" --out-dir "$DOCS_DIR" > "${DOCS_DIR}/manifest.json"
```

`fetch_result_documents.js` wraps `documentsFetcher.js` (`fetchDocuments()`)
and `get-concall-transcript-url.js` (`ConcallTranscriptResolver`) — the same
two primitives the old single-skill Phase 1 called inline, now behind one
script instead of ad-hoc bash:

1. PPT + Result, latest quarter, straight from Stockscans (`fetchDocuments`
   with `types: ['PPT', 'Result']`, `startDate`/`endDate` = current quarter).
2. Latest Transcript: resolved via `ConcallTranscriptResolver` first (guaranteed
   to exist for every reported quarter now), then downloaded through
   `fetchDocuments` if resolution succeeds. On resolver `error` with PPT/Result
   also empty, results genuinely aren't out yet — stop and say so. On resolver
   `error` with PPT/Result present, proceed without a transcript and set
   `transcriptMissing: true` in the manifest — don't fail the whole fetch.
3. The PRIOR quarter's Transcript (`--last-n 2` semantics), for the
   narrative-shift comparison `quarterly-result-analysis` needs. Which of
   the two returned entries is "prior" depends on whether step 2's resolver
   call succeeded for the newest quarter — see the script's inline comment;
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

Same explicit permissiveness rules as `guidance-document-extractor` Step 2:
don't judge explicit-vs-directional, don't compute anything, keep dense
sections as one excerpt, keep nearby historical numbers if they're the base
value for a forward figure.

Output: `${DOCS_DIR}/excerpts.json` —
`{ticker, quarter, toneExcerpts: [...], guidanceExcerpts: [...], strategicExcerpts: [...], possiblyDropped: [...]}`.

## Step 4 — Persist to DB (script, no LLM)

```bash
node skills/equity-research/quarterly-result-extractor/scripts/save_result_documents.js \
  --manifest "${DOCS_DIR}/manifest.json" \
  --signals "${DOCS_DIR}/income_statement_signals.json" \
  --excerpts "${DOCS_DIR}/excerpts.json"
```

Saves ONE `quarterly-result-documents` report via `db.saveReport()`, envelope
per `docs/DATA_RULES.md` §4 (`id`, `creationTime`, `modifiedTime`,
`creator: "quarterly-result-extractor"`, `companyId`, `date`). Always save,
including a genuine "nothing found" record when results aren't out yet —
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
    ├── fetch_result_documents.js   (Step 1)
    └── save_result_documents.js    (Step 4)
```

## Related skills

- `quarterly-result-analysis` — Stage 2, reads this skill's
  `quarterly-result-documents` DB record and produces the 3-basket
  interpretive note + widget. Auto-invokes this skill when given only a
  ticker and no record exists yet.
- `stock-documents-fetcher` — the generic underlying fetcher this skill's
  Step 1 script wraps; use that skill directly if you need documents without
  the signal-scan/excerpt layer this skill adds.
