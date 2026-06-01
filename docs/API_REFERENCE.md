# API Reference

> **Document Type**: API Documentation  
> **Base URL**: `http://localhost:5000/api`  
> **Code Reference**: `backend/routes/`, `backend/controllers/`  
> **Shared Modules**: `backend/utils/nseHelpers.js` (NSE utilities), `backend/api/geminiClient.js` (AI client)  
> **Last Updated**: 2026-01-02

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
- Uses NSE India autocomplete via `backend/api/nseIndiaApi.js` (`searchAutocomplete`, cookie session); database fallback on failure

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

**Note:** Stock details returns ROCE/debt-style metrics only from **cached** quarterly results in MongoDB. It does **not** run NSE quarterly XBRL ingestion (that path is used by `GET /api/stocks/{symbol}/quarterly`), so the endpoint stays responsive for newly listed symbols.

**Note:** `Stock` documents are **not** TTL-expired in the schema (older DBs may still have a `created_at` TTL index — drop it if rows disappear after a few days). BSE peer search uses a timeout and uppercase symbol matching; if BSE fails, the server persists the row from the NSE quote only.

**Code Reference:**
- Function: `getStockDetails()` in `backend/controllers/stockController.js`
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
> **Controller**: `backend/controllers/ordersController.js`  
> **Service**: `backend/services/ordersService.js`  
> **Shared Modules**: `backend/utils/nseHelpers.js` (NSE utilities), `backend/api/geminiClient.js` (AI client)

### Get Orders by Symbol (Non-AI Mode)

**NEW**: Fetch raw order announcements without AI processing. This is the default mode for fast, cost-effective access to order announcements.

```http
GET /api/orders/{symbol}?limit={number}
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `symbol` | string | Yes | - | Stock symbol |
| `limit` | number | No | 50 | Maximum number of orders to return |

**Response:**
```json
{
  "success": true,
  "data": {
    "symbol": "LTIM",
    "total_orders": 10,
    "orders": [
      {
        "id": "17-Nov-2025 13:55:52-106447414",
        "announcement_date": "2025-11-17",
        "subject": "Order Announcement",
        "description": "Bagging/Receiving of orders/contracts",
        "attachment_url": "https://nsearchives.nseindia.com/corporate/...",
        "attachment_text": "LTIMindtree Limited has informed...",
        "company_name": "LTIMindtree Limited",
        "order_details": null,
        "pdf_parsed": false,
        "parsing_error": null
      }
    ],
    "baseline_document_url": null,
    "baseline_document_title": null,
    "mode": "non-ai"
  }
}
```

**Features:**
- ⚡ Fast response (no AI processing)
- 💰 No API costs
- 📄 Direct PDF links
- 🔍 Filters NSE announcements for order-related subjects

### Get Orders with Full AI Parsing

Fetch and parse all order announcements using Gemini AI.

```http
GET /api/orders/{symbol}/full?limit={number}
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `symbol` | string | Yes | - | Stock symbol |
| `limit` | number | No | 20 | Maximum number of orders (max: 30) |

**Response:**
```json
{
  "success": true,
  "data": {
    "symbol": "LTIM",
    "total_orders": 20,
    "orders_with_parsed_values": 15,
    "total_order_value_crores": 1234.56,
    "orders": [
      {
        "id": "...",
        "announcement_date": "2025-11-17",
        "order_details": {
          "order_value": {
            "value_in_crore_inr": 123.45,
            "currency": "INR",
            "unit": "Crore"
          },
          "customer_name": "Global Tech Corp",
          "customer_type": "Private",
          "order_type": "New Contract",
          "project_description": "Digital transformation project...",
          "timeline": "24 months"
        },
        "pdf_parsed": true,
        "confidence_score": 0.95,
        "from_cache": true,
        "parse_time_ms": 50
      }
    ],
    "timing": {
      "total_request_time_ms": 2500,
      "nse_fetch_time_ms": 300,
      "pdf_parsing_time_ms": 2200,
      "average_parse_time_ms": 110
    },
    "cache_stats": {
      "cache_hits": 18,
      "cache_misses": 2,
      "cache_hit_rate": 90
    }
  }
}
```

**Code Reference:**
- Controller: `backend/controllers/ordersController.js`
- AI Parser: `backend/api/orderParser.js:parseOrderFromPdf()`
- Shared AI Client: `backend/api/geminiClient.js:parsePdfWithGemini()`
- Prompt: `backend/prompts/order_extraction.txt`

### Parse Individual PDF

Parse a specific order announcement PDF.

```http
POST /api/orders/{symbol}/parse-pdf
```

**Request Body:**
```json
{
  "attachmentUrl": "https://nsearchives.nseindia.com/corporate/..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "symbol": "LTIM",
    "attachment_url": "...",
    "parsed_data": {
      "extraction_success": true,
      "confidence_score": 0.92,
      "order_details": {
        "order_value": { "value_in_crore_inr": 123.45 },
        "customer_name": "...",
        "project_description": "..."
      }
    }
  }
}
```

### Get Orderbook

Get accumulated order book with baseline from annual reports + new orders.

```http
GET /api/orders/{symbol}/orderbook
```

**Response:**
```json
{
  "success": true,
  "data": {
    "symbol": "RELIANCE",
    "orderbook_summary": {
      "baseline_order_book_crores": 5000,
      "baseline_as_of_date": "2024-12-31",
      "baseline_reporting_period": "Q3 FY24",
      "baseline_source": "Investor Presentation",
      "baseline_document": "Q3 FY24 Results Presentation",
      "new_orders_since_baseline_crores": 500,
      "new_orders_count": 5,
      "accumulated_order_book_crores": 5500,
      "calculation_note": "Accumulated = Baseline + New Orders. Does not subtract executed orders."
    },
    "order_inflow": {
      "period": "Q3 FY24",
      "value_crores": 800
    },
    "order_book_commentary": "Strong order intake in defense sector...",
    "segment_breakdown": [
      {
        "segment_name": "Defense",
        "value_crores": 3000
      },
      {
        "segment_name": "Infrastructure",
        "value_crores": 2000
      }
    ],
    "new_orders": [
      // Array of parsed order announcements
    ],
    "timing": { "total_request_time_ms": 5000 },
    "cache_stats": {
      "cache_hits": 5,
      "cache_misses": 0,
      "cache_hit_rate": 100,
      "baseline_from_cache": true
    }
  }
}
```

**Code Reference:**
- Controller: `backend/controllers/ordersController.js`
- Baseline Parser: `backend/api/orderbookBaselineParser.js:getOrderbookBaseline()`
- Shared AI Client: `backend/api/geminiClient.js:parsePdfWithGemini()`
- NSE Helpers: `backend/utils/nseHelpers.js` (date parsing, headers)
- Prompt: `backend/prompts/orderbook_baseline.txt`

### Download All Order PDFs (ZIP)

```http
POST /api/orders/{symbol}/download-all
```

**Request Body:** `{ "limit": "100" }` (optional, default 100)

**Response:** ZIP file attachment with all order PDFs.

### Download Order PDFs to Desktop

```http
POST /api/orders/{symbol}/download-direct
```

**Request Body:** `{ "limit": "100", "transcriptUrl": null, "quarterStartDate": null, "transcriptDate": null }`

**Response:** JSON with `folder_path`, `downloaded`, `files`. Saves to Desktop/Stock_Data.

### Get Quarters (Last 8)

```http
GET /api/orders/{symbol}/quarters
```

**Response:** JSON with `quarters` array (orders and transcripts grouped by fiscal quarter).

### Download Quarter PDFs

```http
POST /api/orders/{symbol}/download-quarter
```

**Request Body:** `{ "quarter": 1, "fiscalYear": 2025, "orders": [], "transcripts": [] }`

**Response:** JSON with `folder_path`, `downloaded`, `files`. Saves to Desktop/Stock_Data.

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
- Shared AI Client: `backend/api/geminiClient.js:parsePdfWithGemini()`
- Prompt: `backend/prompts/earning_call.txt`

---

## Declared Results APIs

> **Route File**: `backend/routes/declaredResults.js`  
> **Controller**: `backend/controllers/declaredResultsController.js`

Get declared quarterly results from companies with financial data, growth metrics, and document links.

### Get Declared Results

Fetch declared quarterly results with filtering and pagination.

```http
POST /api/declared-results
```

**Request Body:**
```json
{
  "marketCapMin": 1000,
  "index": ["Nifty 50"],
  "industry": ["Banking", "IT"],
  "order": "desc",
  "orderBy": "Last Result Date",
  "offset": 0,
  "resultDate": "2026-01-31",
  "searchCompany": "reliance",
  "documentType": "Transcript Notes"
}
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `marketCapMin` | number | No | 1000 | Minimum market cap in Cr |
| `index` | array | No | [] | Filter by indices (Nifty 50, etc.) |
| `industry` | array | No | [] | Filter by industries |
| `order` | string | No | "desc" | Sort order (asc/desc) |
| `orderBy` | string | No | "Last Result Date" | Sort field |
| `offset` | number | No | 0 | Pagination offset |
| `resultDate` | string | No | "" | Filter by specific result date |
| `searchCompany` | string | No | "" | Search company by name |
| `documentType` | string | No | "Transcript Notes" | Document type filter |

**Response:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "companyId": "NSE:SIRCA",
        "exchange": "NSE",
        "symbol": "SIRCA",
        "name": "Sirca Paints India Ltd",
        "lastResultDate": "2026-01-31",
        "priceToEarnings": 44.22,
        "marketCap": 2634.33,
        "fundamentalsSource": "C",
        "dataSource": "Consolidated",
        "hasConsolidated": true,
        "hasStandalone": true,
        "consolidatedData": [
          ["", "202412", "202509", "202512", "Growth QoQ", "Growth YoY"],
          ["Revenue", 88.65, 131.17, 112.79, -14.01, 27.23],
          ["Operating Profit", 15.45, 27.4, 23.01, -16.02, 48.93],
          ["OPM", 17.43, 20.89, 20.4, null, null],
          ["PAT", 11.46, 18.1, 15.03, -16.96, 31.15],
          ["NPM", 12.93, 13.8, 13.33, null, null],
          ["EPS", 2.09, 3.24, 2.69, -16.98, 28.71]
        ],
        "standaloneData": [...],
        "documents": [
          {
            "date": "202512",
            "documentType": "PPT",
            "ssUrl": "idq7d6x6un4nz5ognka15d14.pdf",
            "hasNotes": false,
            "fullUrl": "https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/idq7d6x6un4nz5ognka15d14.pdf",
            "notesUrl": null
          },
          {
            "date": "202512",
            "documentType": "Transcript",
            "ssUrl": "c0ibtrj30q6tu09mb105bqmg.pdf",
            "hasNotes": true,
            "fullUrl": "https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/c0ibtrj30q6tu09mb105bqmg.pdf",
            "notesUrl": "https://www.stockscans.in/api/company/get-concall-notes/NSE:SIRCA/c0ibtrj30q6tu09mb105bqmg.pdf"
          }
        ]
      }
    ],
    "pagination": {
      "total": 171,
      "start": 1,
      "end": 20,
      "offset": 0
    },
    "quarterDate": "202512",
    "resultDates": ["2026-01-31", "2026-01-29", "2026-01-28"],
    "order": "desc",
    "orderBy": "Last Result Date"
  }
}
```

**Financial Data Fields:**
- Revenue, Operating Profit, OPM % (Operating Profit Margin)
- PAT (Profit After Tax), NPM % (Net Profit Margin), EPS
- QoQ Growth (Quarter on Quarter)
- YoY Growth (Year on Year)

**Document Types:**
- `Result` - Financial result filings
- `PPT` - Investor presentation
- `Transcript` - Earnings call transcript
- `Transcript Notes` - AI-generated notes from transcript

**Code Reference:**
- Function: `getDeclaredResults()` in `backend/controllers/declaredResultsController.js`
- Proxies data from StockScans API

---

### Get Filter Options

Get available filter options for the results dashboard.

```http
GET /api/declared-results/filters
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sortOptions": [
      { "value": "Last Result Date", "label": "Result Date" },
      { "value": "Market Capitalization", "label": "Market Cap" },
      { "value": "Price To Earnings", "label": "P/E Ratio" }
    ],
    "documentTypes": [
      { "value": "Transcript Notes", "label": "Transcript Notes" },
      { "value": "Transcript", "label": "Transcript" },
      { "value": "Result", "label": "Result" },
      { "value": "PPT", "label": "Investor Presentation" }
    ],
    "indices": [
      { "value": "Nifty 50", "label": "Nifty 50" },
      { "value": "Nifty Next 50", "label": "Nifty Next 50" }
    ],
    "industries": [
      { "value": "Information Technology", "label": "IT" },
      { "value": "Banking", "label": "Banking" }
    ]
  }
}
```

**Code Reference:**
- Function: `getFilterOptions()` in `backend/controllers/declaredResultsController.js`

---

### Download Transcript Notes

Download transcript notes for all companies in a quarter. This endpoint authenticates with StockScans using environment credentials and downloads AI-generated notes to the server filesystem.

```http
POST /api/declared-results/download-notes
```

**Request Body:**
```json
{
  "quarterDate": "Dec 2025",
  "companyIds": [
    {
      "companyId": "NSE:SIRCA",
      "symbol": "SIRCA",
      "name": "Sirca Paints India Ltd",
      "notesUrl": "https://www.stockscans.in/api/company/get-concall-notes/NSE:SIRCA/transcript.pdf"
    }
  ]
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `quarterDate` | string | Yes | Quarter name (e.g., "Dec 2025") |
| `companyIds` | array | Yes | Array of company data with notesUrl |

**Response:**
```json
{
  "success": true,
  "data": {
    "quarterDate": "Dec 2025",
    "downloadDir": "/path/to/stockmarket/downloads/Dec 2025",
    "totalCompanies": 45,
    "successCount": 43,
    "errorCount": 2,
    "results": [
      {
        "companyId": "NSE:SIRCA",
        "symbol": "SIRCA",
        "name": "Sirca Paints India Ltd",
        "success": true,
        "filePath": "/path/to/downloads/Dec 2025/SIRCA_NSE_SIRCA_notes.json",
        "fileName": "SIRCA_NSE_SIRCA_notes.json"
      },
      {
        "companyId": "NSE:EXAMPLE",
        "symbol": "EXAMPLE",
        "name": "Example Corp",
        "success": false,
        "error": "HTTP 404: Not Found"
      }
    ]
  }
}
```

**Authentication:**
- Uses `GMAIL` and `PASSWORD` environment variables
- Authenticates with StockScans API before downloading
- Returns 401 if authentication fails
- Returns 500 if credentials not configured

**File Storage:**
- Downloads to: `<repo_root>/downloads/<quarter-name>/`
- Filename format: `{SYMBOL}_{EXCHANGE}_{COMPANY_ID}_notes.json`
- Files are JSON containing AI-generated transcript notes

**Code Reference:**
- Function: `downloadTranscriptNotes()` in `backend/controllers/declaredResultsController.js`
- Auth Service: `backend/services/stockscansAuth.js`

**Related:**
- See `loginToStockScans()` in `backend/services/stockscansAuth.js` for authentication flow
- Frontend implementation in `frontend/pages/results.js` (handleDownloadAllNotes)

---

## Announcements APIs

> **Route File**: `backend/routes/announcements.js`  
> **Controller**: `backend/controllers/announcementsController.js`  
> **Upstream**: StockScans `POST /api/company/announcements/search` (proxied server-side)  
> **Auth**: Set `STOCKSCANS_AUTH_TOKEN` in backend `.env` (same JWT as the `authtoken` cookie on stockscans.in)

### Get Announcements by Symbol

```http
GET /api/announcements/{symbol}?search={optional}&offset={optional}&provider={optional}
```

| Query | Description |
|-------|-------------|
| `search` | Optional. StockScans requires at least 3 characters; shorter or omitted values use a broad default search on the server (`report`). |
| `offset` | Pagination offset (default `0`). |
| `provider` | Optional. `stockscans` — StockScans only (no NSE fallback; returns **502**/**503** on failure). `nse` — NSE `corporate-announcements` only. Omit or `auto` — if `STOCKSCANS_AUTH_TOKEN` is set, try StockScans first; on failure fall back to NSE (legacy behavior). The UI sends an explicit `provider` so users are not silently switched when they chose StockScans. |

**Providers:** `meta.provider` is `"stockscans"` or `"nse"` for successful responses. For `provider=stockscans`, errors return JSON with `success: false` and `meta.provider: "stockscans"` (no NSE data in the same response).

**Response (StockScans):**
```json
{
  "success": true,
  "data": [
    {
      "subject": "Board Meeting",
      "desc": "Notice text (plain)",
      "an_dt": "15-Jun-2024 00:00:00",
      "attchmntFile": "https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/....pdf",
      "attchmntText": null,
      "source": "stockscans",
      "companyId": "NSE:SYMBOL"
    }
  ],
  "meta": {
    "offset": 0,
    "limit": 30,
    "search": "Ltd",
    "companyId": "NSE:SYMBOL",
    "requestedSearch": null,
    "provider": "stockscans"
  }
}
```

**Response (NSE fallback):** Same `success` / `data` shape as raw NSE API array items (`subject`, `desc`, `an_dt`, `attchmntFile`, …). `meta.provider` is `"nse"` and may include a `note` explaining fallback.

**Errors (`provider=stockscans`, HTTP 502/503):** JSON includes `success: false`, `error` (message), optional `code`, and `meta.provider: "stockscans"`. Common `code` values from the StockScans client:

| `code` | Meaning |
|--------|---------|
| `STOCKSCANS_AUTH_REQUIRED` | Backend has no `STOCKSCANS_AUTH_TOKEN` |
| `STOCKSCANS_BAD_COMPANY` | Upstream HTTP 5xx with a generic/empty body — often **unknown `companyId`** on StockScans (not a JWT problem) |
| `STOCKSCANS_HTTP_ERROR` | Other HTTP errors (e.g. auth401/403, or 5xx with a specific upstream message) |
| `STOCKSCANS_API_ERROR` | JSON body `status: "error"` from StockScans |

**Code Reference:**
- Function: `getAnnouncements()` in `backend/controllers/announcementsController.js`
- Client: `backend/services/stockscansAnnouncements.js`
- PDF ZIP download uses public S3 URLs for StockScans attachments; NSE headers are still used for legacy NSE PDF URLs if present.

### Download announcement PDFs (ZIP)

```http
POST /api/announcements/{symbol}/download
Content-Type: application/json
```

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `announcements` | `Array<{ url, subject?, date? }>` | Yes | PDF URLs and metadata for each file |
| `search` | string | No | Current search query; when present, included in the ZIP attachment filename (sanitized) |

**Response:** `application/zip` stream. Filename pattern: `{SYMBOL}_announcements_{optionalSearch}_{YYYY-MM-DD}.zip` (search segment omitted when `search` is empty).

**Code Reference:** `downloadAnnouncements()` in `backend/controllers/announcementsController.js`

### Download latest concall transcripts (ZIP)

```http
POST /api/announcements/concalls/download
Content-Type: application/json
```

1. Load saved scan definition from `GET https://www.stockscans.in/scans/saved/{scanId}` (embedded in page HTML).
2. Run `POST https://www.stockscans.in/api/company/scans/run` with that scan (paginated) to collect `companyId` values.
3. For each company, fetch the latest **Earnings Call** via `POST /api/company/announcements/scan` (batched at 10 `companyFilters` per request — StockScans API limit), build PDF URLs from `ssUrl`, and stream a ZIP. Also saved under repo `downloads/`.

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scanUrl` | string | Yes | Saved scan link, e.g. `https://www.stockscans.in/scans/saved/c29a98ebbb568f073162ba24`, or bare scan id |
| `quarterDate` | string | No | StockScans quarter key `YYYYMM` (e.g. `202603`). Defaults to current quarter; walks back up to 4 quarters for companies missing in the first announcement scan |

**Response:** `application/zip` — filename `concalls_{quarterDate}_{YYYY-MM-DD}.zip`. Header `X-Concall-Missing` lists company ids with no transcript found (comma-separated). Header `X-Saved-To-Repo` gives the repo-relative path when written to disk.

**Errors:** **400** invalid/missing `scanUrl`; **404** empty scan or no PDFs; **503** when `STOCKSCANS_AUTH_TOKEN` is missing.

**Code Reference:**
- `downloadLatestConcalls()` in `backend/controllers/announcementsController.js`
- `fetchCompanyIdsFromSavedScanUrl()` in `backend/services/stockscansSavedScan.js`
- `resolveLatestEarningsCalls()` in `backend/services/stockscansAnnouncementScan.js`

---

## Admin APIs

> **Route File**: `backend/routes/admin.js`  
> **Controller**: `backend/controllers/adminController.js`  
> **Model**: `backend/models/ModelResponse.js` (cache storage)

### Trigger Data Update

```http
GET /api/admin/data/update
```

**Response:**
```json
{
  "success": true,
  "message": "Data update initiated",
  "note": "Run the scripts/updateData.js script manually for now"
}
```

**Code Reference:**
- Function: `triggerDataUpdate()` in `backend/controllers/adminController.js`

### Clear Orderbook Cache

Clear AI model cache for order book parsing. If symbol provided, clears cache for that symbol only. If no symbol, clears all orderbook-related cache.

```http
DELETE /api/admin/cache/orderbook
DELETE /api/admin/cache/orderbook/{symbol}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | No | Stock symbol - if provided, clears cache for that symbol only |

**Response:**
```json
{
  "success": true,
  "message": "Cleared 5 cached responses for RELIANCE",
  "deletedCount": 5
}
```

**Code Reference:**
- Function: `clearOrderbookCache()` in `backend/controllers/adminController.js`
- Model: `backend/models/ModelResponse.js`

---

## X (Twitter) APIs

> **Route File**: `backend/routes/twitter.js`  
> **Controller**: `backend/controllers/twitterController.js`

Exports tweets for a public handle within a UTC lookback window using [X API v2](https://developer.twitter.com/en/docs/twitter-api) on the server. Requires a **Bearer token** with access to user lookup and user tweets.

### Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `TWITTER_BEARER_TOKEN` | Yes* | OAuth 2.0 Bearer token from the X developer portal |
| `X_BEARER_TOKEN` | Yes* | Alias for `TWITTER_BEARER_TOKEN` if the former is unset |

\*If neither is set, the endpoint returns `503` with configuration instructions.

### Fetch tweets for JSON download

```http
POST /api/twitter/fetch-tweets
Content-Type: application/json
```

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `handle` | string | Yes | Username without or with `@`; leading `@` is stripped |
| `intervalDays` | number | Yes | Lookback length in days (`1`–`365`); tweets from `now - intervalDays` through `now` (UTC) |

**Success response:**

```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "username": "...", "name": "..." },
    "tweets": [ { "id": "...", "text": "...", "created_at": "..." } ],
    "includes": { "users": [] },
    "query": {
      "handle": "example",
      "intervalDays": 7,
      "start_time": "...",
      "end_time": "..."
    },
    "meta": {
      "tweetCount": 42,
      "pagesFetched": 1
    }
  }
}
```

The dashboard **Tweet Downloader** posts to this route and saves `data` as a prettified `.json` file in the browser.

**Code reference:** `fetchTweetsForDownload()` in `backend/controllers/twitterController.js`

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

