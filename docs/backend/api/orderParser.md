# Order Parser

Extracts order details from PDF attachments using Gemini AI. Includes fallback text parsing for amounts and capacity.

## Source File
`backend/api/orderParser.js`

## Functions/Methods

### parseOrderFromPdf(attachmentUrl)
Parse order announcement PDF using Gemini AI with order extraction prompt. Results are cached.

**Parameters:**
- `attachmentUrl` (string) - URL to PDF attachment

**Returns:** Promise\<Object\> - `{ order_details, extraction_success, confidence_score, _cache_metadata }`

### parseAmountFromText(text)
Extract order value from announcement text (fallback when PDF parsing fails). Handles Rs./INR/₹, Crore/Lakh, USD amounts.

**Parameters:**
- `text` (string) - Announcement description or attachment text

**Returns:** Object | null - `{ amount, currency, unit, value_in_crore_inr }`

### parseCapacityFromText(text)
Extract capacity from text (MW, tonnes, units, etc.).

**Parameters:**
- `text` (string) - Announcement text

**Returns:** Object | null - `{ value, unit }`

## Usage Example

```javascript
const { parseOrderFromPdf, parseAmountFromText } = require('../api/orderParser');

const parsed = await parseOrderFromPdf('https://nseindia.com/.../order.pdf');
const fallbackAmount = parseAmountFromText(ann.desc);
```

## Related
- [geminiClient](geminiClient.md)
- [ordersController](../controllers/ordersController.md)
- [API Reference](../../API_REFERENCE.md#orders-apis)
