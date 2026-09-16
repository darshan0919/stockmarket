# System Architecture

> **Document Type**: Technical Architecture  
> **Code Reference**: Root project structure  
> **Last Updated**: 2026-09-16

This document covers the `screener-api` + `screener-web` web app specifically
— the smaller, secondary piece of the repo. The larger part of the system —
`skills/` (79+ equity-research Claude Agent Skills) and `jobs/Scheduled/`
running on the separate "Data Ecosystem v2" JSON-collection data layer — is
documented in `skills/README.md` and `docs/DATA_ECOSYSTEM.md`, not here.

## High-Level Architecture (screener-api / screener-web)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         screener-web (Next.js)                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Pages     │  │  Components │  │    Hooks    │  │    API Client       │ │
│  │  /pages/*   │  │/src/features│  │/src/core/lib│  │ /src/core/lib/api.js│ │
│  │             │  │  /*/components│  │  /hooks   │  │                     │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
│         └────────────────┴────────────────┴───────────────────┬┘            │
└────────────────────────────────────────────────────────────────┼────────────┘
                                                                 │ HTTP/REST
┌────────────────────────────────────────────────────────────────┼────────────┐
│                         screener-api (Express.js)               │            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────┴──────────┐ │
│  │   Routes    │  │ Controllers │  │   Models    │  │    Middleware      │ │
│  │*Routes.js   │──▶│*Controller.js│──▶│ (per-feature│  │ src/core/middleware│ │
│  │(per feature)│  │ (per feature)│  │  Mongoose)  │  │                     │ │
│  └─────────────┘  └──────┬──────┘  └──────┬──────┘  └────────────────────┘ │
│                          │                │                                 │
│  ┌─────────────┐  ┌──────┴──────┐  ┌──────┴──────┐  ┌────────────────────┐ │
│  │    Utils    │  │  External   │  │  Database   │  │     Scripts        │ │
│  │core/utils/* │  │ APIs core/api/* │   MongoDB   │  │    /scripts/*      │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
┌───────────────┐                               ┌───────────────┐
│   NSE India   │                               │   BSE India   │
│     API       │                               │     API       │
└───────────────┘                               └───────────────┘
```

## Component Details

### screener-web Layer

#### Pages (`screener-web/pages/`)

| File                | Purpose                        | Route            |
| ------------------- | ------------------------------ | ---------------- |
| `index.js`          | Dashboard with market overview | `/`              |
| `stock/[symbol].js` | Stock detail page              | `/stock/:symbol` |
| `screener.js`       | Stock screening tool           | `/screener`      |
| `watchlist.js`      | User's watchlist               | `/watchlist`     |
| `results.js`        | Declared/upcoming results dashboard | `/results` |
| `announcement-scans.js` | Corporate announcement scans | `/announcement-scans` |
| `gainers.js`        | Top-gainers live tracker       | `/gainers`       |

#### Styling & Theming

- **Tailwind CSS**: Utility-first styling
- **globals.css**: Global style overrides
- **Semantic Classes**: `text-positive`/`text-negative` conventions for price change

#### Components (`screener-web/src/`)

**Common Components** (`src/core/components/common/`):
| Component | File | Purpose |
|-----------|------|---------|
| `Header` | `Header.js` | Navigation header with search |
| `SearchBar` | `SearchBar.js` | Stock search with autocomplete |
| `Modal` | `Modal.js` | Modal dialog wrapper |
| `LoadingSpinner` | `LoadingSpinner.js` | Loading indicator |
| `Snackbar` | `Snackbar.js` | Toast/snackbar notifications |

**Shared Components** (`src/core/components/shared/`):
| Component | File | Purpose |
|-----------|------|---------|
| `StockTable` | `StockTable.js` | Generic stock data table |

**Stock Feature Components** (`src/features/stock/components/`):
| Component | File | Purpose |
|-----------|------|---------|
| `StockHeader` | `StockHeader.js` | Stock title and price |
| `QuarterlyResults` | `QuarterlyResults.js` | Quarterly financial data |
| `BalanceSheet` | `BalanceSheet.js` | Balance sheet display |
| `CashFlows` | `CashFlows.js` | Cash flow statement |
| `ChartTab` | `ChartTab.js` | Price chart |
| `DeliveryVolumeChartTab` | `DeliveryVolumeChartTab.js` | Delivery/volume chart |
| `TechnicalTab` | `TechnicalTab.js` | Technical indicators |
| `FundamentalsTab` | `FundamentalsTab.js` | Fundamental metrics |
| `FinancialsTab` / `FinancialResults` | `FinancialsTab.js` / `FinancialResults.js` | Financial statements |
| `AnnouncementsTab` | `AnnouncementsTab.js` | Corporate announcements |
| `ResearchPipelineTab` | `ResearchPipelineTab.js` | Research pipeline integration |
| `TranscriptTab` | `TranscriptTab.js` | Earnings call analysis |
| `OrdersTab` (two variants) | `OrdersTab.js`, `orders/OrdersTab.js` | Orders tab with sub-views |
| `OrderAnnouncements` | `orders/OrderAnnouncements.js` | Order announcements |
| `QuarterView` | `orders/QuarterView.js` | Quarter-wise order view |
| `OrderDownloads` | `orders/OrderDownloads.js` | Order PDF downloads |

#### API Client (`screener-web/src/core/lib/api.js`)

Centralized Axios instance with interceptors:

- **stockAPI**: Stock search, details, financials
- **screenerAPI**: Stock screening
- **watchlistAPI**: Watchlist CRUD
- **marketAPI**: Market indices
- **transcriptAPI**: AI analysis
- **ordersAPI**: Orderbook data

#### Utilities (`screener-web/src/core/lib/utils/`)

| Utility    | File            | Purpose                                                                 |
| ---------- | --------------- | ------------------------------------------------------------------------ |
| Formatters | `formatters.js` | Consolidated formatting (currency, price, quarter date, change %, etc.) |

#### Custom Hooks (`screener-web/src/core/lib/hooks/`)

| Hook           | File              | Purpose                       |
| -------------- | ----------------- | ----------------------------- |
| `useMarket`    | `useMarket.js`    | Market data with auto-refresh |
| `useWatchlist` | `useWatchlist.js` | Watchlist state management    |

### screener-api Layer

#### Server Entry (`screener-api/src/server.js`)

Express server setup with:

- CORS configuration
- JSON body parsing
- Route mounting
- Error handling middleware

#### Routes (`screener-api/src/features/*/*Routes.js`)

| Route File                  | Base Path                | Purpose                |
| ---------------------------- | ------------------------ | ---------------------- |
| `stock/stocksRoutes.js`      | `/api/stocks`            | Stock operations       |
| `screener/screenerRoutes.js` | `/api/screener`          | Stock screening        |
| `watchlist/watchlistRoutes.js` | `/api/watchlist`       | Watchlist management   |
| `market/marketRoutes.js`     | `/api/market`            | Market data            |
| `orders/ordersRoutes.js`     | `/api/orders`            | Order/orderbook data   |
| `announcements/announcementsRoutes.js` | `/api/announcements` | Company announcements |
| `results/resultTranscriptRoutes.js` | `/api/result-transcript` | AI transcript analysis |
| `results/upcomingResultRoutes.js` | `/api/upcoming-results` | Upcoming result dates |
| `results/declaredResultsRoutes.js` | `/api/declared-results` | Declared results dashboard |
| `admin/adminRoutes.js`       | `/api/admin`             | Admin operations       |
| `twitter/twitterRoutes.js`   | `/api/twitter`           | Tweet export           |
| `research/researchPipelineRoutes.js` | `/api/research`  | Research pipeline integration |

#### Controllers (`screener-api/src/features/*/*Controller.js`)

| Controller                   | File                            | Key Functions                                            |
| ----------------------------- | -------------------------------- | -------------------------------------------------------- |
| `stockController`            | `stock/stockController.js`            | `searchStocks`, `getStockDetails`, `getQuarterlyResults` |
| `screenerController`         | `screener/screenerController.js`      | `runScreener`                                            |
| `watchlistController`        | `watchlist/watchlistController.js`    | `getWatchlist`, `addToWatchlist`, `removeFromWatchlist`  |
| `marketController`           | `market/marketController.js`          | `getMarketIndices`, `getMarketStats`                     |
| `resultTranscriptController` | `results/resultTranscriptController.js` | `getTranscripts`, `analyzeTranscript`                  |
| `upcomingResultController`   | `results/upcomingResultController.js` | `getUpcomingResults`                                     |
| `declaredResultsController`  | `results/declaredResultsController.js` | `getDeclaredResults`, `getFilterOptions`, `downloadTranscriptNotes` |
| `ordersController`           | `orders/ordersController.js`          | Orderbook fetch/parse/download                            |
| `announcementsController`    | `announcements/announcementsController.js` | Announcement search/download                        |
| `adminController`            | `admin/adminController.js`            | Admin/data-update endpoints                                |
| `twitterController`          | `twitter/twitterController.js`        | Tweet export                                                |

#### Models (`screener-api/src/features/*/`, colocated with each feature)

MongoDB schemas using Mongoose — these are the only Mongoose models that
currently exist in the repo (no `FinancialStatement` or `Orderbook` models):

| Model             | File                              | Purpose                                 |
| ------------------ | ---------------------------------- | --------------------------------------- |
| `Stock`            | `stock/Stock.js`                   | Stock basic info (symbol, name, sector) |
| `QuarterlyResult`  | `results/QuarterlyResult.js`       | Quarterly financial results             |
| `PriceHistory`     | `stock/PriceHistory.js`            | Historical price data                   |
| `Fundamental`      | `stock/Fundamental.js`             | Fundamental metrics                     |
| `Watchlist`        | `watchlist/Watchlist.js`           | User watchlist entries                  |

#### External APIs (`screener-api/src/core/api/`)

| API Module    | File             | External Service                       |
| -------------- | ------------------ | -------------------------------------- |
| `nseIndiaApi` | `nseIndiaApi.js` | NSE India (upcoming results, cookies)  |
| `bseIndiaApi` | `bseIndiaApi.js` | BSE India (scrip codes, announcements) |
| `stockscansAuth` | `stockscansAuth.js` | Stockscans authentication            |

#### Utilities (`screener-api/src/core/utils/`)

| Utility               | File                     | Functions                                                       |
| ----------------------- | -------------------------- | ----------------------------------------------------------------- |
| `technicalIndicators` | `technicalIndicators.js` | `calculateSMA`, `calculateEMA`, `calculateRSI`, `calculateMACD` |
| `xbrlParser`          | `xbrlParser.js`          | XBRL financial data parsing                                     |
| `nseHelpers`          | `nseHelpers.js`          | Shared NSE utilities                                             |
| `portUtils`           | `portUtils.js`           | Dev-server port auto-selection                                  |

Request validation (Joi schemas) is defined inline per-controller rather
than in a separate `validators.js` file. There is no `dataFetcher.js`
(Alpha Vantage/FMP calls, if used, live inside the relevant feature).

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

┌──────────────────┐
│    Watchlist     │
├──────────────────┤
│ symbol           │
│ added_at         │
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

## Error Handling

### screener-api Error Middleware (`screener-api/src/core/middleware/errorHandler.js`)

- Catches all unhandled errors
- Returns consistent error format
- Logs errors for debugging

### screener-web Error Handling

- Axios interceptors for API errors
- Try-catch in async operations
- User-friendly error messages

## Caching Strategy

| Data Type         | Cache Location | TTL       | Invalidation      |
| ----------------- | -------------- | --------- | ----------------- |
| Quarterly Results | MongoDB        | 2 days    | Manual refresh    |
| AI Responses      | MongoDB        | Permanent | Never (immutable) |
| NSE Cookies       | Memory         | 5 minutes | Auto-refresh      |
| Stock Details     | None           | N/A       | Real-time fetch   |

## Security Considerations

1. **API Keys**: Stored in environment variables
2. **CORS**: Configured for frontend origin
3. **Input Validation**: Joi schemas for all inputs
4. **Rate Limiting**: Recommended for production
5. **Error Sanitization**: No stack traces in production
