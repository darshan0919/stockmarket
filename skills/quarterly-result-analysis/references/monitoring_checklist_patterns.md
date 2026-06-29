# Investor Monitoring Checklist — Patterns & Examples

The forward checklist is the most actionable section of the briefing. A PM reads the note today; the checklist tells her exactly which data points to verify on each subsequent result day.

## The non-negotiable rule

Every item must be **falsifiable**: one specific KPI + one number threshold + one quarter horizon + one source. If any of those four is missing, the item is not a checklist item — it is a comment.

Bad: "Watch margins"
Bad: "Track capex execution"
Bad: "Monitor demand environment"

Good: `Gross margin ≥ 28% in Q1 FY27 (Result PDF, profitability section)`
Good: `Capex spent ≥ Rs 200 Cr by H2 FY26 (Quarterly cash flow statement)`
Good: `Channel inventory days < 35 by Q4 FY26 (Concall management commentary)`

## Required coverage

A complete checklist of 6 to 10 items must include at least one from each of these categories:

| # | Category | Why it must be there |
|---|---|---|
| 1 | Revenue / volume KPI | The top line is the broadest measure of demand vs management's guidance |
| 2 | Margin KPI | Mix shift and operating leverage manifest here |
| 3 | Cash flow / working capital KPI | Earnings quality lives in the cash conversion |
| 4 | Capital allocation KPI | Tests management's stated capex / acquisition plan |
| 5 | Stopped-discussing item | The Basket 2 §2B "what they stopped saying" — verify if it returns next quarter |
| 6 | Industry / external lead indicator | A non-company data point that predicts the next inflection |

If a particular category genuinely has nothing to monitor, state why — don't pad the list to 10.

## Standard template

The output table format (use exactly this in the widget):

| # | KPI | Threshold | Horizon | Source |
|---|---|---|---|---|
| 1 | <metric name> | <number + direction> | <Q + FY> | <document type + section> |
| 2 | ... | ... | ... | ... |

## Examples by sector

The taxonomy is industry-agnostic, but the *specific* KPIs vary. Below are example checklist items by sector — adapt to the company in hand.

### Capital goods / industrials

| KPI | Threshold pattern |
|---|---|
| Order book | ≥ N× annual revenue |
| Book-to-bill | ≥ 1.0× |
| Execution period | ≤ X months |
| Margin on new orders | ≥ Y% (often disclosed) |
| Capex commissioning | On-time vs slide schedule |

### FMCG / consumer

| KPI | Threshold pattern |
|---|---|
| Volume growth | ≥ X% YoY |
| Premium product mix | ≥ Y% of revenue |
| Counters / distribution reach | ≥ N lakh |
| Channel inventory days | ≤ X days |
| A&P as % of revenue | within management's stated band |

### Financials (banks, NBFCs)

| KPI | Threshold pattern |
|---|---|
| AUM / loan book growth | ≥ X% YoY |
| Net Interest Margin (NIM) | ≥ X% |
| Gross NPA / Net NPA | ≤ X% |
| Credit cost | ≤ X bps |
| C/I ratio | ≤ X% |
| Cost of funds | within Y bps of policy rate |

### IT services

| KPI | Threshold pattern |
|---|---|
| Constant-currency revenue growth | ≥ X% |
| EBIT margin | ≥ Y% |
| Deal TCV (large deal wins) | ≥ $N Bn |
| Attrition | ≤ Z% LTM |
| Headcount additions | tied to revenue growth |

### Pharma / chemicals / specialty

| KPI | Threshold pattern |
|---|---|
| US filings (ANDA / 505(b)(2)) | ≥ N |
| Approvals received | ≥ N |
| Capex on R&D / Revenue | within band |
| Customer concentration | ≤ X% |
| Plant inspection outcome | EIR / 483 / Warning |

### Infrastructure / EPC

| KPI | Threshold pattern |
|---|---|
| Order inflow | ≥ Rs X Cr/quarter |
| L1 position vs order book | ≥ Y% |
| Receivables days | ≤ X days |
| Mobilisation advance % | ≥ Y% of contract |
| Working capital cycle | ≤ X days |

### Renewables / clean energy

| KPI | Threshold pattern |
|---|---|
| Project pipeline | ≥ X MW / GW |
| PPA tariff (avg) | ≥ Rs Y/unit |
| Module / panel cost | within stated range |
| Capacity commissioned | vs slide deck schedule |
| Receivables from DISCOMs | ≤ X days |

## Pattern 1 — the "stopped saying" item

This is the most powerful checklist item in the entire framework. Format:

> Management mentioned **<topic>** in Q1, Q2, Q3 FY26 calls. **Silent on this in Q4 FY26.** Watch Q1 FY27 transcript for: (a) topic re-appearing with same/stronger language → bullish, (b) topic re-appearing with softer language → cautious, (c) continued silence → red flag.

Example:

> #6 — Exports / EU geography. Management discussed EU export ramp-up in Q1, Q2, Q3 FY26 with 18-22% targets. Silent in Q4 FY26 concall. Watch Q1 FY27 for return of EU references or quantified pull-back.

## Pattern 2 — the "guidance ladder" item

If management has provided multi-quarter guidance, build a ladder:

> #3 — Margin guidance ladder. FY26 guided 22%. H1 FY26 actual: 19.4%. Required H2 FY26: 24.1% to hit guidance. Watch H1 FY27 (Q1+Q2) for whether 22% lands or guidance is revised. The Q1 FY27 result is the first read.

## Pattern 3 — the "external lead indicator"

A non-company KPI that historically leads the company's numbers by 1-2 quarters:

> #7 — HRC steel price (Mumbai delivered) > Rs 60,000/MT for 6 weeks. This is the input cost that drives the company's gross margin with a 2-quarter lag. Track monthly via SteelMint or Bloomberg.

## Pattern 4 — the "policy / regulation" item

> #8 — BIS / safety certification for the new product line. Management guided H2 FY26 approval. Watch for press release or annual report disclosure of certification by FY26 end. Without certification, FY27 revenue guidance becomes unachievable.

## Pattern 5 — the "balance sheet inflection" item

> #4 — Net debt / EBITDA below 1.5×. Q4 FY26 actual: 2.1×. Management plan: deleveraging through CFO + asset sale. Watch H1 FY27 quarterly cash flow for net debt trajectory. Below 1.5× unlocks the dividend resumption.

## Final formatting in the widget

Render the checklist as a numbered table in the widget's "Monitoring Checklist" section. Keep each row to a single line where possible. Each `Source` cell should be specific enough that the next analyst (or future-you) knows exactly where to look in the next quarter's documents.

If the list runs over 10 items, drop the weakest — quality over quantity. A PM who tries to track 15 items tracks none.
