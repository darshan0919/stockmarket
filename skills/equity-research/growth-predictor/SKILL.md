---
name: growth-predictor
description: >
  Predict a listed Indian company's UPCOMING quarter and current fiscal year — Revenue, EBITDA, PAT and
  EPS with QoQ, YoY and FYoFY growth — as bear / base / bull scenarios. The forecast starts from
  management guidance and the quality of prior results. It then connects the dots across every filing
  since the last result (capacity go-live, debt repayment, QIP / preferential / ESOP dilution, orders,
  acquisitions, shutdowns, monthly business updates) and the macro backdrop (raw-material and commodity
  prices, crude oil, rate moves, USDINR). Every assumption taken for lack of guidance is tagged
  (guided / actual / filing / derived / macro / heuristic / assumption) and stated. Grounded in SOIC's
  financial-modelling method and SureshKBN's / SOIC's PEAD and filing-read learnings from the KB. Each
  prediction is auto-scored against the actual result when it lands. Use whenever the user asks to
  "predict next quarter", "estimate Q2/Q3 revenue and PAT", "what will X report", "forecast FY27 EPS",
  "growth predictor for <ticker>", "model the upcoming quarter", "what PAT should I expect before
  results", "do the maths before results", "QoQ/YoY/FYoFY estimate", or "how do the new plant / debt
  cut / QIP change next quarter's numbers". Also use for "score my predictions" or "how accurate were
  the growth predictions". Single company per run (loop for a short list). For ranking a whole
  pre-results universe by surprise, use pre-pead-scanner instead.
---

# growth-predictor

**What it answers:** "Given what management guided, what the last results really were (one-offs out),
and everything filed or moved in the macro since, what should the next quarter and this FY look like,
and which numbers are guesses?"

**Framing (Suresh, kb:75dbc5b6 / kb:a7621186):** _do the maths before results, set no expectations_.
The output is bear / base / bull buckets plus the levers that move between them, never a pre-result
trade signal. After results, the bands are scored (Step 6). That calibration loop is what makes the
next run sharper.

**Standalone skill.** It invokes no other skill. Shared logic lives in common files it reads or runs:

- `skills/_shared/earnings-forecast-method.md` — the forecasting method, SOIC modelling template and
  KB-cited expert rules. Read it once per session.
- `skills/_shared/fiscal_periods.py` — period arithmetic, shared with pead-surprise-ranker.
- `skills/_shared/macro/quarterly-macro-context.md` and `commodity-basket.json` — macro event log and
  instrument map, shared with pre-pead-scanner.
- `skills/_shared/kb_cite.py` — KB citations and lookup.

It may _read_ other skills' stored outputs (forward-guidance DTOs, order-book ledger, monthly updates)
as data.

Conventions: `skills/_shared/conventions.md` — §3 (db.js only), §5/§18 (DTO first, PDF only), §8
(`contextUsed`), §9 (files touched), §11 (token note), §17 (script = arithmetic, model = judgment), §24
(no LLM API keys; self-reported tokens), §26 (platform reuse), §28 (newest KB view wins), §29 (always
show the Δ).

## Workflow

```
1 gather (script) ─▶ 2 reason (model: assumptions.json + narrative.json) ─▶ 3 project (script)
        ▲                          │                                              │ flags
        └──── re-run with --force  └──────────── 4 self-audit (fix / explain) ◀───┘
5 save DTO + PDF (script) ─▶ data:push ─▶ files touched ─▶ token note        6 score (script, later)
```

Use one run id per company and date. All run files live in `data/runs/`, which is re-derivable and is
never a deliverable:
`growth-predictor_<EXCH_SYMBOL>-<asOf>_{inputs,assumptions,narrative,projection}.json`.

### 1. Gather (script, no LLM)

```bash
# scheduled job? first: export STOCKMARKET_JOB_NAME=<job-dir>   (conventions §23)
yarn growth-predictor:gather --company NSE:X [--extra-tickers MCX:NICKEL1!] [--force]
```

One bundle with:

- actuals (12 quarters / ~7 FYs);
- implied share count + dilution steps;
- Stockscans guidance tables, plus up to 4 prior concalls' guidance for walk-the-talk;
- transcript keyword windows;
- every filing since the last quarter end, classified (KNOWN at the concall vs NEW since), with cached
  text for the material ones;
- order-book ledger and monthly business updates;
- TradingView macro for the industry's basket;
- our own past predictions and scores;
- `buildCompanyContext` ids.
- **Result-quality scan** of the latest quarter (`resultScan`): XBRL line items through the shared
  income-statement signal analyzer. It catches the exceptional items that Stockscans folds into other
  income, inventory gains, RM-% swings and tax effects. The cache is shared with
  quarterly-result-analysis.
- **What our skills already concluded** (`priorAnalyses`): the latest quarterly-result (guidance
  table, walk-the-talk, monitoring checklist, PEAD read), rerating-catalysts (J-curve stage),
  credibility and filings-diff DTOs. Reuse these verdicts instead of re-deriving them.

Read its one-line summary. Then check:

- `errors` non-empty → report what is missing, continue with what exists.
- `--force` right after the company files results (24h actuals cache).
- `extra-tickers` when the concall names a raw material the basket lacks (decide after reading the
  transcript, then re-run).

### 2. Reason (model; Mission-Critical — follow `references/reasoning_playbook.md` exactly)

Read the inputs JSON. Do not open PDFs the bundle already excerpted. Then work through four parts:

- **A. Guidance read + credibility haircut.** Classify each statement as firm / conditional /
  aspirational / relative. **Reconcile the EBITDA definition** with Stockscans' `operating_profit`
  (which excludes other income). Set the walk-the-talk verdict. Decide sandbag (guide = floor) vs
  stretch (haircut). No guidance → industry × outperformance or run-rate, tagged `heuristic`.
- **B. Dot-connect.** Turn every non-routine filing into a lever using the playbook's event → lever
  table: ramp curves, D&A from go-live, interest saved from the repayment date, shares from the
  allotment date. Mark `embedded` when the guide already contains it. Anything unquantifiable is
  stated as "not modelled — why".
- **C. Macro overlay.** If `macro.quarterLogCoversTarget` is false, research the quarter and add a
  section to the shared log first. Quantify only through a channel (input cost → bps with the
  concall's lag; rate → interest / NIM; FX → translation). It mostly widens bear and bull.
- **D. Phasing + one-off cleaning.** Clean the base with quoted sources (`baseCleaning`). Phase the FY
  by capacity dates, then the company's own seasonality.

Then apply section **G** of the playbook: rules learned from our own skill library, covering margin
sustainability tags, one-off recurrence, credibility → haircut map, trigger conviction → scenario
placement, capacity × asset turn, the sector driver model, the over-earning check and last quarter's
monitoring checklist.

Bear and bull must each change **named** drivers. For a sector-specific rule mid-run, run
`yarn kb:cite --search "<terms>" --topic <pead|filings|macro|sector|valuation>`.

Write `assumptions.json` and `narrative.json` per `references/assumptions_schema.md`.

### 3. Project (script, no LLM)

```bash
yarn growth-predictor:project --inputs <inputs.json> --assumptions <assumptions.json> --out <projection.json>
```

It produces:

- bear / base / bull for the target quarter and FY (YTD reported + projected);
- QoQ / YoY / FYoFY for Revenue, EBITDA, PAT and EPS on a **reported** and a **core** (one-offs out)
  basis;
- leave-one-out lever attribution and the inputs ledger;
- the leverage profile (operating / financial / combined, Lamba) and the guidance ladder (what the
  rest of the FY must deliver vs YTD);
- `assumptionShare` and sanity flags.

`invalid_assumptions` means an input has no source or basis: fix it. Never quote a number the engine
did not produce.

### 4. Self-audit (mandatory — "what could be wrong with this?")

Resolve every engine flag: fix the assumption, or explain it in `narrative.whatCouldBeWrong`. Then check:

1. **Source spot-check.** Re-read each `guided` number's quote in the transcript excerpt or guidance
   rows (quote-verify), and each `filing` lever's date and amount against `filings.items`.
2. **EBITDA definition.** Was the reconciliation done? A 1-2pp gap is common.
3. **Base quality.** Does any comparator quarter carry other income, tax-rate or exceptional spikes
   that were not cleaned?
4. **Data staleness.** Is industry data partial (e.g. two of three months)? Is the concall older than
   about 75 days? Does the macro log section say "partial"?
5. **Assumption share.** If the revenue path is `heuristic`, say so in the headline. If soft levers
   explain more than about 25% of base PAT, call that out.
6. **Calibration.** Run `yarn growth-predictor:score --summary`. If past actuals mostly fell outside
   the bands, widen them. Note the median error.
7. **Consistency.** Bear ≤ base ≤ bull on revenue and PAT. EPS uses the post-dilution share count.
   FYoFY core vs reported both present when the YTD carries a one-off.

Re-run Step 3 after any change. Two iterations at most; then ship with the residual flags shown.

### 5. Save + render (script) → push

```bash
yarn growth-predictor:save --inputs <inputs.json> --projection <projection.json> \
  --narrative <narrative.json> --model <exact model id that wrote steps 2/4>
yarn data:push
```

- **Report:** DTO `type: growth-prediction` → `reports.json` + body. The id is deterministic, so a
  same-day re-run upserts. It carries `modelUsed`, `contextUsed` and `status: open`.
- **PDF:** `data/assets/growth-predictor/<EXCH_SYMBOL>_<Qtr>_growth_prediction.pdf`, rendered by
  Puppeteer with a WeasyPrint fallback. See `skills/_shared/pdf-artifact-step.md`.

### Reply to the user (do not echo the PDF)

1. **Headline.** One line.
2. **Table.** Base-case target quarter and FY:
   - rows Revenue / EBITDA / PAT / EPS;
   - columns value | QoQ | YoY | FYoFY (FY row), reported and core where they differ;
   - the bear–bull range per row.
3. **Assumptions.** The 3-5 assumptions that move PAT most, each tagged with its basis.
4. **Dots connected.** The NEW filings that changed the numbers.
5. **Macro.** One line.
6. **Link.** The PDF link.
7. **Files touched** (§9). From `save` output `touched` and the `data:push` ↑ lines, never from memory.
8. **Token note** (§11). Example: "inputs bundle cached; re-run within 24h re-uses actuals and filing
   texts; Steps 1/3/5/6 are script-only".

Final step (§24):

```bash
python3 scripts/metrics/track_invocation.py --name growth-predictor --type skill --model <model> \
  --files <inputs.json> --output-words <approx>
```

### 6. Score (script, later — closes the loop)

```bash
yarn growth-predictor:score --all-open [--force]   # after results land; weekly in results season
yarn growth-predictor:score --summary              # calibration: median |error|, % inside bear-bull
```

Writes `growth-prediction-score` records to `validation.json` and flips the report to `status: scored`
with the outcome.

## Data written (DATA_RULES)

| What                                                        | Where                                                                                           | How                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Inputs / assumptions / narrative / projection / render HTML | `data/runs/growth-predictor_*`                                                                  | plain files (re-derivable run artifacts)     |
| Prediction DTO                                              | `reports.json` + `reports/` body, `type: growth-prediction`                                     | `db.saveReport` (save_prediction.js)         |
| Score                                                       | `validation.json`, `type: growth-prediction-score`                                              | `db.appendValidations` (score_prediction.js) |
| PDF                                                         | `data/assets/growth-predictor/`                                                                 | save_prediction.js                           |
| Shared macro log section (new quarter)                      | `skills/_shared/macro/quarterly-macro-context.md` (repo, committed by Darshan)                  | agent edit                                   |
| Caches reused                                               | `data/cache/company-financials`, `stockscans-context`, `concall-notes`, `announcement-pdf-text` | existing libs                                |

No new collection; nothing is deleted in any write path.

## Model tiers

Mission-Critical (flagship): A, B and D, plus the Step 4 audit. Valuable Context: C (flagship by
default; a lighter model is acceptable when batching more than 10 names). Steps 1, 3, 5 and 6 are
scripts. No script calls an LLM API.

## Pitfalls

- **Stockscans actuals** are consolidated and whole-₹-cr rounded. Small-company PAT growth can be off
  by several points.
- **EPS.** Stockscans quarterly EPS can be on a diluted or weighted basis. Use the filing's share
  capital.
- **QoQ is seasonal.** Read YoY and the company's own seasonal QoQ (the flag compares them).
- **Banks / NBFCs** (`layout: financial`). EBITDA is meaningless. Use `pat_override` built from
  AUM × NIM − credit cost, and read Revenue / PAT / EPS only.
- **Inorganic growth** (acquisition consolidation) is labelled non-organic in the headline.
- **Pre-results ranking** is not this skill's job. For a universe ranked by surprise vs street, use
  pre-pead-scanner. For a ranking by guided growth, use pead-surprise-ranker. growth-predictor is the
  single-company, every-line, every-filing model.

## Files

```
growth-predictor/
├── SKILL.md
├── references/
│   ├── reasoning_playbook.md   (Step 2 — A/B/C/D/E/F, KB-cited)
│   └── assumptions_schema.md   (assumptions.json + narrative.json contracts, basis vocabulary)
└── scripts/
    ├── gather_inputs.js        (Step 1)   ├── project_pl.py        (Step 3)
    ├── save_prediction.js      (Step 5)   ├── score_prediction.js  (Step 6)
    ├── test_project_pl.py                 └── test_scripts.test.js
```
