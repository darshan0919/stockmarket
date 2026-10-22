---
name: pead-predictor
description: >
  Institutional-grade PEAD (Post-Earnings Announcement Drift) and quarterly results predictor for listed
  Indian companies. Predicts the UPCOMING quarter and current fiscal year — Revenue, EBITDA, PAT and
  EPS with QoQ, YoY and FYoFY growth — as bear / base / bull scenarios. Crucially integrates pre-earnings
  price action and volume-delivery accumulation (the Onward Tech pattern: 10x volume surge, heavy delivery
  absorption, pre-result breakout) to evaluate whether smart money is positioning ahead of numbers and
  quantify the Expectation Hurdle and Sell-the-News vulnerability. Grounded in SureshKBN's 5 PEAD Gates
  (Surprise vs Expectations, Result Quality, Priced-In & Positioning, Concall Guidance, and Post-Result
  Catalysts) and SOIC financial modelling. Each prediction is auto-scored against the actual result and
  drift outcome when it lands. Single company per run. Use whenever the user asks to "predict PEAD",
  "PEAD predictor for <ticker>", "predict next quarter", "estimate Q2/Q3 revenue and PAT", "what will X report",
  "forecast FY27 EPS", "what PAT should I expect before results", "do the maths before results",
  "pre-earnings price action signal", "is the result priced in", "QoQ/YoY/FYoFY estimate", or "how do new
  plant / debt cut / QIP change next quarter's numbers". Also use for "score my predictions".
---

# pead-predictor

**What it answers:** "Given what management guided, what the last results really were (one-offs out),
what pre-earnings price action and delivery accumulation signal (the Onward Tech pattern), and everything
filed or moved in the macro since: what should the next quarter look like, what is the expectation hurdle,
and what is the probability of a sustained Post-Earnings Announcement Drift (PEAD)?"

**Framing (SureshKBN, kb:75dbc5b6 / kb:a7621186):** _do the maths before results, set no expectations;
predicting is not PEAD — surprise cannot be predicted, but you can calculate the exact hurdle required for drift_.
The output is bear / base / bull buckets plus the levers that move between them, an explicit evaluation of
pre-result price action, and a SureshKBN 5-Gate Pre-Flight Scorecard. After results, the bands and drift
are scored (Step 6).

**Standalone skill.** It invokes no other skill. Shared logic lives in common files it reads or runs:

- `skills/_shared/earnings-forecast-method.md` — the forecasting method, SOIC modelling template and
  KB-cited expert rules. Read it once per session.
- `skills/_shared/fiscal_periods.py` — period arithmetic, shared with pead-surprise-ranker.
- `skills/_shared/macro/quarterly-macro-context.md` and `commodity-basket.json` — macro event log and
  instrument map, shared with pre-pead-scanner.
- `skills/_shared/kb_cite.py` — KB citations and lookup.
- `data/assets/pead-framework-sureshkbn.md` — SureshKBN's consolidated PEAD playbook and tweet citations.

Conventions: `skills/_shared/conventions.md` — §3 (db.js only), §5/§18 (DTO first, PDF only), §8
(`contextUsed`), §9 (files touched), §11 (token note), §17 (script = arithmetic, model = judgment), §24
(no LLM API keys; self-reported tokens), §26 (platform reuse), §28 (newest KB view wins), §29 (always
show the Δ).

---

## 1. The Pre-Earnings Price Action & Accumulation Engine (The Onward Tech Playbook)

Pre-earnings price action is a **dual-edged sword**. It provides both an **Informed Accumulation Signal**
and the baseline for the **Expectation Hurdle (Suresh Gate 3)**:

### The Onward Tech Case Study (`NSE:ONWARDTEC`)

Leading into its Q2 result:

- **Base Phase (Sessions -20 to -6):** Tight price consolidation (₹280–295) on dormant volume (20k–40k shares/day) with high delivery percentage (60–75%).
- **Accumulation Breakout (Sessions -5 to -1):** Volume explodes **10.7x** over the 20-day median (jumping from 25k to 117k, 308k, and peaking at 772k shares on session -2 — a **28.6x single-day volume surge**).
- **Price Surge:** The stock rallies **+23.5% in 10 days** and **+20.9% in 5 days** (₹288 → ₹359) right into result day.
- **Institutional Footprint:** ₹19.6 Cr of delivery turnover absorbed in 5 trading days (1.56 lakh shares delivered on 12-Oct, 2.32 lakh shares delivered on 14-Oct).

### The Dual-Signal Interpretation:

1. **Signal 1 — Informed Smart-Money Accumulation:**
   When delivery volume explodes alongside a price breakout into multi-month highs prior to results, institutional and informed positioning is anticipating strong operational delivery, high execution, or a blowout print.
2. **Signal 2 — The SureshKBN Warning / Gate 3 (The Expectation Hurdle):**
   Suresh warns: _"Did it move before results? If yes, expectations were built... If many enter on anticipation, it is never PEAD. Pre-result entrants build a base that sells on results. Most sustained PEADs had no prior run-up."_
   - When a stock surges +20% to +30% into results, the market has **already discounted** a strong quarter.
   - An "in-line" or good base-case result will trigger **"sell the news"** profit booking as pre-result buyers exit.
   - To trigger and sustain a genuine PEAD drift from this elevated baseline, the company faces a **very high hurdle**: it requires a **Bull-Case Blowout (PAT > Bull scenario)** PLUS a **forward guidance upgrade or major order-book trigger on the concall (Gate 4 & 5)**.
3. **The Asymmetric Springboard Setup (The Opposite Setup):**
   - When a company consolidates tightly in a flat base with low volume, high delivery absorption, and light positioning:
   - Expectations are low. Any genuine operational beat shocks the market, positioning is clean, and the PEAD runway is wide and sustained.

### Hurdle & Setup Matrix:

| Pre-Result Price & Volume Pattern                  | Expectation Hurdle | Sell-The-News Risk | Result Required for PEAD Drift                                    |
| -------------------------------------------------- | ------------------ | ------------------ | ----------------------------------------------------------------- |
| **MASSIVE_RUN_UP** (Return10D ≥15%, Vol ≥2.5x)     | **VERY_HIGH**      | **HIGH**           | **BULL_CASE_BLOWOUT + GUIDANCE_RAISE** (Base case gets sold)      |
| **INFORMED_BREAKOUT** (Return10D 7–15%, Vol ≥1.8x) | **ELEVATED**       | **MODERATE**       | **BASE_BEAT_WITH_MARGIN_EXPANSION**                               |
| **TIGHT_BASE** (Return10D ±5%, Deliv ≥50%)         | **LOW**            | **LOW**            | **BASE_CASE_BEAT** (Asymmetric springboard; prime PEAD candidate) |
| **DE_RISKING** (Return10D ≤−7%)                    | **VERY_LOW**       | **LOW**            | **BASE_CASE_MEET_OR_BEAT** (Relief rally / squeeze)               |
| **NEUTRAL_RANGE**                                  | **MODERATE**       | **MODERATE**       | **BASE_CASE_BEAT + CONCALL_CONFIRMATION**                         |

---

## 2. SureshKBN's 5 PEAD Gates (The Pre-Flight Scorecard)

Every prediction evaluated in Step 2 audits the company against Suresh's 5 Gates:

- **Gate 1 — Surprise / Shock vs Expectations:**
  Judge against market expectations, whisper numbers, and forward guidance — not optical YoY % off a low base. Best setup: low expectations + low valuation + shock beat.
- **Gate 2 — Result Quality & Repeatability:**
  Separate operating EBITDA from exceptional items, asset sales, forex, tax credits, and treasury income. Run the **EPS dilution check** (if shares rose, did core PAT beat dilution?). Verify working capital and operating leverage.
- **Gate 3 — Priced-In & Valuation Headroom:**
  Pre-result price action (the Onward Tech check above). Compare Forward P/E (at current market cap based on Base/Bull FY EPS) vs 1Y, 3Y, and 5Y median P/E. Suresh's rule: filter for **≥40–50% upside on paper** when forward guidance is delivered.
- **Gate 4 — Concall Guidance & Credibility:**
  Forward guidance beats the trailing quarter. Audit management's walk-the-talk track record across prior concalls. Watch confidence trajectory ("we target" vs "we hope/aspire").
- **Gate 5 — Pipeline of Post-Result Catalysts:**
  Fresh order wins, capex commercialisation (plants going live), debt prepayment, export market expansion. Suresh rule: **without fresh Gate 5 triggers, most PEAD moves fade in 2–3 weeks**.

---

## 3. Workflow

```
1 gather (script) ─▶ 2 reason (model: assumptions.json + narrative.json) ─▶ 3 project (script)
        ▲                          │                                              │ flags
        └──── re-run with --force  └──────────── 4 self-audit (fix / explain) ◀───┘
5 save DTO + PDF (script) ─▶ data:push ─▶ files touched ─▶ token note        6 score (script, later)
```

Use one run id per company and date. All run files live in `data/runs/`:
`pead-predictor_<EXCH_SYMBOL>-<asOf>_{inputs,assumptions,narrative,projection}.json`.

### 1. Gather (script, no LLM)

```bash
# scheduled job? first: export STOCKMARKET_JOB_NAME=<job-dir>   (conventions §23)
yarn pead-predictor:gather --company NSE:ONWARDTEC [--extra-tickers MCX:NICKEL1!] [--force]
```

One bundle assembling:

- **Price Action & Volume-Delivery Footprint** (`priceAction`): 5D, 10D, 20D returns; 5D volume multiplier vs 20D median; delivery multiplier & %; 5D delivery turnover in ₹ Cr; accumulation pattern classification; expectation hurdle & sell-the-news risk.
- **Actuals**: 12 quarters / ~7 FYs / TTM / baselines (company-financials, 24h cache).
- **Implied share count & dilution steps**.
- **Stockscans guidance tables**, plus up to 4 prior concalls' guidance for walk-the-talk.
- **Transcript keyword windows** from latest concall.
- **Filings since last quarter end**, classified (KNOWN at concall vs NEW since) with cached PDF text for material items.
- **Order-book ledger** and monthly business updates.
- **TradingView macro basket** and shared quarterly macro context.
- **Result-quality scan** of latest reported quarter (`resultScan`).
- **Prior analyses**: latest quarterly-result, rerating-catalysts, credibility DTOs.
- **History pack** (`historyPack`, when `quarterly-result-extractor --mode pre` has run): verified
  prior-call digests — tone/topic arc, one-off recurrence (>= 2 of 4 = recurrent), known
  catalysts, prior-guidance ledger with measurability. Prefer it over re-reading old transcripts;
  the gather helpers are shared with it (`packages/jobs-runtime/lib/resultHistory/inputs.js`).

### 2. Reason (model; Mission-Critical — follow `references/reasoning_playbook.md` exactly)

Read the inputs JSON. Do not open PDFs already excerpted. Work through:

- **A. Guidance read + credibility haircut:** Firm / conditional / aspirational / relative. Reconcile EBITDA definition with Stockscans' `operating_profit`. Walk-the-talk verdict. Sandbag vs stretch.
- **B. Dot-connect:** Map every non-routine filing into a quantified P&L lever.
- **C. Macro overlay:** Pass-through lag, commodity basket moves, rate/FX impact.
- **D. Phasing + one-off cleaning:** Clean the base with quoted sources (`baseCleaning`).
- **E. Pre-Earnings Price Action & Expectation Hurdle (Suresh Gate 3):** Read `inputs.priceAction`. Characterize accumulation vs priced-in expectations. Determine the required beat hurdle for drift.
- **F. SureshKBN 5-Gate PEAD Pre-Flight Scorecard:** Synthesize Gates 1 through 5 in `narrative.pead`.

Write `assumptions.json` and `narrative.json` per `references/assumptions_schema.md`.

### 3. Project (script, no LLM)

```bash
yarn pead-predictor:project --inputs <inputs.json> --assumptions <assumptions.json> --out <projection.json>
```

Produces:

- Bear / base / bull for target quarter and FY.
- Reported and core (one-offs stripped) QoQ, YoY, FYoFY.
- Lever attribution, inputs ledger, leverage profile (operating/financial/combined), guidance ladder.
- Assumption share and sanity flags.

### 4. Self-audit (mandatory — "what could be wrong with this?")

Resolve every engine flag. Check:

1. Source spot-check: quote-verify each guided and filing number.
2. EBITDA definition reconciliation.
3. Pre-result run-up vs scenario placement: if run-up is >15%, ensure the headline explicitly notes the sell-the-news risk on base case.
4. Valuation headroom: forward P/E vs 1Y/3Y median P/E.
5. Calibration check: `yarn pead-predictor:score --summary`.

### 5. Save + render (script) → push

```bash
yarn pead-predictor:save --inputs <inputs.json> --projection <projection.json> \
  --narrative <narrative.json> --model <exact model id>
yarn data:push
```

- **Report:** DTO `type: pead-prediction` → `reports.json` + body. Deterministic ID.
- **PDF:** `data/assets/pead-predictor/<EXCH_SYMBOL>_<Qtr>_pead_prediction.pdf`.

### Reply to the user (do not echo the PDF — Rule 11)

1. **Headline:** One line summary.
2. **Pre-Earnings Price Action & Expectation Bar:** Pattern (e.g. Onward Tech-style accumulation), 10D return, volume surge multiplier, delivery turnover, and the Expectation Hurdle (Suresh Gate 3).
3. **Table:** Base-case target quarter and FY (Revenue / EBITDA / PAT / EPS with QoQ, YoY, FYoFY and Bear–Bull ranges).
4. **PEAD Drift Hurdle:** What result is required on result day to trigger drift vs risk of sell-the-news.
5. **Key Levers & Dots Connected:** The 3–5 filings that moved numbers.
6. **Link:** Clickable link to generated PDF artifact.
7. **Files touched & Token note** (§9, §11).

### 6. Score (script, later — closes the calibration loop)

```bash
yarn pead-predictor:score --all-open [--force]   # after results land; weekly in results season
yarn pead-predictor:score --summary              # calibration: median |error|, % inside bear-bull
```

---

## Data written (DATA_RULES)

| What                                                        | Where                                                     | How                    |
| ----------------------------------------------------------- | --------------------------------------------------------- | ---------------------- |
| Inputs / assumptions / narrative / projection / render HTML | `data/runs/pead-predictor_*`                              | plain files            |
| Prediction DTO                                              | `reports.json` + `reports/` body, `type: pead-prediction` | `db.saveReport`        |
| Score                                                       | `validation.json`, `type: pead-prediction-score`          | `db.appendValidations` |
| PDF                                                         | `data/assets/pead-predictor/`                             | `save_prediction.js`   |
| Shared macro log section                                    | `skills/_shared/macro/quarterly-macro-context.md`         | agent edit             |

## Files

```
pead-predictor/
├── SKILL.md
├── references/
│   ├── reasoning_playbook.md   (Step 2 — A/B/C/D/E/F, SureshKBN 5 Gates, KB-cited)
│   └── assumptions_schema.md   (assumptions.json + narrative.json contracts)
└── scripts/
    ├── gather_inputs.js        (Step 1 — NSE price/delivery + Stockscans)
    ├── project_pl.py           (Step 3 — Deterministic P&L engine)
    ├── save_prediction.js      (Step 5 — DTO + PDF rendering)
    ├── score_prediction.js     (Step 6 — Post-result scoring)
    ├── test_project_pl.py
    └── test_scripts.test.js
```
