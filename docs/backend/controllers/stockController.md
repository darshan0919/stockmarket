# Stock Controller

Handles stock search, details, technicals, financials, and quarterly results. NSE JSON calls go through `backend/api/nseIndiaApi.js` (cookie session + retry); search falls back to MongoDB on API failure.

## Source File
`backend/controllers/stockController.js`

## Functions/Methods

### searchStocks(req, res, next)
Search stocks by symbol or name. Uses `searchAutocomplete()` from `nseIndiaApi`; falls back to local database on API failure.

**Parameters:**
- `req.query.q` (string) - Search query (required)
- `req.query.page` (number) - Page number (default: 1)
- `req.query.limit` (number) - Results per page (default: 10)

**Returns:** JSON with `results`, `total`, `page`, `limit`

### getStockDetails(req, res, next)
Get comprehensive stock details including basic info, price, fundamentals, and 5-year price history. Tries `getQuoteEquity()` from `nseIndiaApi`; on NSE 403, falls back to BSE `getBseQuoteHeader` + `getCompanyInfo` via `quoteFromBseData()` in `stockDetailsFetcher`. BSE HTTP uses `bseHttp.js` (undici) because BSE responses include malformed headers that break axios. If all live sources fail, returns cached MongoDB `Stock` data with `fallback: true`.

**Parameters:**
- `req.params.symbol` (string) - Stock symbol

**Returns:** JSON with `basic_info`, `price_info`, `fundamentals`, `price_history_5y`

### getStockTechnicals(req, res, next)
Get technical indicators (SMA 50/200, RSI, MACD) from price history.

**Parameters:**
- `req.params.symbol` (string) - Stock symbol

**Returns:** JSON with `current_price`, `sma_50`, `sma_200`, `rsi_14`, `macd`

### getStockFinancials(req, res, next)
Get P&L and balance sheet data from database.

**Parameters:**
- `req.params.symbol` (string) - Stock symbol
- `req.query.quarters` (number) - Number of quarters (default: 4)

**Returns:** JSON with `p_and_l`, `balance_sheet` arrays

### getQuarterlyResults(req, res, next)
Get quarterly results with YoY/QoQ growth. Uses cache first, then NSE XBRL fetch.

**Parameters:**
- `req.params.symbol` (string) - Stock symbol
- `req.query.force_refresh` (boolean) - Bypass cache

**Returns:** JSON with `quarters`, `source`, `cached`

## Usage Example

```javascript
// GET /api/stocks/search?q=reliance&page=1&limit=10
// GET /api/stocks/RELIANCE
// GET /api/stocks/RELIANCE/technicals
// GET /api/stocks/RELIANCE/financials?quarters=4
// GET /api/stocks/RELIANCE/quarterly?force_refresh=true
```

## Related
- [API Reference](../../API_REFERENCE.md#stocks-apis)
- [bseIndiaApi](../api/bseIndiaApi.md)
- [technicalIndicators](../utils/technicalIndicators.md)
