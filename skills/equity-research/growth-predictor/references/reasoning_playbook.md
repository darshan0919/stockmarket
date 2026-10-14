# growth-predictor — reasoning playbook (Step 2)

The only step that needs a model. Its output is two files, `assumptions.json` (numbers + why) and
`narrative.json` (the read), both specified in `assumptions_schema.md`. Arithmetic lives in
`project_pl.py`. Never do the arithmetic in prose.

Criticality (decided by Darshan, grill-skill 2026-10-14):

| Task                                       | Class                      | Tier                                                                                           |
| ------------------------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------- |
| A. Guidance read + credibility haircut     | **Mission-Critical Alpha** | flagship model; every guidance number quote-verified against the transcript excerpt            |
| B. Filings dot-connect → quantified levers | **Mission-Critical Alpha** | flagship; every lever cites the filing date + URL                                              |
| D. Phasing + one-off cleaning              | **Mission-Critical Alpha** | flagship; cleaning only with a quoted source                                                   |
| C. Macro overlay                           | Valuable Context           | flagship by default (single-company run is cheap); a lighter model is acceptable when batching |

Two knowledge sources: the expert KB (Suresh / SOIC / X handles; `kb:` citations) and **our own
equity-research skills' references** (section G). Citations: `kb:<suffix>` resolves with `yarn kb:cite <suffix>`. For a sector-specific rule mid-run, use
`yarn kb:cite --search "<terms>" [--topic pead|filings|macro|sector|valuation|jcurve]`. Do not call
another skill. The shared method (bridge, the two direct PAT levers, the SOIC modelling template, the
expert rule table) is `skills/_shared/earnings-forecast-method.md`. Read it once per session.

---

## A. Guidance read & credibility haircut (Mission-Critical)

**A1. Inventory every forward statement.** Sources, in order: `guidance.guidanceRows` and `keyMetricRows`
(Stockscans' table), `transcript.excerpt` (management's own words and the analyst Q&A), `growthCatalysts`
(context only; never the sole source of a number, same zero-assumption rule as forward-guidance-extractor).
For each statement record: metric, value or range, period, and **type**:

- `firm` — a number tied to a period ("27-28% EBITDA margin in FY27").
- `conditional` — depends on something ("if the order comes", "subject to approval"). Not firm (kb:463cdb84).
- `aspirational` — multi-year ambition ("10% of TAM by 2030"). Phase it last; never anchor a quarter on it.
- `relative` — "outperform the industry by 1.5-2x". Needs an external industry number (see A5).

**A2. Definition reconciliation (mandatory before any margin is used).** Stockscans `operating_profit`
**excludes other income**. Many managements quote EBITDA _including_ other income, or "adjusted"
numbers. Compare management's latest-quarter EBITDA (Key Metrics row) with Stockscans'
`operating_profit` for the same quarter. If they differ, shift the guided margin by that gap before using
it, and say so in the input's `source`. Example: SJS Q1FY27 management 30.0% vs Stockscans 28.6%, so a
"27-28%" guide is ~26-27% on Stockscans' basis.

**A3. Walk-the-talk (credibility verdict: high / medium / low).** Evidence, strongest first:

1. `guidanceHistory`: prior concalls' guidance rows vs what `actuals` later show. Name each hit or miss
   and its size.
2. Management's own claims that can be checked in `actuals` (e.g. "27th consecutive quarter of
   outperformance"). Check the trend instead of trusting the adjective.
3. `documents.hasGuidanceReport` = true: Stockscans' native Guidance Report (Delivered/On track/Missed)
   exists. Mention it as the cross-check for the user. There is no API client yet.
4. Our own `history.scores` for this company: past forecast errors.

Rules:

- Trust guidance only as far as past delivery supports it (kb:add4bc8e, kb:7f7bbe72).
- A missed number on the last call lowers expectations (kb:2d24e595).
- A new listing's first-concall guidance gets extra scepticism (kb:c7bfdfc5).
- Most stories break at PAT; sales tied to orders or capacity are credible (kb:d0a47655, kb:bbfbff69).

**A4. Sandbag vs stretch.** Compare the guide with the run-rate:

- **Sandbag**: delivery beat the guide repeatedly (e.g. guide 27-28%, delivered 28-30% for 4 quarters).
  Use the guide as a **floor**; base sits on the run-rate, bull above it.
- **Stretch**: the guide implies a remaining-quarter run-rate far above anything delivered
  (`project_pl` flags back-ended FY phasing and YoY acceleration). Base gets a haircut sized by the
  credibility verdict:
  - high: 0-5% off the implied remaining revenue;
  - medium: 5-15%;
  - low: 15-30%, or take the run-rate instead.
    State the haircut as an `assumption` input with its reason.
- Guidance already met (FY driver ≤ YTD): treat the guide as stale and model from the run-rate.

**A5. No guidance or relative guidance.**

1. Revenue = industry growth × the company's historical outperformance multiple, set a notch
   conservative (SOIC Financial Modelling, 01.02.26 Part 2), plus filing-backed levers.
2. Industry growth comes from monthly data already in `inputs.monthlyUpdates`, or from WebSearch
   (SIAM/CMIE/ministry releases). Cite it in `narrative.webSources`.
3. No industry data either → company's own trailing growth, tagged `assumption`.
4. Margins from the long-run average backed by commentary, not the latest quarter (kb:286f171f).

---

## B. Filings dot-connect (Mission-Critical)

Input: `filings.items` (all announcements since the latest reported quarter's end).

- **KNOWN_AT_CONCALL** items: management could already have priced them into guidance.
- **NEW_SINCE_CONCALL** items: genuinely new information for the target quarter.
- `textHead` / `numbers` carry the cached text of the material ones.

Apply Suresh's filing read to every non-routine item: formal? new? sized? executed? diluted? aligned?
(framework `kbf_x-sureshkbn_filing-read`). Then map each one to a lever. Default lever arithmetic:

| Event (dotTags)                                                       | Lever line(s)                                                                                                | Default arithmetic (override with the filing's own numbers)                                                                                                                                                                                                                                                                                                                                                                                       | KB                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Capacity commissioned (`capacity`, "commenced commercial production") | `revenue` + optional `ebitda` premium, `depreciation`                                                        | Revenue = capacity × realisation × utilisation. Utilisation: ~30-40% in the first quarter, ~80% after ~2 quarters, pro-rated for days live. The first 30 days carry teething issues. Incremental EBITDA margin can exceed the blended margin once fixed costs are absorbed (only an `ebitda` premium lever, sized 1.5-2.5× blended is the pre-pead convention). D&A = capex ÷ ~20y from the go-live date. Interest capitalisation ends at go-live | kb:fdb27c81, kb:a1b1fc44, kb:c79fe9e1, kb:0b776336, kb:f5f4cee7 |
| Capacity announced / under construction                               | none for the target quarter                                                                                  | Revenue realisation is 3-4 quarters away. Only capex ready to commission moves the next quarter. Note slip risk (2-3 months typical)                                                                                                                                                                                                                                                                                                              | kb:20bb48ea, kb:e3d9a244, kb:19d89eea                           |
| Debt repaid / prepaid (`debt`)                                        | `interest` (−)                                                                                               | Saving per quarter = amount × cost of debt ÷ 4, pro-rated from the repayment date (average, not period-end, debt). Cost of debt = interest ÷ average borrowings                                                                                                                                                                                                                                                                                   | kb:57b42f46                                                     |
| QIP / preferential / warrants / rights (`dilution`)                   | `shares_cr` (+), `other_income` (+ treasury yield on unspent proceeds), `interest` (− if used to repay debt) | New shares from the allotment filing. Weight by days outstanding for the quarter EPS. Then run the EPS-beats-dilution check, using the shared `packages/jobs-runtime/lib/dilutionCheck.js` arithmetic                                                                                                                                                                                                                                             | kb:28f8e391, kb:c4fdeb9f, kb:da098eeb                           |
| ESOP allotment                                                        | `shares_cr`                                                                                                  | Usually <1%. Fold it into `sharesCr.value` with the filing as source                                                                                                                                                                                                                                                                                                                                                                              |                                                                 |
| Order win (`order`)                                                   | `revenue` (rest of FY mostly)                                                                                | Order value ÷ execution period. Government orders execute slowly. EPC margin per order type. Cross-check `orderBook` (ledger) cumulative vs guided revenue                                                                                                                                                                                                                                                                                        | kb:0be64eed, kb:4b1122d6, kb:9c36d2e6                           |
| Acquisition closed (`inorganic`)                                      | `revenue`, `ebitda`, `interest`/`shares_cr` per funding                                                      | Consolidate from the closing date only. Acquired margin ≠ parent margin. Inorganic growth is flagged as non-organic in the narrative                                                                                                                                                                                                                                                                                                              | kb:32866b55                                                     |
| Price hike / realisation (`pricing`)                                  | `revenue` and margin bps                                                                                     | Effective date × share of the mix. Who absorbs the input-cost lag?                                                                                                                                                                                                                                                                                                                                                                                | kb:95645d7a                                                     |
| Disruption: fire, shutdown, strike (`disruption`)                     | `revenue` (−), `exceptional`                                                                                 | Days lost × daily run-rate. Insurance claims become an exceptional item, never core                                                                                                                                                                                                                                                                                                                                                               |                                                                 |
| Monthly business update (`volume_update`)                             | `revenue` (target quarter)                                                                                   | Two of three months reported → the target quarter is mostly known. Anchor it there and phase the third month by last year's pattern                                                                                                                                                                                                                                                                                                               |                                                                 |
| Management exit (CFO/CEO)                                             | none (credibility)                                                                                           | Governance flag. Lower the credibility verdict if clustered                                                                                                                                                                                                                                                                                                                                                                                       |                                                                 |

Rules:

- **No double counting.** If the guidance-based driver already includes the event (e.g. the guide was
  given _because_ the plant was coming), keep the lever with `"embedded": true`. It is shown, not
  added.
- **Business updates are not earnings.** An order or a capacity announcement only matters through
  margins and execution (kb:0c2a561f). Never let a filing move margin without a stated mechanism.
- **Dilution.** If shares rose and PAT did not keep pace, EPS growth is what the shareholder gets
  (kb:c4fdeb9f). Always report EPS deltas next to PAT.
- **Unquantifiable item.** Record it in `narrative.dotConnect` as `inModelAs: "not modelled — <why>"`.
  Never invent a number.

---

## C. Macro overlay (Valuable Context)

Inputs:

- `macro.instruments`: TradingView. `perf3M` ≈ the QoQ move; `spotVsSma50Pct` ≈ where the current
  quarter is vs the last.
- `macro.industryRule`: role (input_cost / realisation / fx_revenue / rate) and default lag.
- `skills/_shared/macro/quarterly-macro-context.md`: dated events with sector tables.
- `../../_shared/sector-playbooks/`: how the sector's pass-through works.

1. If `macro.quarterLogCoversTarget` is false, research the quarter (WebSearch; oil, FX, rates, monsoon,
   tariffs, policy, the sector's own demand data). Add a `## Q_FY__` section to the shared log, newest
   at the top, every claim cited, marked partial if the quarter is still running. Do this once per
   quarter for everyone. Never answer from memory for a live quarter.
2. Quantify only through a channel:
   - **Input cost → margin bps.** Pass-through lag from the concall (e.g. "1-2 quarters" → most of a
     Q2 spike shows up in Q2-Q3). Size from management's own sensitivity when given (e.g. "RM impact
     50-60 bps").
   - **Rates → interest / NIM.** Floating debt × Δrate. For banks/NBFCs, read NIM direction (rate
     cuts compress bank NIM, help fixed-rate NBFCs; kb:59582635).
   - **FX → translated revenue** for exporters (export share × ΔUSDINR) and imported RM cost.
   - **Demand.** Industry volume data already sits in the revenue driver (A5). Do not add it twice.
3. Expert thresholds:
   - Oil above ~$100 for weeks is a sustained margin headwind, with the earnings hit sliding 1-2
     quarters (kb:1821fc75, kb:4b0ec780).
   - Oil and yields must calm before risk-on (kb:d1c86799).
   - Commodity cyclicals are valued on normalised margins, never peak ones (kb:6ff2f711, kb:554a1b9a).
4. Macro moves usually belong in the **bear/bull spread**, not the base, unless management has already
   quantified them.

---

## D. Phasing & one-off cleaning (Mission-Critical)

1. **Clean the base before projecting.** Read Key Metrics (management's "adjusted PAT", "one-time gain")
   and look for other income or tax-rate spikes in `actuals`. Record each item in
   `assumptions.baseCleaning` with the reported figure, the normalised figure and a quoted source.
   `project_pl` then reports QoQ / YoY / FYoFY on both a **reported** and a **core** basis. Strip:
   asset-sale gains, MTM/forex, interest on tax refunds, deferred-tax credits, inventory gains,
   insurance claims, labour-code catch-ups (kb:5b295eb1, kb:a6b5c1da).
2. **Never annualise a temporary benefit.** That covers a seasonal gross-margin spike or a one-quarter
   price lag (kb:f95df422, kb:18ac2964).
3. **Phase the FY in two passes.**
   - Across years: a multi-year target is back-ended if the capacity is late and front-loaded if it
     exists today.
   - Across quarters: capacity go-live dates first, then the company's own seasonality.
     `project_pl` defaults to the average past seasonality and flags quarters whose implied QoQ is more
     than 15pp from history.
   - For lumpy order-execution businesses, judge on 9M or H1 rather than a single QoQ (kb:c5777d77).
4. **Low or one-off-inflated base.** YoY growth off a weak base is flagged in the narrative and never
   presented as acceleration (kb:17155ded).

---

## E. Scenarios (bear / base / bull)

- **Base** = what the evidence supports today (guidance haircut by credibility + filing levers + macro
  that is already visible).
- **Bear / bull** each move **named drivers**, typically 2-4 of: industry demand, outperformance
  multiple, margin (RM lag / pass-through), capacity ramp speed, other income. Never a blanket ±x%.
- Write the one-line logic in `narrative.scenarioLogic`.
- Bands are what `score_prediction.js` grades against the result, so keep them honest:
  - if more than half of past actuals land outside bear–bull (`yarn growth-predictor:score --summary`),
    widen them;
  - if nearly all land inside a very wide band, tighten them.

## F. PEAD read-through (framing, not a signal)

Suresh: "do the maths before results but set no expectations", "predicting is not PEAD", "bucket
bear/base/bull and let the result decide" (kb:75dbc5b6, kb:a7621186, kb:3eded4e6). So `narrative.pead`:

- states which bucket each scenario would correspond to on result day;
- names the one or two numbers that would make the result a genuine **surprise**: e.g. "PAT ≥ bull
  with margin ≥ 29% on a ₹N cr base = a quality beat", per the PEAD five gates
  (`kbf_x-sureshkbn_pead-gates`);
- reminds the reader that a beat still needs price confirmation and Q+1 confirmation before sizing up
  (Darshan's rules, 2026-10-09).

Never recommend a pre-result entry.

---

## G. Learnings from our own skill library (2026-10-14)

These rules come from our equity-research skills rather than the KB. Each one is cited by the file
that owns it. They are read as rules here, never run as skills. Where a skill already produced a
verdict for this company, `inputs.priorAnalyses` carries it: reuse it, don't re-derive it.

| Rule                                                                                                                                                                                                                                                                                                                                                                           | Applies in | Owner (read for detail)                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Read the base through the 15-line P&L scan, not Stockscans' collapsed lines.** `inputs.resultScan` holds the XBRL line items and the shared analyzer's material lines and combinations. Stockscans' `other_income` **folds in exceptional items** (SJS Q1FY27: 33 cr = 5.3 core + 28.0 exceptional). Take the run-rate from XBRL `otherIncome` and clean `exceptionalItems`. | D          | `skills/_shared/income-statement-signals.md`, `stock-api/src/analyzers/incomeStatementSignals.js`                                        |
| **Margin sustainability tag.** Tag the latest margin before carrying it forward. `SUSTAINABLE` (mix / process / scale) carries into base. `CYCLICAL` (commodity tailwind) fades with the input trend in the base. `TEMPORARY` (inventory gain — `INVENTORY_GAIN_DRIVEN` combo, or an inventory build alongside a falling RM %) is stripped.                                    | A, D       | quarterly-result-analysis `basket_framework.md` §1B                                                                                      |
| **One-off recurrence audit.** If "one-off" cost excuses (power, freight, FX, maintenance) appear in ≥2 of the trailing 4 quarters, they are recurring. Do not add them back in the base.                                                                                                                                                                                       | D          | `basket_framework.md` §1B                                                                                                                |
| **Gross vs EBITDA spread.** Gross margin flat/up but EBITDA margin down ≥50 bp means overhead/SG&A drag, so model an opex lever, not RM. Gross margin down ≥100 bp means a pricing-power loss, so the macro RM lever applies.                                                                                                                                                  | C          | `basket_framework.md` §1B (SOIC 17.05.26 Earnings Decoded)                                                                               |
| **Walk-the-talk tolerances.** MET = within 10% of the guided floor. BEAT = ≥5% above (growth/level) or ≥50 bp (margin). Lower-is-better metrics invert. Capacity dates are binary: one quarter late = missed. Use `priorAnalyses[quarterly-result].walkTheTalk` when present.                                                                                                  | A3         | `management-credibility-tracker/references/credibility_framework.md`, `quarterly-result-analysis/references/inflection_walk_the_talk.md` |
| **Credibility → haircut map.** HIGH (+5..+8, e.g. Mayur/Navin) → guide is a floor, base on run-rate, bull above it. MEDIUM (+1..+4) → 0-5% haircut. MIXED (0, Gravita-like) → 10-15%, plus aspirational targets reset to the run-rate. WATCH/RED (≤ −1, Hikal-like) → 15-30%, or ignore the guide.                                                                             | A4         | `credibility_framework.md`, `case_study_calibration.md`                                                                                  |
| **Confidence-language trajectory.** "We will / target is" sliding to "we expect / may / aspire" precedes a miss by 1-2 quarters: downgrade one band. Quietly **dropped** guides (`forward-guidance` `qoq_status: dropped`) count against trust. Never-raised guides that keep getting beaten mean sandbagging, not an inflection.                                              | A3, A4     | `credibility_framework.md`, `inflection_walk_the_talk.md` "What could be wrong"                                                          |
| **Definition check.** Guided "EBITDA" vs reported "operating margin" are different numbers (also A2).                                                                                                                                                                                                                                                                          | A2         | `credibility_framework.md` cross-check 5                                                                                                 |
| **Trigger conviction → scenario placement.** `HIGH CONVICTION` (contracted / in book / plant live) goes in base. `MEDIUM` (guided, not contracted) goes in base with the credibility haircut, full value in bull. `OPTIONALITY` goes in bull only.                                                                                                                             | B, E       | `basket_framework.md` §1D (shared with growth-triggers-1pager)                                                                           |
| **Capacity size.** Peak revenue ≈ capex × asset turn (guided or historical; SJS guides ~2-2.5x today, 5x for displays). Utilisation ramp per §B. Customer/OEM qualification can add 12-18 months before volumes (KRN case). Track CWIP → gross-block conversion as the go-live proof.                                                                                          | B          | `inflection_walk_the_talk.md` §3 (`CAPACITY` trigger), `rerating-catalysts/references/sector_case_studies.md` §3                         |
| **Order book leads revenue, capacity leads sales.** An order-book step-up or a commissioned plant means the P&L confirmation is still ahead: it belongs in the rest-of-FY quarters, not the target quarter, unless execution is short-cycle.                                                                                                                                   | B, D       | `rerating-catalysts/references/growth_catalyst_framework.md` §5d                                                                         |
| **Leverage sanity.** The engine reports operating (%ΔEBITDA/%ΔRev), financial (%ΔPAT/%ΔEBITDA) and combined (%ΔPAT/%ΔRev) leverage, plus the PAT>EBITDA>Revenue ordering. A combined multiple above 5x, or a PAT lift below EBITDA, needs a named lever. Leverage works in reverse too: when growth slows, fixed costs bite.                                                   | E, audit   | `growth_catalyst_framework.md` (Dr. Anil Lamba combined-leverage framework)                                                              |
| **Guidance ladder.** The engine's `guidanceLadder` gives the rest-of-FY revenue YoY and margin the FY driver requires, vs YTD. A required run-rate far above YTD is a stretch: haircut it, or explain the step-up (capacity date, order burn).                                                                                                                                 | A4, D      | `quarterly-result-analysis/references/monitoring_checklist_patterns.md` Pattern 2                                                        |
| **Last quarter's monitoring checklist.** `priorAnalyses[quarterly-result].monitoringChecklist` lists what we said to watch this quarter. Answer each row from the new filings, and turn confirmations or misses into levers or haircuts.                                                                                                                                       | B          | `monitoring_checklist_patterns.md`                                                                                                       |
| **Sector driver model.** When P&L guidance is thin, model revenue on the sector's own unit economics: cement volume × realisation/t (EBITDA/t), hotels rooms × RevPAR, banks/NBFCs AUM × NIM → PPOP − credit cost (RoA tree), EPC order book ÷ execution period × margin, IT TCV/order-booking.                                                                                | A5         | `skills/_shared/sector-valuation-kpis.md` (KPI table), `basket_framework.md` §1B NBFC RoA tree                                           |
| **Over-earning check.** Near a multi-year margin high, with management walking guidance down (e.g. "32%→24-26%→21-22%"), the base fades toward mid-cycle. Never extrapolate peak margins in commodity names.                                                                                                                                                                   | A, C       | `sector-valuation-kpis.md` "Over-earning / cycle check"                                                                                  |
| **Q1/Q3 working-capital blind spot.** No balance sheet or cash flow in Q1/Q3 filings, so a margin step-up seen in such a quarter stays conditional. Keep it out of the bear case.                                                                                                                                                                                              | E          | `basket_framework.md` Q1/Q3 structural cap rule                                                                                          |
| **Post-result fade test (PEAD G5).** Without a fresh trigger (orders, capex live, debt retirement, mix) a post-result move tends to fade within weeks. Name the trigger in `narrative.pead`.                                                                                                                                                                                   | F          | `basket_framework.md` §1D, `kbf_x-sureshkbn_pead-gates`                                                                                  |

Deliberate difference from quarterly-result-analysis: its guidance table refuses to extrapolate an
unguided bottom line (`UNGUIDED — no extrapolation`). growth-predictor's job _is_ the estimate, so it
extrapolates. Every such input must then be tagged `heuristic`/`assumption`, appear in
`narrative.assumptions` with a sensitivity, and show up in `assumptionShare`.
