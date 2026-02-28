# Market Controller

Provides market indices overview and aggregate statistics. Uses mock index data and calculates sector performance from price history.

## Source File
`backend/controllers/marketController.js`

## Functions/Methods

### getMarketIndices(req, res, next)
Get market indices (Nifty 50, Sensex) and sector-wise performance.

**Returns:** JSON with:
- `nifty50`, `sensex` - `{ current, change, change_percent }`
- `sectors` - Object mapping sector name to average change percent

### getMarketStats(req, res, next)
Get aggregate market statistics.

**Returns:** JSON with `total_stocks`, `total_sectors`

## Usage Example

```javascript
// GET /api/market/indices
// Response: { success: true, data: { nifty50: {...}, sensex: {...}, sectors: {...} } }

// GET /api/market/stats
// Response: { success: true, data: { total_stocks: 1500, total_sectors: 15 } }
```

## Related
- [API Reference](../../API_REFERENCE.md#market-apis)
- [useMarket](../../frontend/hooks/useMarket.md)
