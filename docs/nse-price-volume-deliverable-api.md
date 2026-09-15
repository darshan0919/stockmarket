# NSE price/volume/deliverable historical API notes

Written alongside `stock-api/src/analyzers/priceSpikeSignals.js` (2026-09-15),
per `skills/_shared/conventions.md` §12/§13 — this endpoint was already
wrapped by `NseClient.getPriceVolumeDeliverable()` and consumed by
`priceMetrics.js` before this doc existed; documenting it now because
`priceSpikeSignals.js` is the second independent consumer and the endpoint
had never been given its own schema entry despite being live in code for a
while.

## NSE `/historicalOR/generateSecurityWiseHistoricalData` (confirmed live 2026-09-15)

Same `historicalOR` namespace family as
`/historicalOR/bulk-block-short-deals` (see
`docs/nse-bse-historical-deals-api.md`) — NSE's date-range history backend,
as opposed to a today-only snapshot endpoint.

- `GET https://www.nseindia.com/api/historicalOR/generateSecurityWiseHistoricalData?from=DD-MM-YYYY&to=DD-MM-YYYY&symbol=SYM&type=priceVolumeDeliverable&series=ALL`
- Auth: standard `NseSession` cookie warmup (same session `getLargeDeals()`/
  `getSastReg29()` use) — no separate token. Already wrapped:
  `NseClient.getPriceVolumeDeliverable(symbol, fromDate, toDate)` builds the
  params (`from`, `to`, `symbol` uppercased, `type: 'priceVolumeDeliverable'`,
  `series: 'ALL'`) and returns `Array.isArray(res.data) ? res.data : res.data?.data || []`.
- Confirmed live 2026-09-15 against `NSE:EMUDHRA`, `15-Jun-2026`..`15-Sep-2026`
  — 64 rows returned, all `CH_SERIES: "EQ"` (single-series name; `series=ALL`
  returned only EQ rows for this ticker, so no observed multi-series dedup
  need here — a name listed on both EQ and BE series would need series-aware
  dedup before trusting one `close`/`volume` per calendar date; not yet
  exercised, flag if it comes up).
- Response: bare array of row objects (or `{ data: [...] }` — the client
  handles both shapes). Confirmed fields per row:
  - `CH_SYMBOL`, `CH_SERIES` (e.g. `"EQ"`)
  - `mTIMESTAMP` — human display date, `DD-Mon-YYYY` (e.g. `"11-Sep-2026"`)
  - `CH_TIMESTAMP` — ISO timestamp, one calendar day earlier at 18:30 UTC
    (`T-1 18:30Z` = trade date's own midnight IST — same NSE timezone-encoding
    quirk as `BD_DT_ORDER` in the bulk-deals endpoint; not a data bug)
  - `CH_PREVIOUS_CLS_PRICE`, `CH_OPENING_PRICE`, `CH_TRADE_HIGH_PRICE`,
    `CH_TRADE_LOW_PRICE`, `CH_LAST_TRADED_PRICE`, `CH_CLOSING_PRICE`, `VWAP`
  - `CH_TOT_TRADED_QTY` — total traded quantity (shares) for the day
  - `CH_TOT_TRADED_VAL` — total traded value in ₹ (not crore — divide by 1e7
    for ₹ Cr, as `priceMetrics.js`'s `normalizePvd`/`priceSpikeSignals.js`'s
    `computeDailyMetrics` both do)
  - `CH_TOTAL_TRADES` — trade count
  - `COP_DELIV_QTY`, `COP_DELIV_PERC` — delivery quantity and delivery % of
    total traded quantity
- Already-parsed via `priceMetrics.js`'s `normalizePvd(rows)` — returns
  ascending-by-date `{date, close, tradedValue, qty, delivPerc}`, handling
  both the `dd-Mon-yyyy` and ISO date formats and NSE's comma-formatted
  numeric strings. **Reuse `normalizePvd`, don't re-parse these fields** —
  `priceSpikeSignals.js` does this (conventions §17).
- No confirmed `symbol` multi-value behavior — always called with exactly one
  symbol in every consumer so far; not exercised for a batch/comma-joined
  symbol list.
