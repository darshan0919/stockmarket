# API Reference

> **Document Type**: API Documentation  
> **Base URL**: `http://localhost:5000/api`  
> **Code Reference**: `backend/routes/`, `backend/controllers/`  
> **Last Updated**: 2024-12-31

## Overview

All API endpoints return JSON responses with the following structure:

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```

Error responses:
```json
{
  "success": false,
  "error": "Error description"
}
```

---

## Stock APIs

> **Route File**: `backend/routes/stocks.js`  
> **Controller**: `backend/controllers/stockController.js`

### Search Stocks

Search for stocks by symbol or company name.

```http
GET /api/stocks/search?q={query}&page={page}&limit={limit}
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `q` | string | Yes | - | Search query (min 1 char) |
| `page` | number | No | 1 | Page number |
| `limit` | number | No | 10 | Results per page |

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "name": "Reliance Industries Limited",
      "symbol": "RELIANCE",
      "exchange": "NSE",
      "sector": null,
      "industry": null,
      "current_price": null,
      "change_percent": null
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 10
}
```

**Code Reference:**
- Function: `searchStocks()` in `backend/controllers/stockController.js:19-134`
- Uses NSE India autocomplete API with database fallback

---

### Get Stock Details

Get comprehensive stock information.

```http
GET /api/stocks/{symbol}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | Yes | Stock symbol (e.g., RELIANCE) |

**Response:**
```json
{
  "success": true,
  "data": {
    "basic_info": {
      "symbol": "RELIANCE",
      "name": "Reliance Industries Limited",
      "sector": "Energy",
      "industry": "Oil & Gas",
      "isin": "INE002A01018",
      "face_value": 10
    },
    "price_info": {
      "current_price": 2450.50,
      "change": 25.30,
      "change_percent": 1.04,
      "open": 2425.00,
      "high": 2460.00,
      "low": 2420.00,
      "volume": 5000000
    },
    "fundamentals": {
      "market_cap": 16500000000000,
      "pe_ratio": 25.5,
      "pb_ratio": 2.1,
      "roe": 12.5,
      "eps": 96.08
    },
    "price_history_5y": [
      {
        "date": "2024-01-01",
        "close": 2400.00
      }
    ]
  }
}
```

**Code Reference:**
- Function: `getStockDetails()` in `backend/controllers/stockController.js:140-163`
- Uses `backend/scripts/stockDetailsFetcher.js`

---

### Get Quarterly Results

Get quarterly financial results with XBRL parsing.

```http
GET /api/stocks/{symbol}/quarterly?force_refresh={boolean}
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `symbol` | string | Yes | - | Stock symbol |
| `force_refresh` | boolean | No | false | Bypass cache and fetch fresh data |

**Response:**
```json
{
  "success": true,
  "data": {
    "symbol": "RELIANCE",
    "quarters": [
      {
        "period": "Q1 FY2024",
        "quarter": 1,
        "fiscal_year": 2024,
        "to_date": "2024-06-30",
        "from_date": "2024-04-01",
        "sales": 232850,
        "expenses": 210500,
        "operating_profit": 22350,
        "opm_percent": 9.6,
        "other_income": 2500,
        "interest": 3500,
        "depreciation": 8500,
        "pbt": 12850,
        "tax_percent": 25.0,
        "net_profit": 9637,
        "eps": 14.42,
        "audited": true,
        "consolidated": true,
        "yoy_sales_growth": 12.5,
        "yoy_profit_growth": 8.2,
        "qoq_sales_growth": 3.1,
        "qoq_profit_growth": 2.5
      }
    ],
    "source": "Database Cache (NSE India)",
    "cached": true
  }
}
```

**Code Reference:**
- Function: `getQuarterlyResults()` in `backend/controllers/stockController.js:448-544`
- Helper: `calculateGrowthMetrics()` at line 285-383
- Helper: `formatQuarterForResponse()` at line 388-442
- Data Fetcher: `backend/scripts/balanceSheetDataFetcher.js`

---

### Get Stock Technicals

Get technical indicators for a stock.

```http
GET /api/stocks/{symbol}/technicals
```

**Response:**
```json
{
  "success": true,
  "data": {
    "current_price": 2450.50,
    "sma_50": 2380.25,
    "sma_200": 2250.00,
    "rsi_14": 65.5,
    "macd": {
      "macd": 15.2,
      "signal": 12.8,
      "histogram": 2.4
    }
  }
}
```

**Code Reference:**
- Function: `getStockTechnicals()` in `backend/controllers/stockController.js:169-219`
- Calculations: `backend/utils/technicalIndicators.js`

---

### Get Stock Financials

Get annual financial statements.

```http
GET /api/stocks/{symbol}/financials?quarters={number}
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `quarters` | number | No | 4 | Number of periods to return |

**Response:**
```json
{
  "success": true,
  "data": {
    "p_and_l": [
      {
        "period": "Q1 FY2024",
        "revenue": 232850,
        "gross_profit": 45000,
        "operating_profit": 22350,
        "ebitda": 30850,
        "net_profit": 9637
      }
    ],
    "balance_sheet": [
      {
        "period": "Q1 FY2024",
        "total_assets": 1500000,
        "total_liabilities": 800000,
        "shareholders_equity": 700000,
        "total_debt": 300000,
        "current_assets": 200000,
        "current_liabilities": 150000
      }
    ]
  }
}
```

**Code Reference:**
- Function: `getStockFinancials()` in `backend/controllers/stockController.js:225-278`

---

## Screener APIs

> **Route File**: `backend/routes/screener.js`  
> **Controller**: `backend/controllers/screenerController.js`

### Run Screener

Filter stocks based on fundamental and market criteria.

```http
POST /api/screener/run
```

**Request Body:**
```json
{
  "filters": {
    "market_cap_min": 10000000000,
    "market_cap_max": 1000000000000,
    "sectors": ["Technology", "Finance"],
    "pe_min": 0,
    "pe_max": 30,
    "pb_min": 0,
    "pb_max": 5,
    "roe_min": 15,
    "roce_min": 12,
    "debt_to_equity_max": 1,
    "revenue_growth_3y_min": 10,
    "profit_growth_3y_min": 10,
    "dividend_yield_min": 1,
    "current_ratio_min": 1.5
  },
  "sort_by": "market_cap",
  "sort_order": "desc",
  "limit": 100
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "60a7...",
      "symbol": "INFY",
      "name": "Infosys Limited",
      "sector": "Technology",
      "industry": "IT Services",
      "market_cap": 6500000000000,
      "pe_ratio": 22.5,
      "pb_ratio": 8.2,
      "roe": 28.5,
      "roce": 35.2,
      "debt_to_equity": 0.1,
      "revenue_growth_3y": 12.5,
      "profit_growth_3y": 15.2,
      "dividend_yield": 2.5,
      "current_ratio": 2.8
    }
  ],
  "count": 25,
  "total": 25
}
```

**Code Reference:**
- Function: `runScreener()` in `backend/controllers/screenerController.js:8-150`
- Validation: `backend/utils/validators.js:screenerFiltersSchema`

---

## Watchlist APIs

> **Route File**: `backend/routes/watchlist.js`  
> **Controller**: `backend/controllers/watchlistController.js`

### Get Watchlist

```http
GET /api/watchlist
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "symbol": "RELIANCE",
      "added_at": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### Add to Watchlist

```http
POST /api/watchlist/{symbol}
```

**Response:**
```json
{
  "success": true,
  "message": "Stock added to watchlist"
}
```

### Remove from Watchlist

```http
DELETE /api/watchlist/{symbol}
```

**Response:**
```json
{
  "success": true,
  "message": "Stock removed from watchlist"
}
```

---

## Market APIs

> **Route File**: `backend/routes/market.js`  
> **Controller**: `backend/controllers/marketController.js`

### Get Market Indices

```http
GET /api/market/indices
```

**Response:**
```json
{
  "success": true,
  "data": {
    "nifty50": {
      "current": 19200.50,
      "change": 125.30,
      "change_percent": 0.65
    },
    "sensex": {
      "current": 62500.75,
      "change": 200.50,
      "change_percent": 0.32
    },
    "sectors": {
      "IT": 1.5,
      "Banking": -0.3,
      "Auto": 0.8
    }
  }
}
```

**Code Reference:**
- Function: `getMarketIndices()` in `backend/controllers/marketController.js:8-69`

### Get Market Stats

```http
GET /api/market/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_stocks": 2000,
    "total_sectors": 15
  }
}
```

---

## Upcoming Results APIs

> **Route File**: `backend/routes/upcomingResult.js`  
> **Controller**: `backend/controllers/upcomingResult.js`

### Get Upcoming Results

```http
GET /api/upcoming-results?page={page}&limit={limit}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "symbol": "INFY",
      "company_name": "Infosys Limited",
      "date": "2024-01-15",
      "purpose": "Quarterly Results"
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 10
}
```

**Code Reference:**
- Uses: `backend/api/nseIndiaApi.js:upcomingResults()`

---

## Orders APIs

> **Route File**: `backend/routes/orders.js`

### Get Orders by Symbol

```http
GET /api/orders/{symbol}?limit={number}
```

### Get Orderbook

```http
GET /api/orders/{symbol}/orderbook
```

**Response:**
```json
{
  "success": true,
  "data": {
    "symbol": "RELIANCE",
    "orders": [
      {
        "date": "2024-01-15",
        "order_type": "buy",
        "quantity": 1000,
        "price": 2450.00
      }
    ],
    "baseline": {
      "total_buy": 50000,
      "total_sell": 45000,
      "net_position": 5000
    }
  }
}
```

---

## Transcript APIs

> **Route File**: `backend/routes/resultTranscript.js`  
> **Controller**: `backend/controllers/resultTranscriptController.js`

### Get Transcripts

```http
GET /api/result-transcript/{symbol}
```

### Analyze Transcript

Analyze earnings call transcript using Gemini AI.

```http
POST /api/result-transcript/{symbol}/analyze
```

**Request Body:**
```json
{
  "attachmentName": "EarningsCall_Q1FY24.pdf"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "analysis": "Detailed AI analysis of the earnings call...",
    "key_points": ["Point 1", "Point 2"],
    "sentiment": "positive"
  }
}
```

**Code Reference:**
- AI Integration: `backend/api/geminiApi.js:geminiResultAnalysis()`
- Prompt: `backend/prompts/earning_call.txt`

---

## Announcements APIs

> **Route File**: `backend/routes/announcements.js`

### Get Announcements by Symbol

```http
GET /api/announcements/{symbol}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "headline": "Board Meeting Notice",
      "date": "2024-01-15",
      "category": "Board Meeting",
      "attachment": "Notice.pdf"
    }
  ]
}
```

---

## Error Codes

| HTTP Code | Description |
|-----------|-------------|
| 200 | Success |
| 400 | Bad Request - Invalid parameters |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error |

## Rate Limiting

Currently no rate limiting is implemented. For production:
- Recommended: 100 requests/minute per IP
- Consider using `express-rate-limit` package

## CORS

CORS is enabled for all origins in development. For production, configure specific origins in `backend/server.js`.

