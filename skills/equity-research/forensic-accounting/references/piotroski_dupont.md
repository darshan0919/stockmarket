# Piotroski F-Score & DuPont Analysis

Two quantitative checks bundled with every forensic run. Both can be computed mechanically from financial data — no narrative judgement required for the score itself, only for the interpretation.

---

## Piotroski F-Score

A 9-point quality score originally designed to separate value traps from genuine bargains. Higher = better. Score of **7+ = strong**; **3 or below = weak**. Track changes quarter-to-quarter; deterioration shows up here BEFORE it shows in the stock price.

### The 9 components

Compute each as 0 or 1 based on the rule. Total = sum.

**Profitability (4 points)**
1. **Positive net income** — PAT > 0 (FY current)
2. **Positive ROA** — Net income / Total assets (FY current) > 0
3. **Positive operating cash flow** — CFO > 0 (FY current)
4. **CFO > Net income** — Earnings quality check; CFO/PAT > 1

**Leverage & Liquidity (3 points)**
5. **Long-term debt ratio declined** — LTD/Total assets FY current < FY prior
6. **Current ratio improved** — CA/CL FY current > FY prior
7. **No new shares issued** — Diluted shares outstanding FY current ≤ FY prior

**Operating efficiency (2 points)**
8. **Gross margin improved** — Gross margin FY current > FY prior
9. **Asset turnover improved** — Revenue/Total assets FY current > FY prior

### Output table format

```
| # | Component                       | Metric              | FY24    | FY23    | Score |
|---|---------------------------------|---------------------|---------|---------|-------|
| 1 | Positive net income             | PAT                 | 234 Cr  | 198 Cr  | 1     |
| 2 | Positive ROA                    | PAT/TA              | 12.4%   | 11.1%   | 1     |
| 3 | Positive CFO                    | Operating CF        | 287 Cr  | 215 Cr  | 1     |
| 4 | CFO > PAT (accruals)            | CFO − PAT           | +53 Cr  | +17 Cr  | 1     |
| 5 | Lower LTD/Assets                | LT debt / TA        | 18.2%   | 21.3%   | 1     |
| 6 | Higher current ratio            | CA / CL             | 1.62    | 1.48    | 1     |
| 7 | No new shares issued            | Diluted shares (Cr) | 5.21    | 5.21    | 1     |
| 8 | Higher gross margin             | GM%                 | 34.5%   | 32.8%   | 1     |
| 9 | Higher asset turnover           | Rev / TA            | 0.91    | 0.86    | 1     |
|   | **TOTAL**                       |                     |         |         | **9** |
```

### Interpretation guidance

- **8–9:** Exceptionally strong fundamentals. Cross-check this isn't a one-year fluke (cyclical peak).
- **6–7:** Good quality. The standard zone for compounders.
- **4–5:** Average. Watch for which components are weak and whether they're trending.
- **0–3:** Weak. Often correlates with value traps. Cross-reference with the forensic checklist — low Piotroski + RED forensic flags = SELL.

**What can be wrong with this analysis:**
- Year-end window dressing (paying down debt at year-end) can inflate score 5 (LTD ratio); check 4-quarter trend if available.
- Accounting changes (revenue recognition shift, depreciation policy change) can mechanically tick scores 8 or 9 without operational improvement.
- A score of 9 doesn't override RED on RPTs or auditor changes. Piotroski measures financial quality, not governance.

### Prompt-form (for embedding in another skill)

> You are an equity analyst. Calculate the Piotroski F-Score for [Company] using the FY[current] and FY[prior] consolidated financials. The 9 components are: (1) Positive net income, (2) Positive ROA, (3) Positive operating cash flow, (4) CFO > Net Income (accruals check), (5) Lower long-term debt ratio vs prior year, (6) Higher current ratio vs prior year, (7) No new shares issued, (8) Higher gross margin vs prior year, (9) Higher asset turnover vs prior year. Present as a table: Component | Metric | FY[current] Value | FY[prior] Value | Score (0 or 1). Provide the total and a one-paragraph interpretation that flags which components are weakest and whether the trend is improving or deteriorating.

---

## DuPont Analysis

Decomposes ROE into three drivers to show *why* the ROE is what it is.

```
ROE = Net Profit Margin × Asset Turnover × Equity Multiplier
    = (PAT / Revenue) × (Revenue / Total Assets) × (Total Assets / Equity)
```

### Why it matters

Two companies can have identical 20% ROE for very different reasons:

- **High margins:** NPM 25%, AT 0.6, EM 1.3 → a quality business with pricing power (e.g., Asian Paints)
- **High leverage:** NPM 8%, AT 0.5, EM 5.0 → a leveraged play (e.g., a bank or NBFC)
- **High asset turnover:** NPM 5%, AT 3.0, EM 1.3 → a working-capital-light distribution business

The forensic implication: ROE driven by the equity multiplier alone is *risky* ROE. ROE driven by margin expansion or asset-turnover improvement is *quality* ROE.

### Output table format

```
| Year | ROE   | NPM   | AT    | EM    | Driver of change            |
|------|-------|-------|-------|-------|------------------------------|
| FY21 | 18.2% | 11.0% | 0.85  | 1.95  | base                         |
| FY22 | 19.4% | 11.8% | 0.86  | 1.91  | NPM-led                      |
| FY23 | 22.1% | 12.5% | 0.91  | 1.94  | NPM + AT (highest quality)   |
| FY24 | 24.8% | 12.7% | 0.95  | 2.05  | AT + slight EM creep         |
| FY25 | 27.3% | 12.4% | 0.94  | 2.34  | EM-driven (warning)          |
```

The interpretation section should answer **four questions**:
1. What is driving the ROE today?
2. Has the driver changed materially over 5 years?
3. Is the current driver sustainable, or is it artificially inflated by debt?
4. How does the company's NPM/AT/EM compare to listed peers in the same sector?

### Prompt-form

> You are an expert financial analyst. Decompose [Company]'s ROE for FY21 to FY25 using DuPont Analysis (ROE = Net Profit Margin × Asset Turnover × Equity Multiplier). Present as a table: Year | ROE | NPM | AT | EM | Driver of change. Then explain in one paragraph: (1) what is driving the current ROE; (2) whether the driver has shifted over 5 years; (3) whether the trajectory is sustainable or leverage-fuelled; (4) how the NPM/AT/EM stack compares to industry peers in the same sector. Be honest about red flags — if EM is rising while NPM is flat, say so.

---

## Integration with §1 forensic checklist

A LOW Piotroski (≤3) automatically adds a YELLOW row to the §1 checklist; a Piotroski ≤2 adds a RED.

A DuPont showing ROE ↑ purely from EM ↑ (with NPM and AT flat or declining) automatically adds a YELLOW row labelled "ROE quality — leverage-fuelled".

These bonus rows are visible on the §1 checklist with the source `Piotroski / DuPont`.
