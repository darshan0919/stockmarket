# NSE India API Module

> **File**: `backend/api/nseIndiaApi.js`  
> **Tests**: `backend/api/__tests__/nseIndiaApi.test.js`  
> **Last Updated**: 2026-05-30

## Overview

Central gateway for NSE India (National Stock Exchange) JSON API calls. All endpoints require a browser-like session: fetch cookies from the homepage, then pass `Cookie` + `Referer` on each request.

## API Details

- **Base URL**: `https://www.nseindia.com/api`
- **Authentication**: Cookie-based session (`getNseCookies`)
- **Retry**: `nseGet` clears cache and retries once on HTTP 401/403

## Functions

### clearNseCookieCache

Clears the in-memory cookie cache (used before retry after auth failure).

```javascript
clearNseCookieCache(): void
```

### getNseCookies

Fetches and caches session cookies from `https://www.nseindia.com/` (5-minute TTL).

```javascript
async function getNseCookies() → string | null
```

### getNseHeaders

Builds headers for a single request (cookies + User-Agent + Referer).

```javascript
async function getNseHeaders({ referer }) → Object
```

### nseGet

Authenticated GET with cookie session and one retry on 401/403.

```javascript
async function nseGet(path, { params, referer, timeout }) → AxiosResponse
```

### searchAutocomplete

Stock search: tries NSE `/search/autocomplete` with session cookies; on **404** (endpoint often unavailable) falls back to **BSE** `PeerSmartSearch` via `bseSmartSearch()`.

```javascript
async function searchAutocomplete(query) → { symbols: Array }
```

### warmupNseSession / mergeSetCookie

Homepage + optional equity-page warmup with browser-like headers (`sec-ch-ua`, `Sec-Fetch-*`) so Akamai accepts the session.

### getQuoteEquity

Equity quote for a symbol (`/quote-equity`).

```javascript
async function getQuoteEquity(symbol) → Object
```

### getCorporateAnnouncements

Corporate announcements for a symbol.

```javascript
async function getCorporateAnnouncements(symbol, extraParams?) → Array
```

### getCorporatesFinancialResults / getIntegratedFilingResults

Quarterly financial results (historical + integrated filing).

### getQuoteApi

Wrapper for NSE `NextApi/apiClient/GetQuoteApi` (annual reports, filtered announcements).

### upcomingResults / getPriceVolumeDeliverable / formatDate

Event calendar and historical delivery-volume data (unchanged behavior, now routed through `nseGet`).

## Request Headers

```javascript
const headers = await getNseHeaders({
  referer: 'https://www.nseindia.com/get-quotes/equity?symbol=RELIANCE',
});
// Includes Cookie from getNseCookies()
```

## Usage

```javascript
const { searchAutocomplete, getQuoteEquity } = require('../api/nseIndiaApi');

const search = await searchAutocomplete('rel');
const quote = await getQuoteEquity('RELIANCE');
```

## NSE API Endpoints Used

| Endpoint | Helper |
|----------|--------|
| `/search/autocomplete` | `searchAutocomplete` |
| `/quote-equity` | `getQuoteEquity` |
| `/corporate-announcements` | `getCorporateAnnouncements` |
| `/corporates-financial-results` | `getCorporatesFinancialResults` |
| `/integrated-filing-results` | `getIntegratedFilingResults` |
| `/event-calendar` | `upcomingResults` |
| `/historicalOR/generateSecurityWiseHistoricalData` | `getPriceVolumeDeliverable` |
| `/NextApi/apiClient/GetQuoteApi` | `getQuoteApi` |

## Related Documentation

- [Stock Controller](../controllers/stockController.md)
- [BSE India API](./bseIndiaApi.md)
