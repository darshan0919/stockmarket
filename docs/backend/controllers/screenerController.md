# Screener Controller

Runs stock screening with filters on market cap, sector, industry, and fundamental ratios (P/E, P/B, ROE, ROCE, etc.).

## Source File
`backend/controllers/screenerController.js`

## Functions/Methods

### runScreener(req, res, next)
Execute screener with filters and return matching stocks with latest fundamentals.

**Parameters (req.body):**
- `filters` (object) - Filter criteria
  - `market_cap_min`, `market_cap_max` (number)
  - `sectors`, `industries` (string[])
  - `pe_min`, `pe_max`, `pb_min`, `pb_max` (number)
  - `roe_min`, `roe_max`, `roce_min`, `roce_max` (number)
  - `debt_to_equity_max`, `revenue_growth_3y_min`, `profit_growth_3y_min` (number)
  - `dividend_yield_min`, `dividend_yield_max`, `current_ratio_min` (number)
- `sort_by` (string) - Field to sort by (default: 'market_cap')
- `sort_order` (string) - 'asc' or 'desc' (default: 'desc')
- `limit` (number) - Max results (default: 100, max: 1000)

**Returns:** JSON with `data` (array of stocks with fundamentals), `count`, `total`

## Usage Example

```javascript
// POST /api/screener/run
{
  "filters": {
    "market_cap_min": 1000,
    "pe_max": 25,
    "roe_min": 15
  },
  "sort_by": "market_cap",
  "sort_order": "desc",
  "limit": 50
}
```

## Related
- [API Reference](../../API_REFERENCE.md#screener-apis)
- [validators](../utils/validators.md)
- [Stock Model](../../backend/models/Stock.js)
