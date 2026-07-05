# Valuation & expectations — is the beat already priced?

This is Step 6. A surprise moves a stock only to the extent it wasn't expected, and a stock's price *is* the market's expectation. So valuation is not a separate "is it cheap?" question bolted on — it is the **expectations leg of the surprise trade**. The same predicted beat is worth far more in a name trading at a discount to consensus targets than in one already priced for perfection.

## Research-report targets and valuation models

Use the `search_web` tool to find recent research reports and notes from top equity research firms for the company. These reports encode the street's *expectation* directly:

- **Price target and rating**, with broker and date. Compute upside/downside to CMP. A stock already *at or above* consensus target has little room to re-rate on a beat — the beat is priced. A stock trading at a wide discount to target has room to close the gap if the result confirms the thesis.
- **The valuation model behind the target** — the multiple (EV/EBITDA, etc.) and the forward earnings the analyst applied it to. This tells you what the analyst is *assuming for the very quarter you're predicting*. If your estimate is above the earnings baked into the target, the target itself is likely to be revised up post-result — a second-order catalyst.
- **Where estimates cluster** — if several notes cluster tightly, expectations are well-anchored and a surprise must be clear to matter; if they're scattered, the name is contested and a clean beat resolves the debate in your favour.

Always quote the target/estimate with broker + date, and never present a broker's number as your own or as company guidance.

## Turning expectations into a modifier

Collapse the reads above into one modifier on the surprise (used in `surprise_scoring.md`'s composite):

- **Amplify (beat under-priced):** Clear discount to top research targets. The market hasn't priced the good news; the surprise has room to work.
- **Neutral:** Modest room to target.
- **Discount (beat likely priced):** At/above research targets. The stock has already re-rated for the beat; even a correct prediction may produce a muted or "sell-the-news" move — which the Step-7 drift signature will often confirm.

State the modifier and the one number that drove it (e.g. "discount — CMP 6% above mean target").

## What could be wrong here

- **Stale research targets** — a target set before the last result may already be OBE (overtaken by events). Weight recent notes; date-stamp everything.
- **Multiple re-rating vs earnings surprise are different trades** — this step judges whether the *earnings* surprise is priced. A name can be fairly priced on earnings yet re-rate on a narrative shift (new segment, guidance raise) the concall reveals. Keep the expectations read about *this quarter's number*, and let the guidance work carry the narrative.
