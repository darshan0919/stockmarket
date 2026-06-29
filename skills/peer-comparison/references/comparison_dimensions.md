# Peer Comparison Dimensions — Extraction Detail

Full data-extraction list for each of the 4 mandatory dimensions plus the optional 5th. For each dimension below: what to extract per company, where to find it, and what to flag.

---

## Dimension 1 — Demand, Order Book, Book-to-Bill

This dimension answers: "Is demand strong / softening, and does each company have sufficient committed business to grow?"

### Per-company extraction

| Metric | Where | Notes |
|---|---|---|
| TTM Revenue (Rs Cr) | Latest result + Q-1, Q-2, Q-3 | Sum of last 4 quarterly revenues; cross-check vs Screener |
| Order Book (Rs Cr) | Latest investor presentation | Often a dedicated slide; sometimes only in concall commentary |
| Order Book / TTM Revenue | Calculated | Book-to-bill ratio. >1 = revenue visibility for next 12+ months |
| Order Book YoY growth | IP series | Direction matters more than absolute number |
| Capacity Utilisation % | IP / concall | If undisclosed, mark — for service businesses, use revenue per employee or related KPI |
| Demand commentary | Concall | One-line tone: "robust", "steady", "softening", "challenged" |
| Pricing trend | Concall | "Improving" / "stable" / "deteriorating"; relevant when commodity pass-through is a factor |
| New customer wins | Latest 2 concalls + announcements | Quantify if possible (Rs Cr value, named customer) |

### Side-by-side table format

```
| Metric                | Company A    | Company B    | Company C    |
|-----------------------|--------------|--------------|--------------|
| TTM Revenue (Rs Cr)   | 5,432        | 8,210        | 3,140        |
| Order Book (Rs Cr)    | 7,800        | 12,300       | 2,800        |
| Book-to-Bill          | 1.44         | 1.50         | 0.89         |
| Order Book YoY        | +18%         | +25%         | -8%          |
| Capacity Util %       | 78%          | 82%          | 65%          |
| Demand commentary     | Robust       | Robust       | Soft         |
| New customer wins (FY) | NTPC, ABB    | Reliance Jio | none material|
```

### What to flag
- Book-to-bill <1: warning sign — revenue visibility is short
- Order book declining YoY: red flag — pipeline is weakening
- Demand commentary divergence vs peers: investigate (either alpha or asymmetric risk)
- Capacity util >90%: pricing power likely; if no capacity addition planned, growth is constrained
- Capacity util <60%: operating de-leverage risk on margins

### Winner declaration
Best on this dimension = company with highest book-to-bill AND positive YoY order book growth AND ≥75% capacity utilisation.

---

## Dimension 2 — Forward Earnings Projections from Management Commentary

This dimension answers: "What is each management actually expecting / committing to over the next 1-3 years?"

### Per-company extraction

| Metric | Where | Notes |
|---|---|---|
| Revenue guidance FY+1 | Latest concall | Pull verbatim quote |
| Revenue guidance FY+2 | If given | Many managements only give 1 year out |
| EBITDA margin guidance | Latest concall | Range usually; pull both bounds |
| Capex plan (Rs Cr) | Concall + IP | Multi-year — calendar by year |
| Confidence level | Latest concall | HIGH/MEDIUM/LOW per language analysis |
| Analyst consensus FY+1 EPS | MoneyControl / Trendlyne | Bloomberg/IBES if available |
| Analyst consensus FY+2 EPS | Same | |
| Implied 2-year forward EPS CAGR | Calculated | (FY+2 EPS / FY-1 EPS)^0.5 - 1 |
| Analyst consensus revision in last 90d | News/MC | Up/Down/Stable |

### Side-by-side table format

```
| Metric                       | Company A     | Company B     | Company C     |
|------------------------------|---------------|---------------|---------------|
| Revenue gd FY27              | 18-22%        | 15%           | 8-10%         |
| EBITDA margin gd FY27        | 14-16%        | 18-20%        | 11%           |
| Capex FY26-FY28 (Rs Cr)      | 1,200         | 2,500         | 400           |
| Mgmt confidence              | HIGH          | MEDIUM        | LOW (vague)   |
| Consensus FY26 EPS (Rs)      | 12.4          | 8.7           | 4.5           |
| Consensus FY27 EPS (Rs)      | 16.8          | 10.5          | 5.0           |
| Implied EPS CAGR (2Y)        | 28%           | 18%           | 5%            |
| Revisions last 90d           | Up            | Stable        | Down          |
```

### What to flag
- Wide divergence between management guidance and consensus: investigate whose number is more reliable based on prior credibility (cross-reference `management-credibility-tracker`)
- Consensus revisions trending Down despite guidance maintained: street is signalling lower confidence than management
- Confidence LOW + ambitious guidance: management overpromising risk

### Winner declaration
Best on this dimension = company with highest consensus EPS CAGR AND HIGH management confidence AND positive consensus revisions.

---

## Dimension 3 — Cash Flow & Balance Sheet Health

This dimension answers: "Which company can fund its growth from internal accruals and which is leveraged / cash-strapped?"

### Per-company extraction

| Metric | Where | Notes |
|---|---|---|
| 3Y avg CFO/PAT | AR cash flow statements (3 years) | Quality of earnings; threshold per conventions §7 |
| 3Y avg CFO/EBITDA | Same | Tighter test of cash conversion |
| Net debt (Rs Cr) | Latest BS | Borrowings − Cash & investments |
| Net debt / EBITDA | Calculated | <2x healthy; >3x stretched |
| Debt/Equity | Latest BS | Per conventions §7 thresholds |
| DSO (days) | AR — receivables note | Trend over 3 years more useful than absolute |
| Inventory days | AR — inventory note | Same |
| Cash Conversion Cycle | DSO + Inv − Payable | Compare to peers in same business model |
| Contingent liabilities / Net worth | AR note | >10% RED |
| Promoter pledge % | BSE filings / Screener | >30% RED |
| Capital raised in last 3 years | AR + announcements | Equity issuance / debt growth |

### Side-by-side table format

```
| Metric                       | Company A    | Company B    | Company C    |
|------------------------------|--------------|--------------|--------------|
| 3Y CFO/PAT                   | 0.92         | 0.78         | 0.41         |
| Net debt (Rs Cr)             | 450          | -1,200 (net cash) | 2,800   |
| Net debt / EBITDA            | 1.1x         | --           | 4.2x         |
| Debt/Equity                  | 0.32         | 0.05         | 1.45         |
| DSO drift (3Y)               | +3 days      | -5 days      | +18 days     |
| Inventory days drift (3Y)    | +5 days      | flat         | +12 days     |
| Contingent liab / NW         | 2%           | 1%           | 14%          |
| Promoter pledge %            | 0%           | 0%           | 38%          |
| Net equity raised (3Y)       | 0            | 0            | Rs 800 Cr    |
```

### What to flag
- CFO/PAT < 0.5 (3Y average) → RED
- Net debt/EBITDA > 3x → RED
- Promoter pledge >30% with high D/E → "lethal combination" per Day 1 p.61
- Multiple equity raises without revenue growth → dilution without execution
- DSO drift +10d and inventory drift +20d simultaneously → working capital deterioration

### Winner declaration
Best on this dimension = company with CFO/PAT >0.85 AND Net debt/EBITDA <2x AND no concerning DSO/inventory drift.

---

## Dimension 4 — Valuation (Relative)

This dimension answers: "At current price, which company offers the best risk/reward?"

### Per-company extraction (live, from Screener.in / Stockscans)

| Metric | Source | Notes |
|---|---|---|
| Live CMP | Screener.in / NSE | Date the snapshot |
| Market Cap (Rs Cr) | Screener.in | |
| TTM P/E | Screener.in | Don't calculate from quarterly PAT |
| Forward P/E (FY+1) | TTM P/E × (TTM EPS / Forward EPS) | Or pull from consensus directly |
| EV/EBITDA | Screener.in | |
| P/B | Screener.in | |
| 5Y P/E median | Screener.in (history chart) | |
| 5Y P/E percentile (where current is) | Calculated | <30th = cheap; >70th = expensive |
| Forward EPS CAGR (Dim 2) | Re-use | |
| PEG (forward P/E / EPS CAGR) | Calculated | <1 = attractive; >2 = expensive |
| 1-Y stock price performance | NSE / Screener | Context for entry timing |

### Side-by-side table format

```
| Metric              | Company A | Company B | Company C |
|---------------------|-----------|-----------|-----------|
| CMP (Rs)            | 285       | 645       | 110       |
| Market Cap (Rs Cr)  | 12,500    | 38,200    | 4,800     |
| TTM P/E             | 18x       | 35x       | 22x       |
| Forward P/E         | 14x       | 28x       | 18x       |
| EV/EBITDA           | 11x       | 22x       | 9x        |
| P/B                 | 2.3       | 6.8       | 1.6       |
| 5Y P/E median       | 16x       | 32x       | 20x       |
| 5Y P/E percentile   | 65th      | 60th      | 55th      |
| EPS CAGR (forward)  | 28%       | 18%       | 5%        |
| PEG                 | 0.50      | 1.56      | 3.60      |
| 1Y price perf       | +24%      | +12%      | -8%       |
```

### What to flag
- P/E percentile >75th: at expensive end of historical range; needs to deliver to justify
- PEG >2: growth doesn't justify multiple
- PEG <0.7 + HIGH credibility + HIGH management guidance + BS health: setup
- 1Y outperformance + multiple expansion: re-rating already done; less upside
- 1Y underperformance + multiple compression + stable fundamentals: contrarian setup

### Winner declaration
Best on this dimension = company with PEG <1 AND P/E in 30-60th percentile of 5Y range AND fundamentals consistent (Dim 2-3 healthy).

---

## Dimension 5 (optional) — Management Credibility Overlay

If `management-credibility-tracker` has been run for each company first, layer in those scores.

```
| Metric                  | Company A | Company B | Company C |
|-------------------------|-----------|-----------|-----------|
| Credibility score       | +3        | +1        | -2        |
| Beat rate (%)           | 80%       | 60%       | 30%       |
| Most-credible metric    | Margins   | Revenue   | None      |
| Most-missed metric      | Capacity  | Margins   | All       |
| Case-study match        | Navin     | Mayur     | Hikal     |
```

### Why this dimension matters

A company with mid-tier metrics but +3 credibility (Mayur/Navin pattern) is often a better investment than a company with great current metrics and -2 credibility (Hikal pattern). Credibility informs how to weight the forward guidance from Dimension 2.

The final verdict should explicitly state how credibility breaks ties between otherwise-similar companies.

---

## Final synthesis (cross-cutting)

After scoring all seven dimensions, write the final verdict in this structure:

> **Best business:** [Company X] — strongest on [Dimensions 1+2+3+7] driven by [evidence].
>
> **Most attractively priced:** [Company Y] — at [P/E percentile / PEG] vs peer median.
>
> **Smart money signal:** [Company Z] — FII/DII accumulation pattern from Dimension 6 supports / contradicts the valuation thesis.
>
> **Solvency comfort:** [Company A] — most resilient on liquidity / solvency; [Company C] warrants a leverage watch.
>
> **Are these the same?** [YES — easy call] / [NO — relative value setup].
>
> **Preferred pick:** [Company Z, weighted X% / Y%] — the relative attractiveness reflects [thesis logic].
>
> **Key catalyst (12 months):** [what closes the gap — capacity commissioning, FY+1 results print, regulatory clearance]
>
> **Biggest risk to the thesis:** [what could invert the comparison — demand shock, balance sheet deterioration, management change, institutional exit]

---

## Dimension 6 — Shareholding Trends & Verdict

This dimension answers: "Are informed / institutional investors accumulating or exiting, and is promoter conviction rising or falling?"

### Data source

Fetch the last 5 quarters of shareholding data from Screener.in:
`https://www.screener.in/company/<SYMBOL>/` → Shareholding section

Cross-verify promoter pledge from BSE filings or Screener pledge field.

### Per-company extraction

| Metric | Where | Notes |
|---|---|---|
| Promoter holding % (Q-4 → Q0) | Screener.in shareholding tab | 5-quarter trend |
| Promoter pledge % (Q-4 → Q0) | Screener.in / BSE filings | Rising pledge = RED |
| FII holding % (Q-4 → Q0) | Screener.in | 5-quarter trend |
| DII holding % (Q-4 → Q0) | Screener.in | 5-quarter trend |
| Retail / Public % (Q-4 → Q0) | Screener.in | Residual |
| FII trend verdict | Calculated | Accumulating (+) / Distributing (-) / Stable (=) based on ≥1% move over 4Q |
| DII trend verdict | Calculated | Same threshold |
| Promoter trend verdict | Calculated | Creep (+) / Reduction (-) / Stable (=) |
| Notable bulk/block deals | BSE announcements | Named institutional buyer/seller is strong signal |

### Side-by-side table format

```
| Metric                   | Company A      | Company B      | Company C      |
|--------------------------|----------------|----------------|----------------|
| Promoter (latest) %      | 52.4%          | 68.1%          | 45.0%          |
| Promoter 4Q change       | +0.3%          | 0.0%           | -2.1%          |
| Promoter pledge %        | 0%             | 0%             | 18%            |
| FII (latest) %           | 14.2%          | 8.5%           | 9.8%           |
| FII 4Q change            | +3.1%          | -0.5%          | -4.2%          |
| FII verdict              | Accumulating   | Stable         | Distributing   |
| DII (latest) %           | 18.7%          | 12.3%          | 11.4%          |
| DII 4Q change            | +1.5%          | +2.0%          | -1.8%          |
| DII verdict              | Accumulating   | Accumulating   | Distributing   |
| Retail %                 | 14.7%          | 11.1%          | 33.8%          |
| Notable deals            | Mirae added    | HDFC MF added  | FII exit noted |
```

### What to flag
- Promoter holding decline >3% in 4 quarters without disclosed reason: governance concern
- Promoter pledge >30%: cross-check with D/E (Dimension 3 red flag compound)
- Both FII AND DII distributing simultaneously: market is de-rating the stock — investigate why
- FII accumulating while DII distributing (or vice versa): divergent institutional view — call out which class is likely better informed in this context
- Rising retail % replacing institutional exits: "passing the baton" pattern — high risk
- Promoter creep at <2% promoter holding increase per quarter: positive but low conviction signal

### Winner declaration
Best on this dimension = company with Promoter stable/rising AND no pledge AND FII or DII accumulating AND no "baton pass" retail increase.

### Shareholding Verdict sentence (mandatory)
Always close with one sentence like: "FII and DII are both accumulating in Company A, suggesting institutional conviction; Company C shows the opposite pattern with both categories distributing over 4 quarters — a red flag for the thesis."

---

## Dimension 7 — Solvency & Liquidity Ratios

This dimension answers: "Can each company meet short-term obligations and service its long-term debt without stress?"

### Data source

Extract from **latest quarterly result** (Balance Sheet + P&L):
- Fetch via `stock-documents-fetcher` if not already in context: `-t Result --last-n 1`
- Prefer the standalone quarterly BS if disclosed; if only annual is available, use latest AR + any adjustments from the quarterly P&L commentary

### Ratios to calculate — definitions

| Ratio | Formula | Healthy threshold |
|---|---|---|
| Current Ratio | Current Assets ÷ Current Liabilities | ≥1.5 comfortable; <1.0 red |
| Quick Ratio | (Current Assets − Inventories − Prepaid) ÷ Current Liabilities | ≥1.0 healthy |
| Cash Ratio | (Cash + Cash Equivalents) ÷ Current Liabilities | ≥0.2; context-dependent |
| Interest Coverage Ratio (ICR) | EBIT (TTM) ÷ Interest Expense (TTM) | ≥3x healthy; <1.5x red |
| Debt Service Coverage (DSCR) | (EBITDA − Taxes) ÷ (Interest + Scheduled Principal) | ≥1.25x minimum; ≥1.75x comfortable |
| Net Debt / Equity | (Total Borrowings − Cash) ÷ Total Equity | <0.5x conservative; >1.5x stretched |
| Debt / EBITDA | Total Debt ÷ TTM EBITDA | <2x fine; >4x stretched |

### Calculation notes
- Use **TTM EBITDA and EBIT** (last 4 quarters), not single-quarter annualised
- Principal repayments: if not separately disclosed, use the change in long-term borrowings (opening − closing) from the BS
- Cash equivalents: include liquid mutual fund investments and short-term FDs (typically in "Short-term investments" or "Other current assets" note)
- For FMCG / asset-light companies, Current Ratio is less meaningful than ICR/DSCR — weight accordingly
- For capital-goods / infra companies, all seven ratios matter equally

### Side-by-side table format

```
| Ratio                  | Company A  | Company B       | Company C  | Threshold  |
|------------------------|------------|-----------------|------------|------------|
| Current Ratio          | 2.1        | 3.4             | 0.9        | ≥1.5       |
| Quick Ratio            | 1.4        | 2.8             | 0.6        | ≥1.0       |
| Cash Ratio             | 0.4        | 1.1             | 0.1        | ≥0.2       |
| ICR (TTM)              | 6.2x       | Net cash        | 1.8x       | ≥3x        |
| DSCR                   | 2.1x       | N/A             | 1.1x       | ≥1.25x     |
| Net Debt / Equity      | 0.22       | -0.45 (net cash)| 1.62       | <0.5x      |
| Debt / EBITDA          | 1.1x       | 0.0             | 4.8x       | <2x        |
```

### What to flag
- Current Ratio <1.0: company may need to roll short-term debt to pay current obligations — liquidity risk
- ICR <1.5x: earnings do not comfortably service interest — solvency stress
- DSCR <1.0x: debt service exceeds cash generation — watch for refinancing risk or covenant breach
- Rapidly declining Current or Quick Ratio QoQ (e.g., from 2.5 → 1.2 in two quarters): early warning of working capital squeeze
- All three (Current, Quick, Cash) simultaneously below threshold: acute liquidity risk

### Winner declaration
Best on this dimension = company with Current Ratio ≥1.5 AND Quick Ratio ≥1.0 AND ICR ≥3x AND DSCR ≥1.5x AND Net Debt / Equity <0.5.

### Calculation transparency (mandatory)
For every ratio, show the numerator and denominator figures used and cite the exact filing period (e.g., "Q3 FY26 balance sheet"). If a ratio cannot be calculated due to missing data (e.g., no quarterly BS disclosed), say so explicitly rather than leaving the cell blank.

