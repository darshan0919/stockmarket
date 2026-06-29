# Forward estimation — next-quarter Revenue / OPM / PAT / EPS

This is Step 5: turn extracted guidance + reported actuals into a defensible estimate for the upcoming quarter. The discipline is to **show every step** and **tag every input** `[guided]`, `[actual]`, or `[estimate]`, so the reader can rebuild the number and challenge any assumption.

## The primary method: full-year minus year-to-date

When management has given full-year (FY) guidance *and* the company has reported 9M (or whatever YTD) actuals, the upcoming quarter falls straight out:

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
1. **Stated seasonality** — if management said Q4 is the strong quarter, lift; if it's typically soft, trim. Use the company's *own* prior-year quarterly split as the seasonality shape.
2. **New-capacity ramp** — if a line was commissioned and is ramping this quarter, add the incremental contribution at the stated utilisation, not nameplate.
3. **Order-book burn** — for EPC/book-to-bill names, the executable order book ÷ remaining quarters gives a billing-led revenue estimate, often more reliable than a growth-rate guess.

Flag fallback estimates as lower-confidence than full-year-minus-YTD ones.

## OPM (operating profit margin)

Take the guided EBITDA/OPM margin if given (a band like "13–14%" or "maintain current profile"). Otherwise use the trailing margin, adjusted for any stated direction (operating leverage from higher utilisation lifts margin; new-capacity depreciation/interest and start-up costs compress near-term margin).

```
Est. OPM = guided margin band, else trailing OPM ± stated direction
Est. operating profit = Est. Revenue × Est. OPM
```

Beware mix shift: a company guiding flat blended margin while a lower-margin segment (e.g. a recently acquired or trading business) grows faster will see blended margin drift down — model the *blend*, not the best segment.

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
