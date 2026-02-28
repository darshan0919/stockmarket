# Watchlist Controller

Manages user watchlist: add/remove stocks, list watchlist with enriched data (price, fundamentals).

## Source File
`backend/controllers/watchlistController.js`

## Functions/Methods

### getWatchlist(req, res, next)
Get all watchlist items with stock details, latest price, change percent, and fundamentals.

**Returns:** JSON with `data` array of `{ symbol, name, sector, price, change, change_percent, pe_ratio, roe, added_date }`

### addToWatchlist(req, res, next)
Add a stock to the watchlist. Validates stock exists and is not already in list.

**Parameters:**
- `req.params.symbol` (string) - Stock symbol

**Returns:** 201 JSON with `message`, `data: { symbol }`

### removeFromWatchlist(req, res, next)
Remove a stock from the watchlist.

**Parameters:**
- `req.params.symbol` (string) - Stock symbol

**Returns:** JSON with `message`, `data: { symbol }`

## Usage Example

```javascript
// GET /api/watchlist
// POST /api/watchlist/RELIANCE
// DELETE /api/watchlist/RELIANCE
```

## Related
- [API Reference](../../API_REFERENCE.md#watchlist-apis)
- [useWatchlist](../../frontend/hooks/useWatchlist.md)
- [StockHeader](../../frontend/components/StockHeader.md)
