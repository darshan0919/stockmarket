# API Client

> **File**: `frontend/lib/api.js`  
> **Tests**: `frontend/lib/__tests__/api.test.js`  
> **Last Updated**: 2024-12-31

## Overview

Centralized Axios-based API client for communicating with the backend REST API.

## Configuration

```javascript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});
```

## Interceptors

### Request Interceptor
- Logs requests (can be extended for auth tokens)

### Response Interceptor
- Handles successful responses
- Logs API errors
- Logs network errors

## API Objects

### stockAPI

Stock-related API calls.

```javascript
import { stockAPI } from '../lib/api';
```

| Method | Parameters | Description |
|--------|------------|-------------|
| `search(query, page, limit)` | `string, number, number` | Search stocks |
| `getDetails(symbol)` | `string` | Get stock details |
| `getTechnicals(symbol)` | `string` | Get technical indicators |
| `getFinancials(symbol, quarters)` | `string, number` | Get financial statements |
| `getQuarterlyResults(symbol)` | `string` | Get quarterly results |

**Example:**
```javascript
// Search for stocks
const response = await stockAPI.search('RELIANCE', 1, 10);

// Get stock details
const details = await stockAPI.getDetails('RELIANCE');

// Get quarterly results
const quarterly = await stockAPI.getQuarterlyResults('RELIANCE');
```

---

### screenerAPI

Stock screening API calls.

```javascript
import { screenerAPI } from '../lib/api';
```

| Method | Parameters | Description |
|--------|------------|-------------|
| `runScreener(filters, sortBy, sortOrder, limit)` | `Object, string, string, number` | Run stock screener |

**Example:**
```javascript
const filters = {
  pe_max: 30,
  roe_min: 15,
  sectors: ['Technology']
};

const results = await screenerAPI.runScreener(filters, 'market_cap', 'desc', 100);
```

---

### watchlistAPI

Watchlist management API calls.

```javascript
import { watchlistAPI } from '../lib/api';
```

| Method | Parameters | Description |
|--------|------------|-------------|
| `getAll()` | - | Get all watchlist items |
| `add(symbol)` | `string` | Add stock to watchlist |
| `remove(symbol)` | `string` | Remove stock from watchlist |

**Example:**
```javascript
// Get watchlist
const watchlist = await watchlistAPI.getAll();

// Add to watchlist
await watchlistAPI.add('RELIANCE');

// Remove from watchlist
await watchlistAPI.remove('RELIANCE');
```

---

### marketAPI

Market data API calls.

```javascript
import { marketAPI } from '../lib/api';
```

| Method | Parameters | Description |
|--------|------------|-------------|
| `getIndices()` | - | Get market indices (Nifty, Sensex) |
| `getStats()` | - | Get market statistics |

**Example:**
```javascript
const indices = await marketAPI.getIndices();
// { nifty50: {...}, sensex: {...}, sectors: {...} }
```

---

### transcriptAPI

Earnings call transcript API calls.

```javascript
import { transcriptAPI } from '../lib/api';
```

| Method | Parameters | Description |
|--------|------------|-------------|
| `getTranscripts(symbol)` | `string` | Get available transcripts |
| `analyzeTranscript(symbol, attachmentName)` | `string, string` | Analyze transcript with AI |

**Example:**
```javascript
// Get transcripts
const transcripts = await transcriptAPI.getTranscripts('RELIANCE');

// Analyze specific transcript (long timeout: 200s)
const analysis = await transcriptAPI.analyzeTranscript('RELIANCE', 'Q1FY24.pdf');
```

---

### ordersAPI

Order and orderbook API calls.

```javascript
import { ordersAPI } from '../lib/api';
```

| Method | Parameters | Description |
|--------|------------|-------------|
| `getBySymbol(symbol, limit)` | `string, number` | Get orders |
| `getFullParsed(symbol, limit)` | `string, number` | Get parsed orders |
| `parsePdf(symbol, attachmentUrl)` | `string, string` | Parse PDF order |
| `getOrderbook(symbol)` | `string` | Get orderbook |

---

### upcomingResultsAPI

Upcoming results API calls.

```javascript
import { upcomingResultsAPI } from '../lib/api';
```

| Method | Parameters | Description |
|--------|------------|-------------|
| `getAll(page, limit)` | `number, number` | Get upcoming results |
| `getSymbols()` | - | Get symbols with upcoming results |

---

### announcementsAPI

Announcement API calls.

```javascript
import { announcementsAPI } from '../lib/api';
```

| Method | Parameters | Description |
|--------|------------|-------------|
| `getBySymbol(symbol)` | `string` | Get announcements for stock |

## Error Handling

```javascript
try {
  const response = await stockAPI.getDetails('RELIANCE');
  if (response.data.success) {
    // Handle success
  }
} catch (error) {
  if (error.response) {
    // Server responded with error
    console.error('API Error:', error.response.data);
  } else if (error.request) {
    // Network error
    console.error('Network Error:', error.message);
  }
}
```

## Timeout Configuration

Different endpoints have different timeout requirements:

| API Method | Timeout | Reason |
|------------|---------|--------|
| Default | 30s | Standard operations |
| `transcriptAPI.analyzeTranscript` | 200s | AI processing |
| `ordersAPI.getFullParsed` | 180s | PDF parsing |
| `ordersAPI.parsePdf` | 120s | Single PDF parsing |
| `ordersAPI.getOrderbook` | 300s | Full orderbook calculation |

## Usage in Components

```javascript
// components/stock/QuarterlyResults.js
import { stockAPI } from '../../lib/api';

function QuarterlyResults({ symbol }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await stockAPI.getQuarterlyResults(symbol);
        if (response.data.success) {
          setData(response.data.data);
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [symbol]);
}
```

## Related Documentation

- [API Reference](../../API_REFERENCE.md) - Backend API documentation
- [useMarket Hook](../hooks/useMarket.md) - Market data hook
- [useWatchlist Hook](../hooks/useWatchlist.md) - Watchlist hook

