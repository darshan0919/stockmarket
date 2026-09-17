# NSE `getSymbolData` — field reference for delivery/price fields

Endpoint: `NseClient.getSymbolData(symbol)` → `GET /api/NextApi/apiClient/GetQuoteApi`
(`functionName=getSymbolData&marketType=N&series=EQ&symbol=<SYMBOL>`).

Live-confirmed 2026-09-17 against `EMUDHRA` while building `delivery-volume-tracker`
(`packages/jobs-runtime/deliveryVolumeTracker.js`). Documented per
`skills/_shared/conventions.md` §13 because the fields below were NOT obvious from
the endpoint name and an earlier draft of the consuming script guessed wrong once
(assumed `lastPrice`/`change`/`pChange` lived under `priceInfo` — they don't).

## Response shape (fields this repo actually reads)

```json
{
  "orderBook": { "lastPrice": 632.4, "...": "bid/ask ladder, fallback lastPrice source" },
  "metaData": {
    "companyName": "eMudhra Limited",
    "change": -9.9,
    "pChange": -1.54,
    "previousClose": 642.3
  },
  "tradeInfo": {
    "totalTradedVolume": 3617343,
    "totalTradedValue": 2264022636.84,
    "lastPrice": 632.4,
    "deliveryToTradedQuantity": 15.43,
    "deliveryquantity": 459683
  },
  "priceInfo": {
    "yearHigh": 710.1,
    "yearLow": 364.55,
    "priceBand": "513.85-770.75"
  }
}
```

Field-by-field notes:

- **`tradeInfo.lastPrice`** — the canonical live last-traded price. `orderBook.lastPrice`
  is a confirmed-identical fallback (both were `632.4` in the live sample).
- **`metaData.change` / `metaData.pChange`** — absolute and percent change vs previous
  close. NOT under `priceInfo` — `priceInfo` in this endpoint only carries 52-week
  high/low, price band, and volatility, no price-move fields at all (a real trap:
  it _sounds_ like the price block but isn't).
- **`tradeInfo.totalTradedVolume`** — today's cumulative traded quantity so far
  (live, grows through the session).
- **`tradeInfo.deliveryToTradedQuantity`** — a bare number (NOT an object), the
  delivery % of `totalTradedVolume` so far today. Same field `gainersScanner.js`'s
  `deriveNseDelivery()` already uses (confirmed there 04-Jul-2026).
- **`tradeInfo.deliveryquantity`** (lowercase `q`) — the direct delivery quantity,
  already computed server-side. Prefer this over re-deriving
  `totalTradedVolume × deliveryToTradedQuantity / 100` — the two agree in the live
  sample (`3617343 × 15.43% ≈ 558156` vs the direct field's `459683`... **these did
  NOT match exactly in the live sample** — see caveat below) but the direct field is
  the source of truth when present.
- **`secInfo.deliveryQuantity` / `secInfo.deliveryTotradedQuantity`** (strings) —
  a THIRD copy of the same two numbers, as strings, inside `secInfo`. Not used by
  this script; noted here so a future reader isn't surprised to find delivery data
  in three places on one response.

## Open caveat — NOT fully resolved, flagged rather than silently picked

In the one live sample captured 2026-09-17, `tradeInfo.deliveryquantity` (459683)
and `totalTradedVolume × deliveryToTradedQuantity / 100` (3617343 × 0.1543 ≈ 558156)
did **not** agree — a ~17% discrepancy. Two live possibilities, not yet
distinguished: (a) `totalTradedVolume` and `deliveryquantity` are measured at
slightly different intraday instants within the same payload (the endpoint is
live/streaming, so a few seconds' skew between sub-fields updating is plausible),
or (b) `deliveryToTradedQuantity`'s percent is against a different denominator than
`totalTradedVolume` (e.g. `tradeInfo.quantitytraded`, which was `2979438` in the
same sample — using THAT denominator: 2979438 × 0.1543 ≈ 459730, which matches
`deliveryquantity` (459683) far more closely than `totalTradedVolume` does).
**Likely conclusion (unconfirmed — needs a second live sample to verify): the
percent's true denominator is `tradeInfo.quantitytraded`, not `totalTradedVolume`.**
`delivery-volume-tracker` currently stores `tradeInfo.deliveryquantity` directly
(sidestepping the derivation entirely) specifically to avoid depending on this
unresolved denominator question — if a future script needs to re-derive delivery
qty from the percentage instead of reading the direct field, confirm the
denominator first rather than assuming `totalTradedVolume`.
