# Classification Taxonomy

Use this when running Phase 2 (per-tweet tagging). Each tweet receives one or more tags. When in doubt, prefer multi-tagging over forcing a single bucket.

## Tags

### `pick`
A tweet that names a specific stock/company AND has an action verb attached.

**Action verbs (Buy-side):** bought, buying, added, accumulated, top pick, conviction buy, long, like, holding, position, portfolio, my pick, recommend, ideas, betting on
**Action verbs (Sell-side):** sold, exited, trimmed, booked, gone, lightened, out of
**Action verbs (Watching):** watching, on my radar, tracking, may buy, considering

Examples that qualify:
- "Added more @JIOFIN today" — pick (Buy, JIOFIN)
- "Trimmed my INFY position above 1500" — pick (Sell, INFY)
- "BAJAJCON is a top conviction" — pick (Buy, BAJAJCON)

Examples that do NOT qualify:
- "INFY result was good" — concept/macro, not a pick (no action by the author)
- "What do you think of HDFC?" — question, not a pick
- "RIL had a great run" — observation, not a pick

### `profit_claim`
Tweet asserts the author realised or is sitting on a gain/loss. Includes vague claims.

Examples:
- "Made 3x on this in 18 months"
- "My portfolio is up 40% YTD"
- "Took a hit on the small-cap rotation"

If a stock is named in the same or adjacent tweet, also tag `pick`.

### `process`
Describes a screening criterion, an entry/exit rule, a checklist item, or any operational SOP.

Examples:
- "I never buy stocks with D/E > 1"
- "Three things I check before buying: ROCE, FCF, promoter pledge"
- "Sell rule: position size > 15%, trim"

### `macro_view`
Opinion on rates, sectors, cycles, currencies, commodities, geopolitics, regulation.

Examples:
- "RBI is done cutting for FY26"
- "PSU banks have more room"
- "Crude below 70 is bullish for India"

### `concept`
General investing philosophy or mental model that isn't a screen or rule.

Examples:
- "Compounders > traders, always"
- "Time in market > timing the market"
- "Drawdowns are the price of admission"

### `anti_pattern`
What the investor avoids or warns against.

Examples:
- "I never short anything"
- "Stay away from sugar stocks"
- "Avoid promoters with > 30% pledge"

### `off_topic`
Personal life, jokes without market content, retweets without commentary, sports, politics unrelated to markets. Exclude from playbook synthesis.

### `uncertain`
Sarcasm, ambiguous tone, unclear referent, low-confidence classification. Flag for caution; do not promote to high-confidence insights.

## Decision rules

- **Replies in context.** If the tweet is a reply, fetch the parent tweet text (already attached as `in_reply_to_text` in the normalised JSON). Often a reply is unintelligible alone but clear with the parent.
- **Threads.** If a tweet is part of a thread by the same author, treat the thread as one unit for tagging.
- **Retweets.** A bare retweet (no added commentary) → `off_topic`. A quote-retweet with the investor's commentary → tag the commentary.
- **Ambiguous tickers.** "Apple" could be the fruit or AAPL. Look at surrounding context. If still ambiguous, tag `uncertain`.
- **Indian stock conventions.** Tickers may appear as `NSE:RELIANCE`, `RELIANCE`, `Reliance Industries`, or `RIL`. Normalise to the canonical NSE ticker in the pick table.

## Edge cases

- **Promotion / shilling**: If a tweet looks promotional (e.g., paid promotion of a small-cap), still tag it as `pick` but flag with `uncertain` for the synthesis stage to handle carefully.
- **Hypothetical**: "If I were buying, I'd pick X" is NOT a pick. Tag as `concept` instead.
- **Past tense without action**: "I bought RIL in 2015" — this IS a pick (Buy, RIL, dated 2015 if you can pin it down; else the tweet date as the disclosure date, flagged as a retroactive claim).
- **Multiple stocks in one tweet**: Generate one pick record per stock.
