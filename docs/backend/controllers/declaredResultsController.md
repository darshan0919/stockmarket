# Declared Results Controller

Fetches declared quarterly results from StockScans API with filters. Supports transcript notes download.

## Source File
`backend/controllers/declaredResultsController.js`

## Functions/Methods

### getDeclaredResults(req, res, next)
Fetch declared results from StockScans with filters (market cap, index, industry, watchlist, etc.).

**Parameters (req.body):**
- `marketCapMin` (number) - Min market cap in Cr (default: 1000)
- `index` (string[]) - Index filters (e.g., Nifty 50)
- `industry` (string[]) - Industry filters
- `watchlistIds` (string[]) - Watchlist company IDs
- `order` (string) - 'asc' or 'desc' (default: 'desc')
- `orderBy` (string) - Sort field (default: 'Last Result Date')
- `offset` (number) - Pagination offset (default: 0)
- `resultDate`, `searchCompany`, `documentType` (string) - Additional filters

**Returns:** JSON with `results`, `pagination`, `quarterDate`, `resultDates`

### getFilterOptions(req, res, next)
Get available filter options (sort options, document types, indices, industries).

**Returns:** JSON with `sortOptions`, `documentTypes`, `indices`, `industries`

### downloadTranscriptNotes(req, res, next)
Download transcript notes for companies to `downloads/{quarterDate}/`. Requires StockScans auth.

**Parameters (req.body):**
- `quarterDate` (string) - Required
- `companyIds` (array) - Required. Each item: `{ companyId, symbol, name, notesUrl, documentType, date }`

**Returns:** JSON with `downloadDir`, `successCount`, `errorCount`, `results`

## Usage Example

```javascript
// POST /api/declared-results
// Body: { marketCapMin: 1000, orderBy: "Last Result Date", offset: 0 }

// GET /api/declared-results/filters

// POST /api/declared-results/download-notes
// Body: { quarterDate: "2025Q1", companyIds: [...] }
```

## Related
- [API Reference](../../API_REFERENCE.md#declared-results-apis)
- [stockscansAuth](../services/stockscansAuth.md)
