# Phase 1 — Document Diff Framework

The goal of Phase 1 is to extract structured numeric and operational data from both quarterly presentations and produce a line-by-line diff across 9 dimensions. This is the forensic backbone of the entire workflow.

## Table of contents

1. P&L diff (headline)
2. Balance sheet & cash flow quality
3. Operational KPIs
4. Credit ratings & financing
5. Capacity & infrastructure
6. Orderbook & pipeline
7. Products & verticals
8. Macro / industry commentary
9. Management team & governance

Work through each dimension in sequence. Do not skip dimensions even if you think a deck has nothing to diff on them — the absence of information is itself a data point.

---

## Dimension 1 — P&L diff (headline)

Extract these line items from both decks for the most recent quarter and the cumulative period (9M or full year):

- Revenue from operations
- EBITDA (₹ Cr and %)
- PBT (₹ Cr and %)
- PAT (₹ Cr and %)
- EPS
- Tax rate
- Finance costs (₹ Cr and as % of revenue)
- Depreciation (₹ Cr)
- Other income

Build a table with these columns: Metric | Prior year (FY–1) actual | Interim period from prior deck (e.g., 9M) | Current quarter | Current full year | YoY change | Signal.

For the "Signal" column, use these chip tags consistently:
- `Beat` — outperformed the implied trajectory from the prior deck
- `In line` — matched the implied trajectory
- `Slight miss` — 0–5% below trajectory
- `Significant miss` — more than 5% below trajectory
- `Mix shift` — top-line looks different but driven by revenue composition

**Key forensic check:** Compute the quarter's own margin (not just cumulative). A company reporting 19.5% cumulative EBITDA margin may have run its final quarter at 18% — the margin trajectory is what matters for next year's model.

---

## Dimension 2 — Balance sheet & cash flow quality

Extract from both decks:

- Shareholders' funds / net worth
- Total borrowings
- Current liabilities
- Current assets
- Fixed assets + CWIP
- Cash & cash equivalents
- CFO (cash from operations)
- Capex / investing outflow
- Financing activity

Compute these ratios and diff vs prior year:

- **CFO / PAT ratio** — this is the single most important forensic metric. Healthy companies run 0.9x+. A drop below 0.7x is a yellow flag; below 0.5x is a red flag unless explained by identifiable timing.
- **Working capital days** (debtor + inventory − payable, in days of revenue)
- **Current liabilities growth vs revenue growth** — if CL grows faster than revenue, working capital is getting more intensive, not less.
- **Cash/quarterly revenue** — buffer indicator for EPCs and project businesses.

**Critical:** Many Indian decks only show H1 balance sheets in Q3 presentations. If the Q4 deck shows full-year balance sheet and the Q3 deck showed H1, the comparison must be H1 prior year vs full year current — flag this asymmetry explicitly.

**Red flags to explicitly hunt:**
- CFO/PAT dropping by >30% YoY without a disclosed reason
- Fixed asset additions that don't align with disclosed capex or capacity additions
- "Other liabilities" growing faster than revenue (often hides contract liabilities or customer advances)
- Receivables growth >> revenue growth (indicates stretched customers or disputed invoicing)

---

## Dimension 3 — Operational KPIs

For each business segment, extract:

- Commissioned capacity (cumulative)
- Projects / orders / plants under execution or construction
- O&M portfolio or recurring revenue base
- Employee / headcount
- Revenue per employee (compute)
- Realization per unit (₹/MWp, ₹/ton, ₹/bed, ₹/seat — whatever the physical unit is)

Build a diff table: KPI | Prior deck value | Current deck value | Delta | Reading.

**Look for asymmetric movements.** If commissioned capacity grew 20% but unexecuted backlog shrank 10%, the company is drawing down its pipeline faster than refilling it — this is often the first sign of a forward revenue cliff.

---

## Dimension 4 — Credit ratings & financing

Hunt for these in both decks:

- Company's own credit rating (and rating agency)
- Parent company's credit rating (if applicable)
- Any rating upgrades or downgrades since prior deck
- Disclosed debt facilities and their ratings
- "Watch with Developing Implications" or similar rating action flags

A parent credit rating upgrade is one of the most consistently under-priced positive catalysts for subsidiary companies — it lowers cost of capital across the group and is structural, not transitory. If you spot one, tag it `HIGH conviction` in the positive surprises section.

---

## Dimension 5 — Capacity & infrastructure

For manufacturing companies, EPCs, IPPs, and any physical-asset business:

- Installed capacity (by geography, by product, by technology vintage)
- Capacity under construction
- Capacity commissioned during the quarter
- Technology mix (e.g., PERC vs TOPCon vs HJT for solar cells)
- Geographic concentration

Parent-level capacity disclosures are frequently more material for investment decisions than the subsidiary's own numbers — always check if the subsidiary deck references parent capacity and whether it changed.

---

## Dimension 6 — Orderbook & pipeline

Extract both:

- **Unexecuted orderbook** (₹ Cr and physical units)
- **Bid pipeline** (if disclosed)
- **Order inflow during the quarter** (compute from change in orderbook + revenue recognized)
- **Orderbook-to-TTM-revenue coverage ratio** — this is the forward visibility metric
- **Hit ratio on bids** (rarely disclosed but occasionally inferrable)

**Key forensic calculation:** `Order inflow this year = closing orderbook − opening orderbook + revenue recognized this year`. If this number is declining YoY for a growth company, that is the single most important leading indicator in the deck. Every equity analyst covering growth businesses lives and dies by this calculation.

---

## Dimension 7 — Products & verticals

Create a checklist of all product/service verticals mentioned in the prior deck. Check each in the new deck:

- Is it still listed?
- Has any revenue/volume disclosure changed?
- Are new verticals added?
- Are any verticals de-emphasized (i.e., moved down the slide order)?

Deck slide order is signal. If a vertical moves from slide 5 to slide 18, management is quietly de-prioritizing it.

---

## Dimension 8 — Macro / industry commentary

Both decks typically include an "Industry Overview" section. Diff these:

- Have the TAM numbers been revised?
- Have growth rate projections moved?
- Have policy announcements been added or removed?
- Has the target year for a government capacity goal shifted (e.g., 280 GW by 2030 moving to 2032)?

Management rarely makes overt bullish or bearish calls — but the numbers they quote reveal their actual worldview. If a deck's projected addressable market shrinks between quarters, that is management signaling. If it grows aggressively, that is also signaling — often the setup for a capital raise or capex announcement.

---

## Dimension 9 — Management team & governance

Diff the management slides:

- New appointments (especially CFO, CEO, COO)
- Resignations (especially unexpected mid-cycle)
- Board composition changes (independent directors added/removed)
- Related party transactions disclosed
- Auditor changes
- Disclosed litigation or regulatory proceedings

A CFO change between Q3 and Q4 decks is always material and must be flagged RED, regardless of the stated reason.

---

## Output format for Phase 1

Produce an internal scratchpad (not shown to user) with the full diff. Then synthesize into the HTML widget sections:

1. P&L diff table (Dimension 1)
2. Balance sheet & cash flow card grid (Dimension 2)
3. Operational KPI table (Dimension 3)
4. Positive surprises ranked by materiality (pulling from Dimensions 4, 5, 8)
5. Negative surprises / flags (pulling from Dimensions 2, 6, 9)
6. New growth triggers (pulling from Dimensions 4, 5, 6, 8)
7. New products / verticals (Dimension 7)

The output is not narrative — it's an institutional datasheet. Narrative comes later, in the paragraphs after the widget.

## Quality self-check before moving to Phase 2

Before closing Phase 1, verify:

- [ ] Every line item in the P&L has been diffed between decks
- [ ] CFO/PAT ratio has been computed for both periods
- [ ] Orderbook delta has been reconciled with execution + new wins
- [ ] Every new vertical, capacity addition, or credit rating change has been extracted
- [ ] At least 3 positive and 3 negative observations are ready to rank
- [ ] No number in your output is a guess — every figure traces to a specific page in one of the decks

If any of these are missing, go back and reread the decks. Phase 2 depends on Phase 1 being tight.