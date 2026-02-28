# NSE Helpers

Shared utilities for NSE India API: date parsing, headers, and announcement filtering. Used by orders, announcements, and orderbook parsers.

## Source File
`backend/utils/nseHelpers.js`

## Exports

### NSE_HEADERS
Object with headers for NSE API requests: `Accept`, `Accept-Language`, `Accept-Encoding`, `User-Agent`.

### MONTH_MAP, MONTH_INDEX_MAP
Maps month names (Jan-Dec) to numeric strings and indices.

### parseNseDate(dateStr)
Parse NSE date format ("31-Dec-2025 10:30:00") to ISO date string (YYYY-MM-DD).

**Parameters:**
- `dateStr` (string) - NSE date string

**Returns:** string | null

### parseNseDateToObject(dateStr)
Parse NSE date to JavaScript Date object. Handles "31-Dec-2025" and "31-12-2025" formats.

**Parameters:**
- `dateStr` (string) - NSE date string

**Returns:** Date | null

### parseNseDateToTimestamp(dateStr)
Parse NSE date to timestamp string for filenames ("2025-12-31T10-30-00").

**Parameters:**
- `dateStr` (string) - NSE date string

**Returns:** string | null

### isOrderAnnouncement(ann)
Check if an NSE announcement is order-related (bagging/receiving orders, tender intimation).

**Parameters:**
- `ann` (object) - NSE announcement object

**Returns:** boolean

### formatNseDateForApi(date)
Format Date object to DD-MM-YYYY for NSE API requests.

**Parameters:**
- `date` (Date) - Date object

**Returns:** string

## Usage Example

```javascript
const { NSE_HEADERS, parseNseDate, isOrderAnnouncement } = require('../utils/nseHelpers');

const response = await axios.get(url, { headers: NSE_HEADERS });
const date = parseNseDate(ann.an_dt);
const isOrder = isOrderAnnouncement(ann);
```

## Related
- [ordersService](../services/ordersService.md)
- [ordersController](../controllers/ordersController.md)
