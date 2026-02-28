# Orders Controller

HTTP handlers for order-related endpoints. Fetches order announcements from NSE, parses PDFs with Gemini AI, and provides orderbook aggregation.

## Source File
`backend/controllers/ordersController.js`

## Functions/Methods

### getOrders(req, res, next)
Fetch order announcements for a stock (non-AI mode, no PDF parsing). Returns metadata only.

**Parameters:**
- `req.params.symbol` (string) - Stock symbol
- `req.query.limit` (string) - Max orders (default: 50)

**Returns:** JSON with `orders`, `baseline_document_url`, `latest_transcript`, `mode: 'non-ai'`

### parsePdf(req, res, next)
Parse a specific PDF attachment to extract order details via Gemini AI.

**Parameters:**
- `req.params.symbol` (string) - Stock symbol
- `req.body.attachmentUrl` (string) - PDF URL (required)

**Returns:** JSON with `parsed_data`

### getFullOrders(req, res, next)
Fetch orders with full PDF parsing (slower). Parses each attachment with Gemini.

**Parameters:**
- `req.params.symbol` (string) - Stock symbol
- `req.query.limit` (string) - Max orders (default: 20)

**Returns:** JSON with `orders`, `timing`, `cache_stats`

### getOrderbook(req, res, next)
Get accumulated order book: baseline from annual report + new orders after baseline date.

**Parameters:**
- `req.params.symbol` (string) - Stock symbol

**Returns:** JSON with `orderbook_summary`, `order_inflow`, `new_orders`

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
// POST /api/orders/RELIANCE/parse-pdf { attachmentUrl: "..." }
// GET /api/orders/RELIANCE/full?limit=20
// GET /api/orders/RELIANCE/orderbook
// POST /api/orders/RELIANCE/download-all
```

## Related
- [API Reference](../../API_REFERENCE.md#orders-apis)
- [ordersService](../services/ordersService.md)
- [orderParser](../api/orderParser.md)
- [nseHelpers](../utils/nseHelpers.md)
