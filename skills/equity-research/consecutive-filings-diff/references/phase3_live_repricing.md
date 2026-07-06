# Phase 3 — Live Repricing

Phase 3 converts the refreshed thesis from Phases 1 and 2 into a tradable conclusion at the live market price. This step is mandatory, not decorative. A re-rated stock is not the same investment as it was at the pre-news price — the margin-of-safety calculation changes the action framework.

## Step 1 — Pull live price from the right sources

**Screener.in's quoted price is frequently stale by days or weeks**, especially on concall days or around earnings. It caches prices. Do NOT rely on it as your single source for CMP.

Use this sourcing hierarchy (in order):

1. **dhan.co** — typically has live or near-live prices in the stock detail page. Look for the timestamp (e.g., "as on 17 Apr 2026 at 11:41"). If the timestamp is within the last 2 hours during market hours, use this.
2. **kotakneo.com** — similar live data, often updated every few minutes.
3. **tickertape.in** — useful secondary confirmation.
4. **Yahoo Finance** (`finance.yahoo.com/quote/<TICKER>.NS`) — good for historical and intraday but sometimes delays.
5. **NSE India / BSE India** — authoritative but often 403s on programmatic fetch. Works for direct URL verification.

**Cross-check at least two sources.** If screener.in says ₹965 and dhan.co shows ₹1,167 as of this morning, dhan.co is the live price and screener is stale. Never trust a single source for Phase 3 pricing.

Pull these fields:

- Current market price (with timestamp and source)
- Market cap (live, not stale)
- Today's open
- Day high / low / average price
- Volume vs 20-day average
- 50-day and 200-day moving averages (useful for the technical context)
- 52-week range

## Step 2 — Recompute TTM and forward multiples

With the live price and Phase 1's actual FY financials:

**TTM P/E**

```
TTM P/E = CMP × outstanding shares / TTM PAT
```

Compute outstanding shares from `Market Cap / CMP` (screener.in's market cap and price — when both are from the same timestamp — give a clean share count). Then apply the live price to get live market cap.

**Forward P/E for the current financial year (FY0)**

```
FY0 P/E = CMP × shares / FY0 estimated PAT
```

If the company just reported annual results, FY0 = the just-reported year and P/E is a re-expression of TTM. If the company is mid-year, FY0 PAT is a bottoms-up estimate from 9M actuals + Q4E.

**Forward P/E for FY+1**

```
FY+1 P/E = CMP × shares / FY+1 estimated PAT
```

FY+1 PAT is built from:
- Revenue estimate = orderbook coverage + new wins assumption + realization per unit
- EBITDA margin = latest deck's margin, adjusted for concall commentary (don't use the 15% floor if CFO said margins will keep improving)
- Below-EBITDA = actual latest D&A, interest, and effective tax rate
- Apply to share count (adjusted for any dilution events disclosed in filings)

Document every assumption. "FY+1 PAT ₹680 Cr" is a number; "FY+1 PAT ₹680 Cr assuming 3.0 GWp execution at ₹1.15 Cr/MWp at 19% EBITDA margin" is a thesis.

## Step 3 — Compare to framework fair value

Use the terminal value / framework multiples that have been established for the sector. If none has been established, consult the user or build one using these default anchors:

- **Solar EPC (India):** 22–26x FY+1 P/E in hypergrowth phase
- **Integrated solar OEM:** 22–25x FY+1 P/E
- **Pure module OEM:** 14–18x FY+1 P/E
- **Solar IPP (private):** 14–17x FY+1 EV/EBITDA
- **Solar IPP (PSU):** 12–14x FY+1 EV/EBITDA
- **IPP + EPC hybrid:** 18–22x FY+1 P/E
- **Auto OEM (diesel engine captive):** 18–24x FY+1 P/E
- **Defence manufacturing (India):** 35–50x FY+1 P/E for leaders, 22–30x for followers

These are sector anchors from the terminal value framework. Document the comparable set and the rationale for the chosen range.

Compute:

```
Discount (or premium) to fair FY+1 P/E = 1 − (current FY+1 P/E / framework fair FY+1 P/E mid)
```

Negative number = premium (stock is expensive). Positive number = discount (stock is cheap).

## Step 4 — Build the scenario ladder

Produce a 4-to-6-row scenario table with these rows:

| Scenario | FY+1 P/E | Target price | Upside/(Downside) from CMP |

Include:

- **Bear** — framework low multiple (e.g., 22x for solar EPC)
- **Base** — framework mid multiple (e.g., 24x)
- **Bull** — framework high multiple (e.g., 26x)
- **Stress** — compression to 18x or similar, reflecting a multiple de-rating
- **Severe/Collapse** — a specific wipeout scenario tied to the Phase 1 or Phase 2 red flag (e.g., "ASPL acquisition impairs ₹300 Cr, PAT drops to ₹570 Cr, multiple de-rates to 14x → target ₹770")

Compute the expected value:

```
EV = P(bear) × bear + P(base) × base + P(bull) × bull + P(stress) × stress + P(collapse) × collapse
```

Assign probabilities based on the Phase 1 and Phase 2 conviction. Typical distribution for a stock with no red flags: 50% base, 25% bear, 15% bull, 10% stress. For stocks with an unresolved red flag: 40% base, 25% bear, 10% bull, 15% stress, 10% collapse.

Document the probability weights and the reasoning.

## Step 5 — Build the action framework

Translate the EV calculation into an action recommendation:

- **EV > +35%:** Aggressive buy — build full position at CMP
- **EV +20% to +35%:** Moderate buy — half position at CMP, half on pullback
- **EV +10% to +20%:** Hold existing, new positions only on pullback
- **EV 0% to +10%:** Trim — fair value band
- **EV < 0%:** Reduce / avoid

The recommendation is not a price target. It's a position-sizing guide.

Layer in the catalyst timing:

- **Near-term catalysts (1–3 months):** Next quarterly results, pending regulatory decisions, known rating agency reviews
- **Medium-term (3–12 months):** Annual guidance, large order decisions, acquisition closings
- **Structural (>12 months):** Capacity commissioning, policy framework changes, parent-level re-rating

The action should be paired with a specific catalyst. "Hold through Q1 FY+1 results in late July" is a complete action. "Buy at CMP" is incomplete without a catalyst.

## Step 6 — Rank within the sector universe

If the user has been tracking a universe of comparable stocks, reprice the target stock's ranking:

- Before the results / concall / price move: where did it rank in the universe?
- After: where does it rank now?

A ranking shift is often more actionable than the absolute valuation change, because it reveals where the marginal alpha now sits.

## Common Phase 3 traps

1. **Using screener's stale price.** Check the timestamp. If screener shows a price from the last close but the stock is up 10% intraday, your whole repricing is wrong.
2. **Applying pre-results multiples to post-results earnings.** The framework fair FY+1 P/E is for normalized earnings. If the current quarter had a one-time benefit, the market will look through it.
3. **Forgetting dilution.** Preferential allotments, QIPs, warrant conversions all change share count. Check the latest filings for any capital-markets events between decks.
4. **Missing the re-rating window.** A stock that's been consolidating for 6 months and breaks above 200 DMA on earnings is getting a technical re-rating in addition to the fundamental one. The move is often larger than pure fundamentals suggest.
5. **Anchoring to cost basis.** The action framework is the same for a long-held position as for a new buyer — the question is always "given the live price and the updated thesis, what's the right action."

## Output format for Phase 3

The Phase 3 widget section should contain:

1. **Live snapshot** — 4 to 8 KPI cards with CMP, market cap, TTM P/E, FY+1 P/E, book value, P/BV, 52-week range, today's move
2. **Valuation repriced table** — prior estimates vs current, with deltas and readings
3. **Scenario ladder** — 4–6 scenarios with targets and upside/downside
4. **Updated sector ranking** — if applicable
5. **Action framework** — specific recommendation paired with a catalyst

The final verdict band (the 5–8 chip summary) synthesizes all three phases into a scannable conclusion.

## Quality self-check before rendering

- [ ] CMP is from a live source (<2 hours old during market hours)
- [ ] Market cap matches CMP × shares outstanding (sanity check)
- [ ] FY+1 PAT estimate has documented assumptions
- [ ] Framework fair multiples are sector-appropriate
- [ ] Expected value is computed with explicit probability weights
- [ ] Action recommendation is paired with a specific catalyst
- [ ] Sector ranking is updated if applicable

When all are checked, render the widget.