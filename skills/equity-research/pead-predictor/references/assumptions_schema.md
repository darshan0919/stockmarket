# pead-predictor — `assumptions.json` and `narrative.json` contracts

`project_pl.py` validates `assumptions.json` and refuses to run (`status: invalid_assumptions`) when any
input lacks a `source` or uses an unknown `basis`. Every number must be traceable.

## Basis vocabulary (the "clearly state every assumption" rule)

| basis        | Meaning                                                                                   | Example                               |
| ------------ | ----------------------------------------------------------------------------------------- | ------------------------------------- |
| `guided`     | Management's own number for that period, quoted                                           | "FY27 EBITDA margin 27-28%"           |
| `actual`     | A reported figure / run-rate from `actuals` or a result filing                            | interest run-rate 1 cr/qtr            |
| `filing`     | Taken from an exchange filing since the last result (date + URL in `source`)              | ₹100 cr plant live Aug-26             |
| `derived`    | Arithmetic on guided/actual/filing inputs, method stated                                  | core other income = 33 − 24.2 one-off |
| `macro`      | From the macro overlay (instrument move × stated pass-through)                            | Brent +24%/3M × 1-qtr lag → −40 bp    |
| `heuristic`  | An expert or historical rule applied for lack of guidance (cite `kb:` or the SOIC lesson) | industry × 1.35 outperformance        |
| `assumption` | A judgment call with no direct support; say why and the sensitivity                       | H2 consumer segment flat              |

`heuristic` and `assumption` inputs are counted in `assumptionShare` and surfaced in the report. They must
also appear in `narrative.assumptions` with a sensitivity.

## assumptions.json

```json
{
  "companyId": "NSE:X",
  "targetQuarter": "Q2FY27", // must equal inputs.period.target (next unreported quarter)
  "sharesCr": {
    "value": 3.225,
    "basis": "filing",
    "source": "paid-up capital after 2026-09-03 ESOP allotment"
  },
  "baseCleaning": [
    // one-offs to strip from comparators / YTD (optional)
    {
      "quarter": "Q1FY27",
      "line": "pat|ebitda|revenue|eps",
      "reported": 74,
      "normalised": 50.25,
      "reason": "₹24.17 cr gain on sale of old facility",
      "basis": "actual",
      "source": "concall CFO remarks"
    }
    // quarter may also be a FY label ("FY26") to clean the FYoFY comparator
  ],
  "scenarios": {
    "base": {
      "revenue": {
        "fy_abs_cr": 1138, // OR "fy_growth_pct": 19.2  (FY total incl. YTD actuals)
        "target_q_yoy_pct": 20.7, // OR "target_q_cr" | "target_q_qoq_pct"; omit -> phased from FY by seasonality
        "rest_weights": { "Q3": 0.484, "Q4": 0.516 }, // optional split of the rest of the FY (default: own seasonality)
        "basis": "heuristic",
        "source": "industry 19.5% x 1.35 outperformance ..."
      },
      "ebitda_margin": {
        "target_q_pct": 28.3,
        "rest_q_pct": 28.0,
        "basis": "derived",
        "source": "..."
      },
      // OR "fy_pct": 28 -> post-target quarters solved so the FY margin lands there
      "other_income": { "q_cr": 7, "rest_q_cr": 7, "basis": "derived", "source": "..." },
      "depreciation": { "q_cr": 14, "basis": "actual", "source": "..." },
      "interest": { "q_cr": 1, "basis": "actual", "source": "..." },
      "tax_rate": { "pct": 25, "basis": "actual", "source": "..." },
      "exceptional": { "q_cr": 0, "basis": "assumption", "source": "none expected" }, // optional
      "levers": [
        {
          "name": "Plant X live 1-Aug",
          "line": "revenue",
          "q_delta_cr": 6,
          "rest_delta_cr": 30,
          "basis": "filing",
          "source": "2026-08-04 filing <url>; 35% util x 2 months",
          "kb": ["fdb27c81"]
        },
        {
          "name": "Plant X D&A",
          "line": "depreciation",
          "q_delta_cr": 0.8,
          "rest_delta_cr": 2.5,
          "basis": "filing",
          "source": "..."
        },
        {
          "name": "₹200 cr prepaid 15-Sep",
          "line": "interest",
          "q_delta_cr": -0.7,
          "rest_delta_cr": -9.0,
          "basis": "filing",
          "source": "..."
        },
        {
          "name": "RM lag",
          "line": "ebitda_margin_bps",
          "q_bps": -40,
          "rest_bps": -20,
          "basis": "macro",
          "source": "..."
        },
        {
          "name": "QIP 10-Sep",
          "line": "shares_cr",
          "delta_cr": 0.4,
          "basis": "filing",
          "source": "..."
        },
        {
          "name": "Plant in guide",
          "line": "revenue",
          "q_delta_cr": 5,
          "embedded": true,
          "basis": "guided",
          "source": "..."
        }
      ],
      "pat_override": {
        "q_cr": 40,
        "fy_cr": 150,
        "basis": "derived",
        "source": "AUM x NIM - credit cost (banks/NBFCs)"
      }
    },
    "bear": {
      "revenue": {
        "target_q_yoy_pct": 14.3,
        "fy_abs_cr": 1092,
        "basis": "heuristic",
        "source": "..."
      }
    },
    "bull": { "...": "only the drivers that change; everything else inherits from base" }
  }
}
```

Lever lines:

- **Money:** `revenue | ebitda | other_income | depreciation | interest | exceptional`, with
  `q_delta_cr` (target quarter) and `rest_delta_cr` (sum over the remaining quarters of the FY).
- **Margin:** `ebitda_margin_bps` with `q_bps` and `rest_bps`.
- **Tax:** `tax_rate_pp` with `q_pp` and `rest_pp`.
- **Shares:** `shares_cr` with `delta_cr`.

A `revenue` lever earns the scenario margin automatically. Add an `ebitda` lever only for the
_incremental-margin premium_ or a cost item. `embedded: true` levers are reported, not added.

## narrative.json (agent judgment, rendered verbatim into the PDF)

```json
{
  "headline": "Q2FY27 base: revenue ₹292 cr (+21% YoY), PAT ₹55 cr (+29% YoY, +10% QoQ core) — growth from industry tailwind, margin held by RM pass-through; FY27 core PAT +24%",
  "scenarioLogic": "Bear = outperformance 1.0x + RM lag one more quarter (−130 bp); bull = 1.65x + recoveries land in Q2.",
  "credibility": {
    "verdict": "high|medium|low",
    "summary": "27 straight quarters of outperformance; margin guide beaten 4/4 quarters (sandbag) -> guide used as floor"
  },
  "guidanceRead": [
    {
      "item": "FY27 EBITDA margin",
      "quote": "maintain in 27%-28% range",
      "period": "FY27",
      "type": "firm|conditional|aspirational|relative",
      "usedAs": "anchor|floor|ceiling|context|ignored",
      "why": "..."
    }
  ],
  "dotConnect": [
    {
      "date": "2026-10-07",
      "status": "NEW|KNOWN",
      "filing": "Bengaluru +20% capacity, production Q3FY27",
      "pnlEffect": "no Q2 revenue; D&A +0.6 cr/qtr from Q3",
      "inModelAs": "lever: Bangalore D&A | embedded | not modelled — <why>"
    }
  ],
  "macro": [
    {
      "input": "Brent",
      "move": "+24% / 3M, >$100 since 10-Sep",
      "channel": "polymer RM, 1-2 qtr lag",
      "impact": "-30 bp base, -130 bp bear",
      "inModelAs": "base margin / bear margin"
    }
  ],
  "baseQuality": [
    {
      "quarter": "Q1FY27",
      "item": "₹24.2 cr asset-sale gain in other income",
      "treatment": "stripped -> core PAT 50.3"
    }
  ],
  "assumptions": [
    {
      "assumption": "Outperformance multiple 1.35x",
      "basis": "heuristic",
      "why": "guide 1.5-2x taken a notch conservative (SOIC modelling)",
      "sensitivity": "±0.1x ≈ ±₹3.6 cr revenue, ±₹0.8 cr PAT"
    }
  ],
  "watch": ["Gross margin vs 56.7% (RM recovery)", "Decoplast new-plant utilisation commentary"],
  "pead": {
    "gate1Surprise": "Target base PAT ₹55 cr (+29% YoY) vs whisper ₹50 cr. Blowout print needs PAT ≥ ₹61 cr (bull).",
    "gate2Quality": "Clean operating expansion: RM tailwind + ESOP dilution accounted for. Core EPS +24%.",
    "gate3PricedIn": "Stock in MASSIVE_PRE_RESULT_ACCUMULATION_RUN_UP (+23.5% 10D, 10.7x vol). High hurdle: base case faces sell-the-news; needs bull-case beat + guidance raise.",
    "gate4Guidance": "Management has beaten guidance 4/4 quarters. Concall needs FY27 margin guidance raise to ≥28.5%.",
    "gate5PostResultTriggers": "Bengaluru facility commissioning in Q3FY27 is the secondary trigger needed to extend drift beyond 30 days.",
    "summary": "High pre-result accumulation raises hurdle. Base case will likely face profit-booking; drift requires Bull-case print (PAT ≥ ₹61 cr) + concall guidance upgrade."
  },
  "expertCitations": [
    "kb:fdb27c81 new plant 30-40% utilisation in quarter 1",
    "SOIC Learnyst 01.02.26 Part 2 Financial Modelling"
  ],
  "webSources": [{ "label": "SIAM via Autocar Pro — July 2026 sales", "url": "https://..." }],
  "contextUsed": ["<ids from inputs.context.availableIds actually read>"]
}
```
