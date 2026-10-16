# IndiaMTF API Schemas

Client: `stock-api/src/clients/IndiaMtfClient.js` (`indiamtf` singleton). Third-party aggregator of the NSE/BSE
daily **Margin Trading Disclosure** files. Free; attribution required ("IndiaMTF.com, from NSE/BSE disclosures").
Unofficial and undocumented — may change or disappear (verified live 2026-10-11). The disclosed session trails the
latest market session by one day.

## GET /latest.json

`{generated, status:{nse_date:'08 Oct 2026', bse_date, aligned:boolean, basis:'N+B'}, combined:{as_of, net, net_prev, fresh, liq, scrips_nse, scrips_bse, book_total, top10:[{s,n,cr,src}]}, ...}`
`IndiaMtfClient.latestDate()` -> older of nse_date/bse_date as `YYYY-MM-DD`.

## GET /history/scripwise/daily/<YYYY-MM-DD>.csv

Top 1,000 scrips by funded book (500 before 2025-11-11). 404 = no file (holiday / unpublished) -> client returns `null`.
Columns: `symbol,isin,name,nse_cr,bse_cr,combined_cr,nse_qty,bse_qty,rank,pct_of_book,src` (`src` = N | B | N+B).
Shares financed `q` = `nse_qty + bse_qty` (matches the `q` of `/history/stock/<TICKER>.json`). Rows with names containing
commas are skipped (column count mismatch) rather than mis-parsed.

## GET /history/stock/<TICKER>.json

Client method: `IndiaMtfClient.stockHistory(symbol)`.
Complete per-scrip MTF history and windowed deltas. Returns null on 404/403.

- Response payload: `{ticker, isin, name, sector, industry, latest: {date, cr, pct, rank, days, peak_cr, peak_date, trough_cr, first_date, first_cr, nse, bse, q, nq, bq}, windows: {'1d': {ref_date, cr, pct, q, q_pct}, '10d': ..., '30d': ..., '90d': ..., '180d': ..., '1y': ...}, max_add: {cr, date}, max_unwind: {cr, date}, series: [{d, cr, pct, rank, nse, bse, q, nq, bq}, ...], price: [[date, close], ...]}`

## Not used by the job (documented for research)

`/history/stock/index.json` (1,502 scrips), `/history/snapshots.json`.
