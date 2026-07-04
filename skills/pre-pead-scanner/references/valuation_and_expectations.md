# Valuation & expectations — is the beat already priced?

This is Step 6. A surprise moves a stock only to the extent it wasn't expected, and a stock's price *is* the market's expectation. So valuation is not a separate "is it cheap?" question bolted on — it is the **expectations leg of the surprise trade**. The same predicted beat is worth far more in a name trading cheap to its own history than in one already priced for perfection.

## The 50-day average P/E — why average, not spot

Use the **50-day average P/E**, not the single-day spot multiple, for the same reason the liquidity gate uses 50-day average traded value: a spot number is noisy (one gap day, one block deal) and you're making a judgement about the *prevailing* expectation, not today's tick. The 50-day window smooths event noise while staying current enough to reflect the run into results.

Read it three ways:

1. **Versus the stock's own trailing history.** Is the 50D-avg P/E above or below its 1–3 year median? A name at the top of its own range has re-rated *ahead* of the result — good news is discounted, and it takes a bigger beat to surprise. A name at the bottom of its range has de-rated — a beat lands into low expectations and moves more. This own-history comparison is the single most useful valuation read for a surprise trade.
2. **Versus the industry median.** The scan carries `Industry PE Median`. Trading at a premium to peers means the market already rates this name's execution highly; the bar is higher. A discount to peers with a coming beat is the asymmetric setup.
3. **Versus its own growth.** A high absolute P/E is not "expensive" if the beat you're predicting accelerates growth (PEG collapses on the upgrade). Cross-check against `PEG` and the growth your Step-4 estimate implies — the question is whether the multiple has *already* capitalised the growth you're forecasting.

Sourcing: the scan's valuation columns (`Price To Earnings`, `Industry PE Median`, `PEG`, `EV To EBITDA`, `Price To Book Value`, `Price To Sales`). If a genuine 50-day-average P/E column isn't exposed, approximate it as `(50-day average close) ÷ trailing EPS` using the price history (same series as Step 7) and flag it `[approx]`.

## Research-report targets and valuation models

Where the user supplies broker/research PDFs (or names a target), extract and use them — they encode the street's *expectation* directly:

- **Price target and rating**, with broker and date. Compute upside/downside to CMP. A stock already *at or above* consensus target has little room to re-rate on a beat — the beat is priced. A stock trading at a wide discount to target has room to close the gap if the result confirms the thesis.
- **The valuation model behind the target** — the multiple (P/E, EV/EBITDA) and the forward earnings the analyst applied it to. This tells you what the analyst is *assuming for the very quarter you're predicting*. If your estimate is above the earnings baked into the target, the target itself is likely to be revised up post-result — a second-order catalyst.
- **Where estimates cluster** — if several notes cluster tightly, expectations are well-anchored and a surprise must be clear to matter; if they're scattered, the name is contested and a clean beat resolves the debate in your favour.

Always quote the target/estimate with broker + date, and never present a broker's number as your own or as company guidance.

## Turning valuation into the expectations modifier

Collapse the reads above into one modifier on the surprise (used in `surprise_scoring.md`'s composite):

- **Amplify (beat under-priced):** 50D-avg P/E below own-history median *and/or* clear discount to research target *and/or* discount to industry with a coming beat. The market hasn't priced the good news; the surprise has room to work.
- **Neutral:** multiple in line with own history and peers, modest room to target.
- **Discount (beat likely priced):** 50D-avg P/E rich to own history *and* at/above research targets *and*/or a premium to industry. The stock has already re-rated for the beat; even a correct prediction may produce a muted or "sell-the-news" move — which the Step-7 drift signature will often confirm.

State the modifier and the one number that drove it (e.g. "discount — 50D-avg P/E 34× vs 3-yr median 22× and 6% above mean target").

## What could be wrong here

- **Trailing vs forward P/E confusion** — a name can look rich on trailing EPS and cheap on the forward EPS your beat implies. Be explicit about which EPS is in the denominator; ideally show both.
- **A depressed P/E can be a value trap, not a setup** — a de-rated multiple sometimes reflects a real deterioration the market sees and you don't. Cross-check with the capability evidence (Step 3) and earnings quality; cheap + weak order book is not the asymmetric setup, it's a warning.
- **Stale research targets** — a target set before the last result may already be OBE (overtaken by events). Weight recent notes; date-stamp everything.
- **Multiple re-rating vs earnings surprise are different trades** — this step judges whether the *earnings* surprise is priced. A name can be fairly priced on earnings yet re-rate on a narrative shift (new segment, guidance raise) the concall reveals. Keep the valuation read about expectations for *this quarter's number*, and let the guidance work carry the narrative.
- **One-off-inflated trailing EPS** deflates the P/E artificially (looks cheap). Use the one-off-cleaned EPS from Step 4 when the trailing number is distorted.
