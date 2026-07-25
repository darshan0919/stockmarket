# Post-event returns — is the surprise tradeable?

This is Step 7. A correct beat prediction earns nothing if the stock fades every good result. This step measures how _this specific name_ has historically behaved after its three information events, so the ranking can separate stocks where surprises stick (tradeable PEAD) from "sell-the-news" names where they don't.

## The three events — and why all three

A company reveals information in three distinct pulses, and each has its own drift signature:

1. **Result** — the headline numbers hit the exchange. The first, crudest reaction. `Returns after result` is available directly as a **Stockscans scan column** — read it from the scan row; no derivation needed.
2. **Concall** — management context, guidance, Q&A tone. Often held 0–2 days after the result. Moves the stock on _interpretation_ of the numbers, not the numbers themselves.
3. **Transcript release** — the full written transcript lands a few days later. Slower investors (and models) digest detail the live call moved too fast to price. A stock that's flat into the result but drifts _after the transcript_ is one where the surprise lives in the detail — exactly the under-reaction PEAD is built to harvest.

Concall and transcript returns are **not** in the scan — they must be _derived_ from the event date (recorded in Step 2) and the price history. That's what `postEventReturns` does.

## Deriving the returns

`postEventReturns(rawPrices, events, windows)` in `stock-api/src/analyzers/postEventReturns.js` (CLI: `post_event_returns.py`):

- Pull the price series from Stockscans `prices(companyId)`.
- Pass the event dates: `{ result: 'YYYY-MM-DD', concall: 'YYYY-MM-DD', transcript: 'YYYY-MM-DD' }`.
- It **anchors** each event on the first trading day whose close reflects it (events often fall on a holiday or after market close, so you anchor on the next available close, not the literal date), then measures forward return over trading-day windows — default **+1D / +5D / +20D**.
- Windows are counted in _trading days_ (candle steps), not calendar days, so they're comparable across names regardless of holidays.

```bash
python3 stock-api/python/analyzers/post_event_returns.py "NSE:PGEL" \
    --result 2026-01-28 --concall 2026-01-29 --transcript 2026-02-03 \
    --windows 1,5,20 --json-out /tmp/pead/NSE_PGEL_returns.json
```

Returns are fractions (`0.08` = +8%). If the series doesn't extend far enough past an event, that window comes back `null` with `note: 'insufficient price history for full window'` — **report the gap, never guess a return.**

## The drift signature

One quarter's post-event return is an anecdote; the _pattern_ across the last several quarters is the signal. Run the derivation for the last 3–4 result/concall/transcript events and pass the chosen-window returns (usually `d20`) to `driftSignature(rets)`. It labels the pattern:

- **`strong-positive-drift`** — mean ≥ +5% and up in ≥60% of quarters. Beats reliably get rewarded here; a correct positive-surprise prediction is high-value. Amplify the composite score.
- **`positive-drift`** — mean > +1%, up ≥50%. Tradeable, weaker.
- **`noisy`** — no consistent direction. The name's post-result move is a coin flip; your surprise needs to be large and well-evidenced to be worth it.
- **`fade`** — mean ≤ −2%. Good results systematically get sold ("sell-the-news"). Even a correct beat prediction may lose money; **discount hard**, and treat a rich valuation (Step 6) on a `fade` name as a near-disqualifier for a long.
- **`insufficient`** — fewer than two clean quarters. Say so; don't infer tradeability from noise.

Report the signature and the underlying per-quarter returns so the reader can see the consistency, not just the label.

## Reading the result-vs-concall-vs-transcript gap

The _shape_ across the three events is itself informative:

- **Pops on result, fades after** → the reaction is a headline algo/retail spike that informed money sells into. Low-quality drift.
- **Flat on result, drifts up after concall/transcript** → the market under-reacted to the numbers and re-rated on the detail. **The highest-quality PEAD signature** — this is the under-reaction the whole strategy targets.
- **Pops on all three and holds** → strong, broad-based repricing; good, but more likely already partly in the price by the time you act.

Use the gap to sharpen the tradeability read, not just the single-window number.

## Feeding it into the rank

The drift signature is the **Tradeability** leg of the composite score in `surprise_scoring.md`. Positive-drift names amplify a positive surprise; fade names shrink it. It does _not_ change the _direction_ of your surprise prediction — a fade name can still beat; the drift only tells you whether the beat is worth trading in that name.

## What could be wrong here

- **Market-wide contamination** — a post-event return partly reflects what the whole market did in that window. For a cleaner read, compare the raw drift against the index move over the same window (subtract Nifty/sector return) before trusting a `strong-positive-drift` label; a name that "drifted +8%" in a week the index rose 7% barely moved on its own news.
- **Small sample** — 3–4 quarters is a thin base. A single blowout quarter can flip the mean; report the per-quarter returns, and downgrade `strong-positive-drift` to "provisional" when it rests on one outlier.
- **Regime change** — drift history from before a major change (management, capital structure, F&O inclusion, a big re-rating) may not describe today's stock. Weight recent quarters; note if the character clearly shifted.
- **Wrong event date** — anchoring on the wrong result/concall/transcript date silently measures the return from the wrong day. Cross-check the dates against the documents API (Step 2) and confirm the anchor date the tool reports looks right relative to the event.
- **The past need not repeat** — historical drift is a base rate, not a promise. It sizes conviction; it doesn't guarantee this quarter's move.
