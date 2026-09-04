# Orders Controller

HTTP handlers for order-related endpoints. Fetches order announcements from NSE and provides download and quarter grouping features.

## Source File

`backend/controllers/ordersController.js`

## Functions/Methods

### getOrders(req, res, next)

Fetch order announcements for a stock (extracts order values and capacity from text descriptions via regex).

**Parameters:**

- `req.params.symbol` (string) - Stock symbol
- `req.query.limit` (string) - Max orders (default: 50)

**Returns:** JSON with `orders`, `baseline_document_url`, `latest_transcript`, `mode: 'non-ai'`

### downloadAll(req, res, next)

Download all order PDFs as a ZIP file.

**Parameters:**

- `req.params.symbol` (string) - Stock symbol
- `req.body.limit` (string) - Max PDFs (default: 100)

### downloadDirect(req, res, next)

Download PDFs to Desktop/Stock_Data folder. Supports transcript URL and quarter filter.

**Parameters:**

- `req.params.symbol` (string) - Stock symbol
- `req.body` - `limit`, `transcriptUrl`, `quarterStartDate`, `transcriptDate`

### getQuarters(req, res, next)

Get last 8 quarters' order announcements and transcripts grouped by fiscal quarter.

**Parameters:**

- `req.params.symbol` (string) - Stock symbol

### downloadQuarter(req, res, next)

Download orders and transcripts for a specific quarter to Desktop/Stock_Data.

**Parameters:**

- `req.params.symbol` (string) - Stock symbol
- `req.body` - `quarter`, `fiscalYear`, `orders[]`, `transcripts[]`

## Usage Example

```javascript
// GET /api/orders/RELIANCE
// POST /api/orders/RELIANCE/download-all
// POST /api/orders/RELIANCE/download-direct
// GET /api/orders/RELIANCE/quarters
// POST /api/orders/RELIANCE/download-quarter
```

## Related

- [API Reference](../../API_REFERENCE.md#orders-apis)
- [ordersService](../services/ordersService.md)
- [nseHelpers](../utils/nseHelpers.md)
