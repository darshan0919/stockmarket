# Track Record Methodology

This reference governs Tab 4 (Track Record). Highest rigour bar in the skill — this is where most analyses go wrong by inferring success the investor never claimed.

## Pick extraction — the cardinal rule

A **pick** requires three things in the same tweet (or a tweet + its parent if it's a reply):

1. A **named stock** (ticker, company name, or unambiguous abbreviation)
2. An **action verb** (see classification taxonomy)
3. A **stance** that's the investor's own (not asking, not quoting, not hypothetical)

If any of the three is missing, it's not a pick. It might be a `concept` or `macro_view` instead.

## Building the pick table

Per stock, build one row. Schema:

```
{
  "ticker_or_name": "BAJAJCON",
  "canonical_name": "Bajaj Consumer Care Ltd",
  "action": "Buy" | "Sell" | "Hold" | "Recommend" | "Watching",
  "claim_date": "YYYY-MM-DD",        // earliest tweet matching this pick
  "claimed_entry_price": 230.5,      // null if not stated
  "claimed_pnl": "+3x in 18mo",      // null if not stated, verbatim if stated
  "citations": ["#1234", "#5678"],
  "current_price": null,             // filled in cross-verify step
  "current_price_date": null,
  "return_pct": null,
  "verdict": null,
  "notes": ""
}
```

### Action precedence

If the investor tweeted Buy in Jan, Trim in Mar, Hold in Jul about the same stock — record the EARLIEST disclosure date and original action (Buy). Add a note: "trimmed Mar 2024, still holding Jul 2024". The pick is the first time they put it on the record.

### De-duplication

Same stock = same row, regardless of how many times it's mentioned. Pool all citations. Earliest date wins for `claim_date`.

### Ambiguous tickers

- "Apple" → Look at context. If they discuss earnings/iPhone → AAPL. If they discuss fruit prices → not a pick.
- "Reliance" in Indian context → RELIANCE (NSE). In other context → ambiguous, flag.
- Common abbreviations like RIL, HUL, M&M, L&T → map to canonical NSE tickers.

If after context inspection the ticker is still ambiguous, mark `verdict: UNVERIFIABLE` with reason "ambiguous ticker".

## Cross-verification with live prices

This is mandatory in this skill (user opted in to cross-verify).

### Procedure

For each pick row, do this:

1. **Resolve the ticker** to a canonical form:
   - Indian: prefer NSE (e.g., "RELIANCE", "BAJAJCON", "JIOFIN")
   - US: NYSE/NASDAQ symbol
   - Other markets: company name + exchange in the search query
2. **Fetch current price via `web_search`**. Example queries:
   - `RELIANCE share price NSE`
   - `Bajaj Consumer Care share price today`
   - `AAPL stock price`
3. **Get historical price on claim_date** if needed for the return calculation. If the investor stated an entry price, use that. Otherwise, search:
   - `<ticker> share price <month> <year>`
   - Or rely on the tweet date as the entry reference point and search for that day's close.
4. **Compute return:**
   - `return_pct = ((current_price - entry_price) / entry_price) * 100`
   - For Sell calls: `return_pct = -((current_price - entry_price) / entry_price) * 100` (a Sell call "wins" if price dropped)
   - For Watching: no return computed; mark as `WATCHING` not `TOO_EARLY`.
5. **Record `current_price_date`** as the date you ran the search (today's date).

### Verdict assignment

Rules in priority order (first match wins):

| Condition | Verdict |
|---|---|
| Ticker unresolvable or company delisted with no successor | `UNVERIFIABLE` |
| Investor tweeted "watching" / "tracking" / "may buy" | `WATCHING` (excluded from hit rate) |
| `claim_date` within last 90 days | `TOO_EARLY` (excluded from hit rate) |
| `return_pct > +20%` | `WIN` |
| `return_pct` between `-10%` and `+20%` | `NEUTRAL` |
| `return_pct < -10%` | `LOSS` |

### Benchmark check (use when feasible)

Where possible, also compute the benchmark return over the same window (Nifty 50 for Indian, S&P 500 for US, sector index if cleaner). Compare the pick's return to the benchmark. A WIN by absolute return that underperformed the index by > 10pts → downgrade verdict to NEUTRAL with a note. Conversely, a small absolute gain that beat the index handily → upgrade to WIN. This avoids crediting a beta-driven rally as alpha. Skip benchmark adjustment if the lookup is failing — don't fabricate.

## Headline rating computation

After every pick has a verdict:

```
verifiable_picks = WINs + NEUTRALs + LOSSes   # excludes WATCHING, TOO_EARLY, UNVERIFIABLE
hit_rate = WINs / verifiable_picks
average_return = mean(return_pct over verifiable_picks)
median_return = median(return_pct over verifiable_picks)
biggest_winner = pick with max return_pct
biggest_loser  = pick with min return_pct
unverifiable_ratio = UNVERIFIABLEs / total_picks
```

## Star rating

This is the headline number the user sees. Be conservative; small samples are noise.

| Stars | Criteria |
|---|---|
| **5★** | hit_rate > 0.65 AND verifiable_picks > 20 AND unverifiable_ratio < 0.25 |
| **4★** | hit_rate 0.50–0.65 AND verifiable_picks > 15 |
| **3★** | hit_rate 0.40–0.50 |
| **2★** | hit_rate 0.30–0.40 OR unverifiable_ratio > 0.40 |
| **1★** | hit_rate < 0.30 OR unverifiable_ratio > 0.60 |
| **N/A** | verifiable_picks < 5 — state explicitly, do not force a rating |

## Unverifiable profit claims (separate section)

Tweets like "made 3x on a pharma play in 2021" with no stock named cannot be verified. Build a separate table:

```
{
  "claim": "Made 3x on a pharma play",
  "claim_date": "2024-08-12",
  "stock_named": false,
  "citations": ["#1234"]
}
```

Show these in Tab 4 in a collapsed sub-section labelled **Unverifiable Profit Claims**. Do NOT include in the hit-rate computation. The COUNT of such claims is a credibility signal (high count = investor likes to boast vague wins, weakens overall rating).

## Edge cases

- **Stock delisted/acquired**: If acquired, use the deal price as the exit price. If delisted, mark UNVERIFIABLE with reason.
- **Bonus issues / splits**: Adjust the entry price using a standard split/bonus-adjusted approach. The web search results typically already show split-adjusted prices, so this is usually automatic.
- **Currency**: Don't mix currencies. Report each pick in its native currency and the % return (which is currency-neutral).
- **Same pick, opposite views over time**: If they said Buy in Jan, Sell in Jun on same stock — that's TWO entries: a Buy pick (entry Jan, exit Jun at their disclosed price) and a separate Sell call (entry Jun, current price as the test). Note this in the row.
- **Pump-and-dump suspicion**: If the pick is a micro-cap with thin float, flag it in notes. Don't moralise.

## What NOT to do

- Don't infer picks from tweets that don't have an action verb.
- Don't credit "I told you so" tweets if there's no earlier matching pick in the corpus.
- Don't pretend to know the entry price if the investor didn't state it — use the tweet-date closing price.
- Don't compute a hit rate if verifiable picks < 5.
- Don't include a star rating without showing the computation that backed it.
