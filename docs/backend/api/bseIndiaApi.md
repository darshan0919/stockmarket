# BSE India API

Client for BSE India public APIs. Fetches scrip codes, result announcements, upcoming results, and company info.

HTTP transport lives in `backend/api/bseHttp.js` (undici `fetch`). BSE responses sometimes ship malformed headers that break Node's axios/https parser; undici tolerates them.

## Source Files
- `backend/api/bseIndiaApi.js` — domain helpers (search, quote, announcements)
- `backend/api/bseHttp.js` — low-level GET client

## Functions/Methods

### getStockScripCode(symbol)
Get BSE scrip code for a stock symbol. Used to map NSE symbol to BSE API identifiers.

**Parameters:**
- `symbol` (string) - Stock symbol (e.g., RELIANCE)

**Returns:** Promise\<string | null\> - BSE scrip code

### getResultAnnoucement(symbol, fromDate, toDate)
Fetch earnings call transcript announcements from BSE for a company.

**Parameters:**
- `symbol` (string) - Stock symbol
- `fromDate` (string) - Start date filter
- `toDate` (string) - End date filter

**Returns:** Promise\<Array\> - Array of announcement objects

### upcomingResults()
Fetch list of companies with upcoming result dates from BSE.

**Returns:** Promise\<Object\> - BSE API response

### getCompanyInfo(scripCode)
Fetch company header info from BSE.

**Parameters:**
- `scripCode` (string) - BSE scrip code

**Returns:** Promise\<Object\> - Company info

## Usage Example

```javascript
const { getStockScripCode, getResultAnnoucement } = require('../api/bseIndiaApi');

const scripCode = await getStockScripCode('RELIANCE');
const announcements = await getResultAnnoucement('RELIANCE', '01-01-2025', '31-12-2025');
```

## Related
- [stockController](../controllers/stockController.md)
- [resultTranscriptController](../controllers/resultTranscriptController.md)
