# StockScans Screener Recipes & Screening Funnels

These recipes originate from SOIC masterclasses:

- _Class 7: Screening Non-Linear Businesses (04.10.26 / 06.10.26)_
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

---

## 6. Early Stage 2 & Young Momentum Scan (SOIC Class 7 · @00:58:45)

Filters for stocks transitioning from base accumulation into young Stage 2 momentum, where growth is newly accelerating and price is NOT elongated.

### StockScans / Screener Recipe:

```text
Close >= WEMA(Close, 30) AND
WEMA(Close, 30) > WEMA(Close, 30, 1) AND
Close <= 1.30 * Low 52W + 0.20 * (High 52W - Low 52W) AND
Sales Growth Latest Quarter YoY (%) > 15.0 AND
Sales Growth Preceding Quarter YoY (%) > 15.0 AND
Net Profit Growth Latest Quarter YoY (%) > 20.0 AND
Market Capitalization (Cr) >= 500.0
```

### Analytical Intent:

- **30-WEMA upward curl:** Captures early Stage 2 breakout rather than extended Stage 3 distribution.
- **Not elongated:** Price is close to its base, avoiding chasing stocks that have already multiplied.
- **Consecutive sales growth (>15% for 2 quarters):** Confirms top-line rate of change is structural.
- **Case Reference:** _Rolex Rings_ (@00:59:29) — stagnant growth (~10%) for 3–4 years suddenly inflecting with mid-teens/20% forward guidance and a ₹180 Cr share buyback.

---

## 7. StockBee 4% Momentum Scan ("Movers and Shakers") (SOIC Class 7 · @00:58:04)

A daily tactical screen to catch the early institutional accumulation footprint ("shock value" in volume and price).

### StockScans Filter Query:

```text
Returns 1D (%) >= 4.0 AND
Volume >= 2.0 * SMA(Volume, 50) AND
Close >= 50.0 AND
Market Capitalization (Cr) >= 300.0
```

### Analytical Intent:

- Spotting the first session where a stock breaks out of a multi-week consolidation on heavy institutional volume.
- Feed survivors into `/rerating-catalysts` Phase 2.5 to match with recent corporate announcements or concall guidance shifts.

---

## 8. 3-Week Volatility Contraction Pattern (VCP) (SOIC Class 7 · @01:02:37)

Captures tight price coiling near 52-week highs where selling pressure has dried up, creating an asymmetric setup before Stage 2 expansion.

### StockScans Filter Query:

```text
Close >= 0.85 * High 52W AND
High 1W - Low 1W < High 2W - Low 2W AND
High 2W - Low 2W < High 3W - Low 3W AND
Volume <= SMA(Volume, 20) AND
Market Capitalization (Cr) >= 500.0
```

### Analytical Intent:

- Identifies Mark Minervini / Weinstein style base consolidation right before a catalyst pushes the stock into the Super Performance Zone.

---

## 9. Super Growth 50 (CANSLIM Earnings Acceleration) (SOIC Class 7 · @01:03:23)

A high-hurdle growth filter inspired by CANSLIM, filtering the entire Indian stock universe down to ~40–50 high-velocity candidates.

### StockScans Filter Query:

```text
Net Profit Growth Latest Quarter YoY (%) >= 25.0 AND
Net Profit Growth Preceding Quarter YoY (%) >= 20.0 AND
Sales Growth Latest Quarter YoY (%) >= 15.0 AND
Return on Equity (%) >= 15.0 AND
Market Capitalization (Cr) >= 500.0
```

### Analytical Intent:

- Identifies true earnings leaders where quarterly EPS growth is accelerating and capital efficiency (ROE $\ge 15\%$) is verified.

---

## 10. Structural Deleveraging & Margin Expansion Scan (SOIC Class 7 · @01:02:37)

Hunts for silent compounding machines where operating leverage (fixed overhead absorption) combines with debt retirement to generate non-linear PAT jumps.

### StockScans Filter Query:

```text
Debt to Equity Ratio < Debt to Equity Ratio Preceding Year AND
Debt to Equity Ratio <= 0.8 AND
Operating Profit Margin Latest Quarter (%) > Operating Profit Margin Preceding Year Same Quarter (%) + 1.5 AND
Net Profit Growth Latest Quarter YoY (%) >= 20.0 AND
Interest Coverage Ratio >= 3.0
```

### Analytical Intent:

- Mathematically validates Dr. Anil Lamba's Combined Leverage formula: sales growth + margin expansion + reduced finance costs driving explosive bottom-line accretion.
