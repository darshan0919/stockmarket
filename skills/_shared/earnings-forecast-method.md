# Earnings forecast method — next-quarter & FY Revenue / EBITDA / PAT / EPS

**Shared reference** (moved here 2026-10-14 from `pre-pead-scanner/references/forward_estimation.md`, which
is now a pointer). Used by `pre-pead-scanner` (Step 5, surprise input) and `pead-predictor` (the whole
skill, formerly `growth-predictor`). The arithmetic of the bridge below is scripted in `pead-predictor/scripts/project_pl.py`; this
file is the _method_ — which inputs to choose and why. Turn extracted guidance + reported actuals into a
defensible estimate for the upcoming quarter; precision and honest tagging here propagate into every
downstream score or scenario. The discipline is to **show every step** and **tag every input** `[guided]`, `[actual]`, or `[estimate]`, so the reader can rebuild the number and challenge any assumption.

## The primary method: full-year minus year-to-date

When management has given full-year (FY) guidance _and_ the company has reported 9M (or whatever YTD) actuals, the upcoming quarter falls straight out:

```
Next-quarter estimate = FY guidance − YTD actual
```

Apply it to each line:

- **Revenue:** `Q4 Rev = FY Rev guidance − 9M Rev actual`
- **PAT:** `Q4 PAT = FY PAT guidance − 9M PAT actual`

Carry ranges through. If FY revenue guidance is ₹5,700–5,800 Cr and 9M actual is ₹4,069 Cr, then Q4 ≈ ₹1,631–1,731 Cr. Report the band, not a false-precision point.

Always also state the **implied jump**: the sequential (vs last reported quarter) and YoY growth the estimate requires. This is what tells the reader whether the number is a lay-up or a stretch. Example: "Q4 PAT of ₹160–170 Cr implies 2.7× the ₹60 Cr reported in Q3 — credible only because the AC business is structurally Q4-loaded."

## The fallback method: run-rate × seasonality

When there's no usable FY figure (qualitative guidance, or a company that doesn't guide), extrapolate from the most recent quarterly run-rate, adjusted for:

1. **Stated seasonality** — if management said Q4 is the strong quarter, lift; if it's typically soft, trim. Use the company's _own_ prior-year quarterly split as the seasonality shape.
2. **New-capacity ramp** — if a line was commissioned and is ramping this quarter, add the incremental contribution at the stated utilisation, not nameplate.
3. **Order-book burn** — for EPC/book-to-bill names, the executable order book ÷ remaining quarters gives a billing-led revenue estimate, often more reliable than a growth-rate guess.

Flag fallback estimates as lower-confidence than full-year-minus-YTD ones.

## OPM (operating profit margin)

Take the guided EBITDA/OPM margin if given (a band like "13–14%" or "maintain current profile"). Otherwise use the trailing margin, adjusted for any stated direction (operating leverage from higher utilisation lifts margin; new-capacity depreciation/interest and start-up costs compress near-term margin).

```
Est. OPM = guided margin band, else trailing OPM ± stated direction
Est. operating profit = Est. Revenue × Est. OPM
```

Beware mix shift: a company guiding flat blended margin while a lower-margin segment (e.g. a recently acquired or trading business) grows faster will see blended margin drift down — model the _blend_, not the best segment.

## PAT bridge (when PAT isn't directly guided)

Build PAT down from operating profit:

```
EBITDA              = Revenue × OPM
− Depreciation       (trend from recent quarters; step up if new capacity commissioned)
− Interest / finance  (trend; rises with new debt-funded capex, falls with deleveraging)
+ Other income        (recurring only — exclude one-offs)
= PBT
− Tax                 (use the company's effective rate; do NOT extrapolate a quarter
                        that carried a one-off deferred-tax credit/charge)
= PAT
```

### Strip one-offs first

Reported PAT frequently contains items that won't repeat: deferred-tax assets/credits, forex gains/losses, one-time provisions, inventory write-downs, gratuity/labour-code catch-ups, exceptional items. **Clean the base quarter before projecting**, or the estimate inherits noise. State the cleaned figure ("Q3 reported PAT ₹75.7 Cr included a deferred-tax credit; cleaned ≈ ₹X Cr") so the next-quarter PAT is built on a like-for-like base.

## The two direct PAT levers — model them explicitly

Most PAT surprises are _not_ about guessing revenue better than the street. They come from two structural levers that flow almost arithmetically to the bottom line once the inputs are known — which makes them the **highest-confidence, most bankable** part of a surprise, and often the part the market misses because it's watching the topline. Model both as named lines in the bridge, not buried in "OPM ± direction", so the reader sees exactly where the PAT beat comes from and can challenge it.

### Lever 1 — Capex-live operating leverage (revenue side of the bridge)

When a capacity addition moves from _under construction_ to **commissioned and producing**, two things change at once: fixed costs (depreciation, some overheads) were already being incurred or step up modestly, while incremental revenue on that capacity drops through at a **high incremental margin** because the plant, people and overhead are already paid for. Utilisation climbing on an existing/newly-live line is the single cleanest operating-leverage signal.

Model it, don't hand-wave it:

```
Incremental revenue from capex-live = (new/《freed》 utilisation − base utilisation)
                                       × commissioned capacity × realisation
Incremental EBITDA                   = incremental revenue × INCREMENTAL margin
   where incremental margin >> blended OPM  (fixed costs already absorbed;
   commonly 1.5–2.5× the blended margin — use management's stated contribution
   margin if given, else a reasoned premium to blended OPM, flagged [estimate])
```

Then blend up: `Est. EBITDA = base-business EBITDA + incremental EBITDA from capex-live`. This is why a company can guide "flattish blended margin" and still beat on PAT — the incremental tonne/unit earns far more than the average one.

Guardrails (also the "what could be wrong"):

- **Only credit capacity that is live _this_ quarter.** A line commissioning next fiscal does nothing for the near-term PAT — a common and costly error.
- **Depreciation and interest step up when the asset capitalises** — the same commissioning that adds revenue also ends interest-capitalisation and starts book depreciation. Net the D&A/interest step-up against the incremental EBITDA, or you overstate PAT (see Lever 2).
- **Ramp is rarely instant.** Use the _stated_ utilisation for the quarter, not nameplate. A plant at 40% ramp doesn't deliver full-capacity leverage yet.
  - _Exception — Supply-Constrained Tech Infrastructure (The E2E Rule):_ For accelerated compute (e.g. Nvidia GPU clusters), cloud infrastructure, or pre-booked contracts with existing customer waitlists, there is zero demand-gestation lag. The moment assets move from CWIP into active Gross Block, billing begins immediately at 85–95%+ utilisation.

### The Three-Tier Input Confidence Hierarchy (Guaranteed vs Guided vs Assumed)

To maximize forecast precision and avoid treating all P&L lines as uniform guesses, stratify every quarterly forecast into three distinct confidence tiers:

1. **Tier 1: Guaranteed / Accounting Invariants (Zero-Variance Bounds)**:
   - **Depreciation & Amortization (D&A):** For capital-heavy businesses (datacenters, cloud infra, semiconductors, manufacturing), D&A is an accounting identity dictated by `Gross PPE + CWIP Capitalisation Schedule × Ind AS Useful Life SLM Rate`. In E2E Q2FY27, this arithmetic predicted ₹74.0 Cr vs ₹73.97 Cr actual (**-0.04% error**).
   - **Effective Corporate Tax Rate:** Under Section 115BAA, Indian corporate tax is 22% + 10% surcharge + 4% cess = 25.17% (25.14% deferred tax). Unless one-offs, MAT credits, or tax holidays exist, lock this at 25.14% (E2E predicted 25.15% vs 25.14% actual, **-0.01% error**).
   - **Contractual Borrowing Costs:** Existing debt outstanding × contractual interest rate (pro-rated for repayment/drawdown dates).
2. **Tier 2: Guided Anchors (Management Bounds / Walk-the-Talk Tested):**
   - Explicit management guidance floors from concalls (e.g. E2E's guided 75.2% sustainable EBITDA margin floor).
   - Filing-confirmed tariff or price revisions with proven customer retention.
3. **Tier 3: Assumed Levers (Scenario Sensitivity Space):**
   - Commercialisation timing (full 90-day vs partial-quarter billing days).
   - Operating leverage gearing on fixed SG&A and employee expenses.
   - This locks down 65–75% of the P&L structure as mathematical invariants, collapsing uncertainty into 1–2 key operating levers.

### Peer Anti-Thesis Forensic Stress-Testing (The CoreWeave Rule)

When forecasting a high-growth thematic or capital-intensive inflection name (AI cloud, renewables, battery storage, EMS), cross-examine the company against the **specific failure modes of global or domestic peers** in the same niche:

- _Anatomy of the Peer Trap (e.g. CoreWeave):_ Heavy asset-backed debt (Debt/Revenue >3.0x), interest eating >20% of revenue, and negative operating cash flow.
- _Target Company Rebuttal Audit:_ Check whether the subject company's balance sheet replicates or refutes the peer's failure mode.
- _Anti-"Balance Sheet Mirage" Counter-Check (Mandatory):_ Do not celebrate headline "Net Cash" or "CFO covers capex" naively. Perform a forensic balance-sheet deconstruction:
  1. Did debt surge over the period? (e.g. in E2E H1FY27, borrowings jumped +336% from ₹103 Cr to ₹450 Cr via ₹348.5 Cr fresh borrowing draws). If so, tag as `DEBT-FUNDED LIQUIDITY`.
  2. Did customer advances / unearned liabilities inflate CFO? (e.g. ₹129.8 Cr of E2E's ₹396.5 Cr CFO was customer advances in other current liabilities). If $>25\%$ of CFO, tag as `LIABILITY-DRIVEN CFO`.
  3. Is there an unexecuted dilution/fundraise overhang? (e.g. E2E's ₹1,500 Cr enabling resolution represents prospective 12–15% equity dilution or massive debt load).
- _Takeaway:_ A company can only be declared structurally safer if BOTH the peer debt-trap is refuted AND the internal balance sheet deconstruction proves that cash generation is organic, customer-diversified, and sustainable across Capital Cycles.

### Lever 2 — Balance-sheet deleverage (financing side of the bridge)

Debt reduction hits PAT **directly and predictably** through lower interest expense — it needs no operating assumption at all, which is what makes it high-confidence. Every rupee of interest saved is a rupee of pre-tax profit; after tax it's `× (1 − effective tax rate)`.

```
Interest saving (quarter) ≈ (debt repaid / average debt reduction over the quarter)
                             × effective interest rate ÷ 4
Δ PAT from deleverage     = interest saving × (1 − effective tax rate)
```

Sources for the inputs: net-debt trajectory and repayment schedule from the concall / investor PPT / balance sheet (extract in Step 3), the blended cost of debt (interest ÷ average borrowings from recent quarters), and the effective tax rate from the P&L. Where management has stated a debt-reduction target ("we'll cut net debt by ₹X Cr this year"), pro-rate it to the quarter and convert to an interest saving.

Guardrails:

- **Use average, not period-end, debt** for the interest saved in the quarter — debt repaid on the last day saved almost no interest this quarter.
- **Watch the offset:** deleverage funded by an equity raise reduces interest but raises the share count (dilutes EPS — feed the new count into the EPS step). Deleverage from strong operating cash flow is the cleanest, un-diluted version.
- **Capitalised → expensed interest** (from Lever 1) can _swamp_ a deleverage saving in the quarter a big asset goes live. Model both levers together and net them; don't count the deleverage tailwind while ignoring the capex interest step-up.
- **Rising-rate environments** can erode the saving on floating-rate debt even as the principal falls — check whether the cost of debt is moving.

### Putting the levers in the bridge

The two levers slot straight into the PAT bridge as explicit lines, so a PAT beat is _attributable_:

```
Base-business EBITDA
+ Incremental EBITDA from capex-live operating leverage   [Lever 1]
= Est. EBITDA
− Depreciation        (step up for the newly-capitalised asset)
− Interest / finance  (base − deleverage saving [Lever 2] + capex interest step-up)
+ Other income        (recurring only)
= PBT
− Tax                 (effective rate)
= PAT
```

State each lever's rupee contribution to PAT and tag it `[estimate]`, so the surprise (Step 5) can be decomposed into "how much of the beat is topline vs operating leverage vs interest saving". A beat resting on the two structural levers is more credible than one resting on a revenue guess — reflect that in the deliverability read.

## EPS

```
Est. EPS = Est. PAT (₹ Cr) × 1e7 ÷ shares outstanding
```

or, keeping units in crore: `EPS (₹) = PAT (₹ Cr) ÷ shares (crore)`.

Share-count gotchas — get this wrong and the EPS is wrong even with a perfect PAT:

- Use the **current** diluted share count, not a stale one. Pull `Equity Shares` from the scan row and **cross-check** against the trailing `EPS` field: `implied shares = TTM PAT ÷ EPS`. If they disagree materially, the company likely did a recent raise / split / bonus / buyback.
- **Recent equity raise / QIP / warrant conversion** inflates the count — use the post-issue number, or the EPS will look too high.
- **Buyback** reduces the count.
- **Bonus / split** changes the count without changing value — make sure the historical EPS you compare against is on the same adjusted basis.
- Prefer **consolidated** figures throughout (Indian analysts model consol); note if you've had to use standalone.

## Presentation rules

- Show the arithmetic inline: `Q4 Rev = 5,750 [guided FY] − 4,069 [9M actual] = 1,681 [estimate]`.
- Carry ranges; never invent precision the inputs don't support.
- Tag every input `[guided]` / `[actual]` / `[estimate]`.
- Always pair each estimate with its **implied growth** (sequential and YoY) so the reader sees the size of the ask.
- If a critical input is missing (no margin colour, unknown share count), say "not disclosed — estimated from [method]" rather than fabricating.

## Worked example (illustrative shape, not real numbers)

```
Company: ExampleCo  | FY26 guidance: Revenue ₹5,750 Cr [guided], PAT ₹300 Cr [guided]
9M FY26 actual:      Revenue ₹4,069 Cr [actual], PAT ₹131 Cr [actual]
Shares outstanding:  28.6 Cr [scan: Equity Shares; cross-checked vs trailing EPS]

Est. Q4 Revenue = 5,750 − 4,069 = ₹1,681 Cr [estimate]   (implied +19% YoY, +19% QoQ)
Est. Q4 OPM     = 11% [trailing, leverage-adjusted]
Est. Q4 PAT     = 300 − 131 = ₹169 Cr [estimate]          (implied 2.7× Q3 — Q4-seasonal)
Est. Q4 EPS     = 169 ÷ 28.6 = ₹5.9 [estimate]
What could be wrong: Q4 PAT leans entirely on the seasonal AC pre-load repeating;
                     a forex swing or channel give-back after a strong Q3 fill is the risk.
```

---

## SOIC modelling template — build every line, "roughly right, not precisely wrong"

Source: SOIC Learnyst _01.02.26 Part 2 Financial Modelling_ (live model of SJS Enterprises, Interarch,
Manorama, Gravita). The lesson's rules, in the order the model is built:

| Line                 | Default driver                                                                                                                                                            | When to override                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Revenue              | FY guidance − YTD actual; else latest quarter × the company's **own historical QoQ step into the target quarter** (SOIC: "Q4 is ~10% above Q3 every year, so I took 10%") | Capacity go-live, order-book burn, monthly business updates                                                   |
| Revenue, no guidance | **industry growth × the company's historical outperformance multiple**, taken a notch conservative (SOIC: auto industry 8% × 2.5, not the 3× history → 20%)               | State both inputs; tag `[heuristic]`                                                                          |
| EBITDA margin        | Guided band (take the lower-middle — SOIC took 29% of a 28-30% "maintain" guide); H2 margin if the business is H2-heavy                                                   | Macro input-cost shock, mix shift, new-plant start-up drag                                                    |
| Other income         | **Cash & investments × ~6-7% yield**, grown with FCF — conservative, never the latest spike                                                                               | One-off gains (sale of asset, MTM, interest on tax refund) are stripped from the base                         |
| Depreciation         | **Historical D&A as % of sales** (SOIC: 5.5-5.9% for SJS) while capex is maintenance-sized                                                                                | Big capex capitalising → step up: incremental gross block ÷ useful life (~20y plant, SOIC valuation lesson)   |
| Interest             | Run-rate per quarter                                                                                                                                                      | Debt repaid/raised (average, not period-end, debt × cost of debt ÷ 4); capitalised interest ending at go-live |
| Tax                  | Management's guided full-year ETR, else last FY effective rate                                                                                                            | SEZ/tax-holiday expiry, deferred-tax credits (strip)                                                          |
| EPS                  | PAT ÷ current (post-dilution) share count                                                                                                                                 | QIP/pref/warrant/ESOP allotments since the last result                                                        |

Cyclicals: do not model more than ~2 years out; track the commodity spread (spread contracts → margins follow).
Banks/NBFCs: Revenue (NII) ≈ AUM × NIM; PPOP − credit cost → PBT; rate cuts compress bank NIM, help fixed-rate NBFCs.

## Expert rules that bound the numbers (KB-cited; recency rule: newest view wins, conventions §28)

Citations are `kb:<suffix>` = the last 8 hex of a `knowledge-units` id (the same unit can sit under
several topic prefixes). Resolve to statement + date + source URL with
`yarn kb:cite <suffix> [<suffix> …]` (`skills/_shared/kb_cite.py`).

| Rule                                                                                                                                                                                     | Source                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| A newly commissioned plant runs ~30-40% utilisation for about one quarter; ~80% takes about two quarters; first ~30 days carry teething issues; capacity timelines often slip 2-3 months | Suresh kb:fdb27c81, kb:a1b1fc44, kb:c79fe9e1, kb:19d89eea |
| New-capex revenue realisation is 3-4 quarters away; only capex ready to commission can move the next quarter                                                                             | Suresh kb:20bb48ea, kb:e3d9a244                           |
| Do not annualise a temporary one-off margin benefit (e.g. a Q1 gross-margin/AC-season benefit)                                                                                           | Suresh kb:f95df422, kb:18ac2964                           |
| Strip non-operating PAT drivers: one-off gains, asset sales, forex, tax credits, interest-income spikes                                                                                  | Suresh kb:5b295eb1, kb:e346129b, kb:a6b5c1da              |
| Sales guidance tied to orders/capacity is credible; **PAT visioning is where most stories break**; most companies avoid bottom-line guidance                                             | Suresh kb:d0a47655, kb:bbfbff69, kb:b97be412              |
| Trust guidance only in line with what leadership delivered before; a missed last-concall number lowers expectations; first-concall guidance of a new listing gets extra scepticism       | Suresh kb:add4bc8e, kb:2d24e595, kb:c7bfdfc5, kb:7f7bbe72 |
| Read guidance carefully — conditional targets are not firm                                                                                                                               | Suresh kb:463cdb84                                        |
| When management gives no sales/margin guidance, assume from sector tailwind and TAM, starting from the concall                                                                           | Suresh kb:231ffab7, kb:2be898f1                           |
| EPS, not PAT, after any QIP/pref/warrant/ESOP: EPS growth must beat the dilution                                                                                                         | Suresh kb:28f8e391, kb:c4fdeb9f, kb:be7b2e07              |
| Debt cut → interest saving → PAT is near-arithmetic (e.g. ₹225 cr retired)                                                                                                               | Suresh kb:57b42f46                                        |
| Heavy project debt, depreciation and commissioning ramp can suppress PAT during the growth phase                                                                                         | Suresh kb:0aa97825                                        |
| Oil above ~$100 for weeks is a sustained margin headwind; the earnings hit slides 1-2 quarters                                                                                           | Suresh kb:1821fc75, kb:57ff95e8, kb:4b0ec780              |
| Copper/aluminium costs hit margins across many companies; RM and freight decide FY27-28 margins                                                                                          | Suresh kb:0fe5534a, kb:2ed4fce3                           |
| Rising volume with falling realisations caps margin expansion unless RM eases or pricing improves                                                                                        | Suresh kb:95645d7a                                        |
| Fixed-price contracts + rising RM squeeze margins; RM-to-product spread contraction precedes margin contraction                                                                          | SOIC kb:1b89c3ec, kb:3dbf984d                             |
| Rate cuts compress bank NIM; only fixed-rate-book NBFCs expand NIM                                                                                                                       | SOIC (ishmohit1) kb:59582635, kb:f7b27ca6                 |
| Delayed client inspections can push a quarter's dispatches (and margin) into the next quarter                                                                                            | Suresh kb:a5e2a8fc                                        |
| For lumpy businesses, judge 9M YoY, not a single QoQ                                                                                                                                     | Suresh kb:c5777d77                                        |
| Base projections on the long-run average EBITDA margin backed by guidance, not the latest quarter                                                                                        | SOIC kb:286f171f                                          |
| A margin far above peers / at a cyclical peak is a reason to haircut the forecast                                                                                                        | SOIC kb:554a1b9a, kb:dc6cd9fc                             |
| Forecast depreciation by spreading incremental capex over its useful life (~20y plant)                                                                                                   | SOIC kb:0b776336                                          |
| Build bull/base/bear around management's guided revenue and margin                                                                                                                       | SOIC kb:2946895a                                          |
| Do the maths before results but set no expectations; bucket bear/base/bull; predicting is not PEAD                                                                                       | Suresh kb:75dbc5b6, kb:3eded4e6, kb:a7621186              |
