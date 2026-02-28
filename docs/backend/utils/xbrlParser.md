# XBRL Parser

Parses XBRL XML documents from NSE/BSE to extract quarterly financial data. Maps XBRL field names to internal schema.

## Source File
`backend/utils/xbrlParser.js`

## Functions/Methods

### parseXBRL(xbrlUrl)
Fetch and parse XBRL XML from URL. Extracts P&L, balance sheet, and cash flow data.

**Parameters:**
- `xbrlUrl` (string) - URL to XBRL XML file

**Returns:** Promise\<Object\> - Parsed financial data with fields like `revenue`, `net_profit`, `eps_basic`, `total_assets`, etc.

### extractPeriods(xbrl)
Extract context periods (start/end dates) from XBRL document.

**Parameters:**
- `xbrl` (object) - Parsed XBRL document

**Returns:** Object mapping context IDs to `{ start, end }`

## Exports

### XBRL_FIELD_MAP
Object mapping XBRL field names (e.g., `in-bse-fin:RevenueFromOperations`) to internal field names (e.g., `revenue`).

## Usage Example

```javascript
const { parseXBRL } = require('../utils/xbrlParser');

const data = await parseXBRL('https://www.nseindia.com/.../xbrl.xml');
// data.revenue, data.net_profit, data.eps_basic, etc.
```

## Related
- [balanceSheetDataFetcher](../../backend/scripts/balanceSheetDataFetcher.js)
- [stockController](../controllers/stockController.md)
