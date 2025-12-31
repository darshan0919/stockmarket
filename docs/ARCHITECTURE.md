# System Architecture

> **Document Type**: Technical Architecture  
> **Code Reference**: Root project structure  
> **Last Updated**: 2024-12-31

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js)                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Pages     │  │  Components │  │    Hooks    │  │    API Client       │ │
│  │  /pages/*   │  │/components/*│  │ /lib/hooks  │  │    /lib/api.js      │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
│         └────────────────┴────────────────┴───────────────────┬┘            │
└────────────────────────────────────────────────────────────────┼────────────┘
                                                                 │ HTTP/REST
┌────────────────────────────────────────────────────────────────┼────────────┐
│                              BACKEND (Express.js)              │            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────┴──────────┐ │
│  │   Routes    │  │ Controllers │  │   Models    │  │    Middleware      │ │
│  │  /routes/*  │──▶│/controllers│──▶│  /models/*  │  │   /middleware/*    │ │
│  └─────────────┘  └──────┬──────┘  └──────┬──────┘  └────────────────────┘ │
│                          │                │                                 │
│  ┌─────────────┐  ┌──────┴──────┐  ┌──────┴──────┐  ┌────────────────────┐ │
│  │    Utils    │  │  External   │  │  Database   │  │     Scripts        │ │
│  │  /utils/*   │  │ APIs /api/* │  │   MongoDB   │  │    /scripts/*      │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│   NSE India   │      │   BSE India   │      │  Gemini AI    │
│     API       │      │     API       │      │     API       │
└───────────────┘      └───────────────┘      └───────────────┘
```

## Component Details

### Frontend Layer

#### Pages (`frontend/pages/`)
| File | Purpose | Route |
|------|---------|-------|
| `index.js` | Dashboard with market overview | `/` |
| `stock/[symbol].js` | Stock detail page | `/stock/:symbol` |
| `screener.js` | Stock screening tool | `/screener` |
| `watchlist.js` | User's watchlist | `/watchlist` |

#### Components (`frontend/components/`)

**Common Components** (`components/common/`):
| Component | File | Purpose |
|-----------|------|---------|
| `Header` | `Header.js` | Navigation header with search |
| `SearchBar` | `SearchBar.js` | Stock search with autocomplete |
| `Table` | `Table.js` | Generic data table |
| `Modal` | `Modal.js` | Modal dialog wrapper |
| `LoadingSpinner` | `LoadingSpinner.js` | Loading indicator |

**Stock Components** (`components/stock/`):
| Component | File | Purpose |
|-----------|------|---------|
| `StockHeader` | `StockHeader.js` | Stock title and price |
| `QuarterlyResults` | `QuarterlyResults.js` | Quarterly financial data |
| `BalanceSheet` | `BalanceSheet.js` | Balance sheet display |
| `CashFlows` | `CashFlows.js` | Cash flow statement |
| `ChartTab` | `ChartTab.js` | Price chart |
| `TechnicalTab` | `TechnicalTab.js` | Technical indicators |
| `FundamentalsTab` | `FundamentalsTab.js` | Fundamental metrics |
| `OrderBook` | `OrderBook.js` | Parsed orderbook data |
| `TranscriptTab` | `TranscriptTab.js` | Earnings call analysis |

#### API Client (`frontend/lib/api.js`)
Centralized Axios instance with interceptors:
- **stockAPI**: Stock search, details, financials
- **screenerAPI**: Stock screening
- **watchlistAPI**: Watchlist CRUD
- **marketAPI**: Market indices
- **transcriptAPI**: AI analysis
- **ordersAPI**: Orderbook data

#### Custom Hooks (`frontend/lib/hooks/`)
| Hook | File | Purpose |
|------|------|---------|
| `useMarket` | `useMarket.js` | Market data with auto-refresh |
| `useWatchlist` | `useWatchlist.js` | Watchlist state management |

### Backend Layer

#### Server Entry (`backend/server.js`)
Express server setup with:
- CORS configuration
- JSON body parsing
- Route mounting
- Error handling middleware

#### Routes (`backend/routes/`)
| Route File | Base Path | Purpose |
|------------|-----------|---------|
| `stocks.js` | `/api/stocks` | Stock operations |
| `screener.js` | `/api/screener` | Stock screening |
| `watchlist.js` | `/api/watchlist` | Watchlist management |
| `market.js` | `/api/market` | Market data |
| `orders.js` | `/api/orders` | Order/orderbook data |
| `announcements.js` | `/api/announcements` | Company announcements |
| `resultTranscript.js` | `/api/result-transcript` | AI transcript analysis |
| `upcomingResult.js` | `/api/upcoming-results` | Upcoming result dates |
| `admin.js` | `/api/admin` | Admin operations |

#### Controllers (`backend/controllers/`)
| Controller | File | Key Functions |
|------------|------|---------------|
| `stockController` | `stockController.js` | `searchStocks`, `getStockDetails`, `getQuarterlyResults` |
| `screenerController` | `screenerController.js` | `runScreener` |
| `watchlistController` | `watchlistController.js` | `getWatchlist`, `addToWatchlist`, `removeFromWatchlist` |
| `marketController` | `marketController.js` | `getMarketIndices`, `getMarketStats` |
| `resultTranscriptController` | `resultTranscriptController.js` | `getTranscripts`, `analyzeTranscript` |
| `upcomingResult` | `upcomingResult.js` | `getUpcomingResults` |

#### Models (`backend/models/`)
MongoDB schemas using Mongoose:

| Model | File | Purpose |
|-------|------|---------|
| `Stock` | `Stock.js` | Stock basic info (symbol, name, sector) |
| `QuarterlyResult` | `QuarterlyResult.js` | Quarterly financial results |
| `FinancialStatement` | `FinancialStatement.js` | Annual financial statements |
| `PriceHistory` | `PriceHistory.js` | Historical price data |
| `Fundamental` | `Fundamental.js` | Fundamental metrics |
| `Watchlist` | `Watchlist.js` | User watchlist entries |
| `Orderbook` | `Orderbook.js` | Parsed orderbook data |
| `ModelResponse` | `ModelResponse.js` | Cached AI responses |

#### External APIs (`backend/api/`)
| API Module | File | External Service |
|------------|------|------------------|
| `nseIndiaApi` | `nseIndiaApi.js` | NSE India (upcoming results, cookies) |
| `bseIndiaApi` | `bseIndiaApi.js` | BSE India (scrip codes, announcements) |
| `geminiApi` | `geminiApi.js` | Google Gemini AI (transcript analysis) |
| `orderParser` | `orderParser.js` | PDF order parsing |
| `orderbookBaselineParser` | `orderbookBaselineParser.js` | Orderbook baseline calculation |

#### Utilities (`backend/utils/`)
| Utility | File | Functions |
|---------|------|-----------|
| `technicalIndicators` | `technicalIndicators.js` | `calculateSMA`, `calculateEMA`, `calculateRSI`, `calculateMACD` |
| `validators` | `validators.js` | Joi schemas for request validation |
| `dataFetcher` | `dataFetcher.js` | Alpha Vantage and FMP API calls |
| `xbrlParser` | `xbrlParser.js` | XBRL financial data parsing |

### Data Flow Examples

#### 1. Stock Search Flow
```
User types → SearchBar → stockAPI.search() → /api/stocks/search
                                                    ↓
                                           stockController.searchStocks()
                                                    ↓
                                           NSE India autocomplete API
                                                    ↓
                                           Filtered equity results → UI
```

#### 2. Quarterly Results Flow
```
Stock page loads → QuarterlyResults → stockAPI.getQuarterlyResults()
                                                    ↓
                                           /api/stocks/:symbol/quarterly
                                                    ↓
                                           Check MongoDB cache
                                                    ↓
                                    If stale: NSE XBRL API → Parse → Store
                                                    ↓
                                           Calculate YoY/QoQ growth
                                                    ↓
                                           Return formatted data → UI
```

#### 3. AI Transcript Analysis Flow
```
User clicks analyze → TranscriptTab → transcriptAPI.analyzeTranscript()
                                                    ↓
                                           /api/result-transcript/:symbol/analyze
                                                    ↓
                                           Check ModelResponse cache
                                                    ↓
                                    If not cached: geminiApi.geminiResultAnalysis()
                                                    ↓
                                           Gemini API → Parse response
                                                    ↓
                                           Cache in ModelResponse → Return → UI
```

## Database Schema Overview

```
┌──────────────────┐     ┌──────────────────┐
│      Stock       │     │ QuarterlyResult  │
├──────────────────┤     ├──────────────────┤
│ symbol (unique)  │◄────│ symbol           │
│ name             │     │ period           │
│ sector           │     │ fiscal_year      │
│ industry         │     │ quarter          │
│ market_cap       │     │ revenue          │
│ isin             │     │ net_profit       │
└────────┬─────────┘     │ eps_basic        │
         │               └──────────────────┘
         │
         │ 1:N
         ▼
┌──────────────────┐     ┌──────────────────┐
│   PriceHistory   │     │   Fundamental    │
├──────────────────┤     ├──────────────────┤
│ stock_id (ref)   │     │ stock_id (ref)   │
│ date             │     │ date             │
│ open/high/low    │     │ pe_ratio         │
│ close            │     │ pb_ratio         │
│ volume           │     │ roe/roce         │
└──────────────────┘     └──────────────────┘

┌──────────────────┐     ┌──────────────────┐
│    Watchlist     │     │  ModelResponse   │
├──────────────────┤     ├──────────────────┤
│ symbol           │     │ attachment_name  │
│ added_at         │     │ prompt (hash)    │
└──────────────────┘     │ response         │
                         └──────────────────┘
```

## External API Integration

### NSE India API
- **Base URL**: `https://www.nseindia.com/api`
- **Authentication**: Cookie-based (session cookies required)
- **Rate Limiting**: Aggressive, requires proper headers
- **Key Endpoints**:
  - `/search/autocomplete` - Stock search
  - `/event-calendar` - Upcoming results
  - `/corporates` - Financial filings

### BSE India API
- **Base URL**: `https://api.bseindia.com/BseIndiaAPI/api`
- **Authentication**: Referer header required
- **Key Endpoints**:
  - `/PeerSmartSearch` - Stock search
  - `/AnnSubCategoryGetData` - Announcements
  - `/Corpforthresults` - Upcoming results

### Gemini AI API
- **Base URL**: `https://generativelanguage.googleapis.com/v1beta`
- **Authentication**: API key
- **Usage**: Earnings call transcript analysis
- **Prompts**: Stored in `backend/prompts/`

## Error Handling

### Backend Error Middleware (`backend/middleware/errorHandler.js`)
- Catches all unhandled errors
- Returns consistent error format
- Logs errors for debugging

### Frontend Error Handling
- Axios interceptors for API errors
- Try-catch in async operations
- User-friendly error messages

## Caching Strategy

| Data Type | Cache Location | TTL | Invalidation |
|-----------|----------------|-----|--------------|
| Quarterly Results | MongoDB | 2 days | Manual refresh |
| AI Responses | MongoDB | Permanent | Never (immutable) |
| NSE Cookies | Memory | 5 minutes | Auto-refresh |
| Stock Details | None | N/A | Real-time fetch |

## Security Considerations

1. **API Keys**: Stored in environment variables
2. **CORS**: Configured for frontend origin
3. **Input Validation**: Joi schemas for all inputs
4. **Rate Limiting**: Recommended for production
5. **Error Sanitization**: No stack traces in production

