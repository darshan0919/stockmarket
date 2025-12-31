# NSE India API Module

> **File**: `backend/api/nseIndiaApi.js`  
> **Tests**: `backend/api/__tests__/nseIndiaApi.test.js`  
> **Last Updated**: 2024-12-31

## Overview

This module provides functions for interacting with the NSE India (National Stock Exchange) API to fetch stock market data.

## API Details

- **Base URL**: `https://www.nseindia.com/api`
- **Authentication**: Cookie-based session
- **Rate Limiting**: Aggressive (requires proper headers and cookies)

## Functions

### getNseCookies

Fetches and caches session cookies required for NSE API calls.

```javascript
async function getNseCookies() → string | null
```

**Returns:** `string | null` - Cookie string or null if failed

**Caching:** Cookies are cached for 5 minutes to reduce API calls.

**Example:**
```javascript
const { getNseCookies } = require('../api/nseIndiaApi');

const cookies = await getNseCookies();
// Result: "nsit=abc123; nseappid=xyz789; ..."
```

**Implementation Details:**
- Fetches NSE homepage to get session cookies
- Extracts `set-cookie` headers
- Caches cookies with 5-minute expiry
- Returns cached cookies if still valid

---

### formatDate

Formats a JavaScript Date object to DD-MM-YYYY format required by NSE API.

```javascript
function formatDate(date) → string
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `date` | `Date` | JavaScript Date object |

**Returns:** `string` - Date in DD-MM-YYYY format

**Example:**
```javascript
const { formatDate } = require('../api/nseIndiaApi');

const date = new Date('2024-01-15');
const formatted = formatDate(date);
// Result: "15-01-2024"
```

---

### upcomingResults

Fetches upcoming financial result dates from NSE event calendar.

```javascript
async function upcomingResults() → Object[]
```

**Returns:** `Object[]` - Array of upcoming result announcements

**Response Structure:**
```javascript
[
  {
    symbol: "INFY",
    company: "Infosys Limited",
    date: "15-Jan-2024",
    purpose: "Financial Results"
  }
]
```

**Example:**
```javascript
const { upcomingResults } = require('../api/nseIndiaApi');

const results = await upcomingResults();
// Returns array of upcoming result dates
```

**Implementation Details:**
- Fetches from `/event-calendar` endpoint
- Date range: today to 1 year ahead
- Filters for `subject: 'Financial Results'`
- Uses cookies for authentication

## Request Headers

All NSE API calls require specific headers:

```javascript
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://www.nseindia.com/',
  'Connection': 'keep-alive',
  'Cookie': cookies  // From getNseCookies()
};
```

## Error Handling

```javascript
try {
  const results = await upcomingResults();
} catch (error) {
  console.error('NSE API Error:', error.message);
  // Returns empty array on failure
}
```

## Usage Example

```javascript
// backend/controllers/upcomingResult.js
const { upcomingResults } = require('../api/nseIndiaApi');

const getUpcomingResults = async (req, res, next) => {
  try {
    const results = await upcomingResults();
    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
};
```

## NSE API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `/search/autocomplete` | Stock search |
| `/event-calendar` | Upcoming events |
| `/corporates` | Corporate filings |
| `/quote-equity` | Stock quotes |

## Rate Limiting Considerations

1. Always use cookies for authentication
2. Include proper User-Agent header
3. Add delays between rapid requests
4. Cache responses where possible

## Related Documentation

- [BSE India API](./bseIndiaApi.md) - Alternative data source
- [Upcoming Results Controller](../controllers/upcomingResult.md) - Uses this API
- [Stock Controller](../controllers/stockController.md) - Uses NSE search

