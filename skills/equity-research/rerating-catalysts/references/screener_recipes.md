# StockScans Screener Recipes & Screening Funnels

These recipes originate from SOIC masterclasses:

- _13.09.26 Masterclass on Screening — Spotting "J Curves"_
- _12.07.26 Identifying Growth Catalysts with StockScans_
- _08.03.26 Find J-Curve Exploding Stocks_

They serve as **Stage 0 / Candidate Generation tools** for identifying potential re-rating candidates before escalating them to the `/rerating-catalysts` deep-dive analysis.

> ⚠️ **Important Boundary Rule:** Passing a screener recipe is **never** equivalent to a `STRONG` J-Curve Inflection tag. A screen generates candidate names based on trailing numbers; the `/rerating-catalysts` skill must verify the causal "new" trigger, audit for fake J-curves, and evaluate what is already in the price.

---

## 1. The Capstone "Potential J Curve" Screen

This screen captures businesses transitioning from investment/dip phases into explosive earnings acceleration, confirming operating leverage before consensus revisions catch up.

### StockScans Filter Query:

```text
Net Profit Growth Latest Quarter YoY (%) > 30.0 AND
Sales Growth Latest Quarter YoY (%) > 15.0 AND
Operating Profit Margin Latest Quarter (%) >= Operating Profit Margin Preceding Year Same Quarter (%) AND
Market Capitalization (Cr) >= 500.0 AND
Debt to Equity Ratio <= 1.5
```

### Analytical Intent:

1. **PAT Growth > 30% YoY:** Passes the mechanical threshold of hyper-growth (Bucket 3).
2. **Sales Growth > 15% YoY:** Ensures top-line demand backing; filters out pure cost-cutting illusion.
3. **OPM Expansion:** Proves fixed cost absorption / operating leverage ($\Delta \text{PAT} > \Delta \text{EBITDA} > \Delta \text{Sales}$).
4. **Solvency Guard:** Avoids distressed balance sheets that cannot fund working capital ramps.

---

## 2. Turnaround & Breakout Earnings Screen

Captures early Stage 1 $\to$ Stage 2 inflections where a business crosses from cash burn / losses into sustained profitability (e.g. new-age tech, CDMO gestation, plant ramp).

### StockScans Filter Query:

```text
Net Profit Latest Quarter (Cr) > 0.0 AND
Net Profit Preceding Year Same Quarter (Cr) <= 0.0 AND
Sales Growth Latest Quarter YoY (%) > 20.0 AND
Operating Profit Margin Latest Quarter (%) > 5.0
```

### Verification Checklist:

- Confirm the turnaround is operational (core gross margin positive), not tax credit or one-off asset sale.
- Check operating cash flow (CFO) trajectory alongside PAT breakeven.

---

## 3. Consistent Margin & Product Mix Shift Screen

Hunts for quiet margin expansion driven by value-added products, backward integration, or debottlenecking even when top-line growth appears moderate.

### StockScans Filter Query:

```text
Operating Profit Margin Latest Quarter (%) > Operating Profit Margin Preceding Year Same Quarter (%) + 2.0 AND
Operating Profit Margin Preceding Quarter (%) > Operating Profit Margin Preceding Year Same Quarter (%) AND
Sales Growth Latest Quarter YoY (%) > 10.0 AND
Return on Capital Employed (%) > 15.0
```

### Analytical Intent:

- Filters for companies engineering structural mix shift (e.g., auto ancillaries shifting from domestic ICE to global EV/aerospace; pharma moving from APIs to formulations).

---

## 4. Volume Rocketing & Delivery-Backed Accumulation

Detects institutional accumulation ("smart money") ahead of public disclosure or following high-signal filings.

### StockScans Filter Query:

```text
Volume >= 2.5 * SMA(Volume, 5) AND
Returns 1D (%) >= 2.5 AND
Market Capitalization (Cr) >= 300.0 AND
Delivery as % of Traded Volume >= 40.0
```

### Analytical Intent:

- Coincides with Stan Weinstein Stage 2 breakouts and Train B/C catalyst confirmation.
- Feed survivors into `/rerating-catalysts` Phase 2.5 (Price-Volume Spike Days ladder) to identify the causal "why".

---

## 5. Order Book Step-Change & Corporate Action Monitor

Monitors capital goods, defence, EPC, and railway companies where order inflow precedes revenue recognition by 2–6 quarters.

### Screening Strategy:

- Scan BSE/NSE corporate announcements for:
  - `Order Book / Letter of Award` where order value $\ge 0.3 \times$ TTM Revenue.
  - `Scheme of Arrangement / Demerger` shedding loss-making drag.
  - `Preferential Issue / Convertible Warrants` to promoters locking in current market price.
