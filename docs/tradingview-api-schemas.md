# TradingView public scanner — API schemas

Client: `stock-api/src/clients/TradingViewClient.js`. **Unofficial, undocumented, no API key** — may
change or rate-limit without notice. Used only for slow-moving macro/commodity snapshots (one POST per
run), never for per-stock data. A missing ticker in the response means "no data", never zero.
(This file was referenced by the client since 2026-10-10 but did not exist; written 2026-10-14 together
with `getPerformance`, per conventions §13.)

## POST `https://scanner.tradingview.com/global/scan`

Request (both methods; only `columns` differs):

```json
{
  "symbols": { "tickers": ["ICEEUR:BRN1!", "MCX:COPPER1!"] },
  "columns": ["name", "close", "change", "description"]
}
```

Response envelope (live, 2026-10-14):

```json
{
  "totalCount": 2,
  "data": [
    { "s": "ICEEUR:BRN1!", "d": ["BRN1!", 105.94, 0.2365, "Brent Oil Futures"] },
    { "s": "MCX:COPPER1!", "d": ["COPPER1!", 1411.25, -0.388, "Copper Futures"] }
  ]
}
```

- `s` — the full ticker as requested; `d` — **positional** values in the exact order of `columns`.
- Unknown tickers are silently omitted from `data` (no error).
- Yields (`TVC:US10Y`, `TVC:IN10Y`) return `null` for the `SMA*` columns — the parser keeps the row
  (price present) with `sma* = null`.

### `getQuotes(tickers)` — columns `name, close, change, description`

Returns `{ [ticker]: { name, price, changePct, description } }`. `change` = % change vs previous close.

### `getPerformance(tickers)` — columns `name, close, change, Perf.1M, Perf.3M, Perf.6M, Perf.Y, SMA20, SMA50, SMA100, description`

Returns `{ [ticker]: { name, price, changePct, perf1M, perf3M, perf6M, perf1Y, sma20, sma50, sma100, description } }`.

| Column                                       | Meaning                                              | Use in growth-predictor                                                                                                                            |
| -------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Perf.1M` / `Perf.3M` / `Perf.6M` / `Perf.Y` | % change over 1 / 3 / 6 / 12 months (point to point) | `Perf.3M` ≈ QoQ move of the input                                                                                                                  |
| `SMA20` / `SMA50` / `SMA100`                 | simple moving average of daily closes                | `SMA50` ≈ latest-quarter average (~2.4 trading months); `SMA100` ≈ two-quarter average. Both are **approximations** — tagged `[approx]` in outputs |

## Tickers verified live (2026-10-14)

`ICEEUR:BRN1!`, `NYMEX:CL1!`, `NYMEX:HO1!`, `NYMEX:NG1!`, `ICEEUR:NCF1!`, `MCX:COPPER1!`,
`MCX:ALUMINIUM1!`, `MCX:ZINC1!`, `MCX:LEAD1!`, `MCX:NICKEL1!`, `COMEX:HRC1!`, `SGX:FEF1!`, `TVC:GOLD`,
`TVC:SILVER`, `ICEUS:CT1!`, `MYX:FCPO1!`, `CBOT:ZS1!`, `CBOT:ZW1!`, `ICEUS:SB1!`, `SGX:TF1!`,
`FX_IDC:USDINR`, `TVC:IN10Y`, `TVC:US10Y`, `TVC:DXY`, `NSE:INDIAVIX`, `NSE:NIFTY`.

Not served on this route (omitted from the response): `MCX:COTTON1!`, `MCX:CPO1!`, `TVC:UKOIL`,
`DCE:*`, `TOCOM:*`, `NSE:NIFTY_AUTO`.

The industry → instrument map lives in `skills/_shared/macro/commodity-basket.json`.
