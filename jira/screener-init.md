# Stock Screener Application - Development Prompt
## Personal Use - MVP Edition
### Tech Stack: Next.js (React) + Node.js/Express + MongoDB/PostgreSQL

---

## Project Overview

Build a **local-first stock screener web application** for personal investment analysis. The application scans Indian stocks against fundamental and technical criteria, displays results with company details, and maintains a watchlist. This is a single-user desktop application that runs entirely locally without any monetization, authentication, or complex charting requirements.

**Target Completion:** 2-3 weeks of focused development
**Technology:** Next.js frontend, Node.js/Express backend, MongoDB or PostgreSQL
**Scope:** MVP only - core screening and analysis features

---

## Core Requirements

### 1. Data Management & Storage

**Database Setup:**

Choose one:
- **MongoDB:** Document-based, flexible schema, JSON-like format. Use Mongoose for schema validation.
- **PostgreSQL:** Relational, robust, ACID compliance. Use Prisma or Sequelize ORM.

**Collections/Tables:**

```
Stocks
- id (PK), symbol, name, sector, industry, market_cap, listing_date

Fundamentals
- id (PK), stock_id (FK), date, pe_ratio, pb_ratio, roe, roce, 
  debt_to_equity, revenue_growth_3y, profit_growth_3y, 
  dividend_yield, current_ratio, eps, book_value_per_share

PriceHistory
- id (PK), stock_id (FK), date, open, high, low, close, volume
- (Index on stock_id and date for fast queries)

FinancialStatements
- id (PK), stock_id (FK), period_type (quarterly/annual), 
  fiscal_year, quarter, revenue, gross_profit, operating_profit, 
  net_profit, total_assets, total_liabilities, shareholders_equity

Watchlist
- id (PK), symbol, added_date
```

**Data Sources:**
- Alpha Vantage, Yahoo Finance, Financial Modeling Prep (free tiers)
- Create `scripts/fetchData.js` for initial bulk data load
- Create `scripts/updateData.js` for daily EOD updates
- Pre-populate with NSE 500 stocks' 5 years historical data + fundamentals

**Database Connection:**
```js
// MongoDB with Mongoose
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URL);

// OR PostgreSQL with Prisma
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
```

---

### 2. Backend Requirements

**Technology Stack:**
- Node.js 18+ with Express.js
- Mongoose (MongoDB) or Prisma (PostgreSQL)
- Axios for API calls to external data sources
- dotenv for environment variables
- CORS middleware for frontend communication

**Project Structure:**

```
backend/
├── server.js                 # Express app entry point
├── .env                      # DB_URL, API_KEYS, PORT
├── .env.example             
├── package.json
├── config/
│   └── database.js          # DB connection setup
├── models/                  # Mongoose schemas or Prisma schema
│   ├── Stock.js
│   ├── Fundamental.js
│   ├── PriceHistory.js
│   ├── FinancialStatement.js
│   └── Watchlist.js
├── routes/
│   ├── stocks.js            # Stock search, details
│   ├── screener.js          # Filtering logic
│   ├── watchlist.js         # Watchlist CRUD
│   ├── market.js            # Indices, market data
│   └── admin.js             # Data update endpoints
├── controllers/
│   ├── stockController.js   # Business logic for stocks
│   ├── screenerController.js
│   ├── watchlistController.js
│   └── marketController.js
├── utils/
│   ├── dataFetcher.js       # API calls to external sources
│   ├── technicalIndicators.js # SMA, RSI, MACD calculations
│   └── validators.js        # Input validation
├── scripts/
│   ├── fetchData.js         # Initial data import
│   └── updateData.js        # Daily EOD update
└── middleware/
    └── errorHandler.js
```

**API Endpoints:**

```
// Search
GET /api/stocks/search?q={query}
Response: [{ id, symbol, name, sector, industry, marketCap }, ...]

// Screener - Execute filtering query
POST /api/screener/run
Body: {
  "filters": {
    "market_cap_min": 1000,
    "market_cap_max": 500000,
    "sectors": ["IT", "Pharma"],
    "pe_min": 0,
    "pe_max": 25,
    "pb_min": 0,
    "pb_max": 5,
    "roe_min": 10,
    "roe_max": 100,
    "roce_min": 10,
    "roce_max": 100,
    "debt_to_equity_max": 1.5,
    "revenue_growth_3y_min": 5,
    "profit_growth_3y_min": 5,
    "dividend_yield_min": 0,
    "dividend_yield_max": 10,
    "current_ratio_min": 1
  },
  "sort_by": "market_cap",
  "sort_order": "desc",
  "limit": 100
}
Response: [{ symbol, name, sector, pe, pb, roe, roce, ... }, ...]

// Stock Details
GET /api/stocks/{symbol}
Response: {
  basic_info: { symbol, name, sector, industry, market_cap, listing_date },
  fundamentals: { pe_ratio, pb_ratio, roe, roce, ... },
  latest_financial: { revenue, profit, eps, book_value, ... },
  price_history_5y: [{ date, open, high, low, close, volume }, ...]
}

// Stock Technicals
GET /api/stocks/{symbol}/technicals
Response: {
  current_price: 150.25,
  sma_50: 145.30,
  sma_200: 142.10,
  rsi_14: 65.5,
  macd: { macd: 2.5, signal: 2.1, histogram: 0.4 },
  historical: [{ date, sma50, sma200, rsi, macd }, ...]
}

// Stock Financial Statements
GET /api/stocks/{symbol}/financials?quarters=4
Response: {
  p_and_l: [{ period, revenue, gross_profit, operating_profit, net_profit }, ...],
  balance_sheet: [{ period, total_assets, total_liabilities, equity }, ...]
}

// Watchlist - Get all
GET /api/watchlist
Response: [{ symbol, name, price, change_percent, sector, pe, roe }, ...]

// Watchlist - Add stock
POST /api/watchlist/{symbol}
Response: { message: "Stock added", symbol }

// Watchlist - Remove stock
DELETE /api/watchlist/{symbol}
Response: { message: "Stock removed", symbol }

// Market Indices
GET /api/market/indices
Response: {
  nifty50: { current: 19200, change: 125, change_percent: 0.65 },
  sensex: { current: 62500, change: 200, change_percent: 0.32 },
  sectors: { IT: 0.45, Pharma: -0.25, ... }
}

// Data Update - Manual trigger
GET /api/admin/data/update
Response: { message: "Data update initiated", updated_count: 500 }
```

**Key Business Logic:**

1. **Screening Engine** (`screenerController.js`):
   - Accept filter JSON
   - Query MongoDB/PostgreSQL with AND logic for all filters
   - Calculate derived fields on-the-fly if needed
   - Return results sorted and paginated
   - Max 1000 results per query

2. **Technical Indicators** (`utils/technicalIndicators.js`):
```javascript
// SMA Calculation
function calculateSMA(prices, period) {
  const sma = [];
  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const average = slice.reduce((a, b) => a + b) / period;
    sma.push(average);
  }
  return sma;
}

// RSI Calculation
function calculateRSI(prices, period = 14) {
  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }
  
  const gains = changes.map(c => c > 0 ? c : 0);
  const losses = changes.map(c => c < 0 ? -c : 0);
  
  const avgGain = gains.slice(0, period).reduce((a, b) => a + b) / period;
  const avgLoss = losses.slice(0, period).reduce((a, b) => a + b) / period;
  
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  return rsi;
}

// MACD Calculation
function calculateMACD(prices) {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12.map((val, i) => val - ema26[i]);
  const signal = calculateEMA(macd, 9);
  const histogram = macd.map((val, i) => val - signal[i]);
  return { macd, signal, histogram };
}
```

3. **Data Fetcher** (`utils/dataFetcher.js`):
   - Fetch EOD prices from Alpha Vantage/Yahoo Finance
   - Fetch fundamentals from Financial Modeling Prep
   - Handle API rate limits with delays
   - Cache responses to reduce API calls
   - Error handling with retry logic

```javascript
async function fetchStockPrice(symbol) {
  // Call external API
  // Parse response
  // Save to database
}

async function fetchFundamentals(symbol) {
  // Fetch P/E, ROE, ROCE, etc.
  // Save to database
}
```

4. **Database Models** (Mongoose example):
```javascript
// Stock Model
const stockSchema = new Schema({
  symbol: { type: String, unique: true, required: true },
  name: String,
  sector: String,
  industry: String,
  market_cap: Number,
  listing_date: Date
});

// Fundamentals Model
const fundamentalSchema = new Schema({
  stock_id: { type: Schema.Types.ObjectId, ref: 'Stock' },
  date: Date,
  pe_ratio: Number,
  pb_ratio: Number,
  roe: Number,
  roce: Number,
  debt_to_equity: Number,
  revenue_growth_3y: Number,
  profit_growth_3y: Number,
  dividend_yield: Number,
  current_ratio: Number
});

// Price History Model (Time Series)
const priceSchema = new Schema({
  stock_id: { type: Schema.Types.ObjectId, ref: 'Stock' },
  date: { type: Date, index: true },
  open: Number,
  high: Number,
  low: Number,
  close: Number,
  volume: Number
});
```

---

### 3. Frontend Requirements

**Technology Stack:**
- Next.js 14+ with React 18+
- JavaScript (ES6+) or TypeScript
- Tailwind CSS for styling
- Axios for API calls
- Recharts for basic charts (line, area)
- React Query (optional, for data caching)

**Project Structure:**

```
frontend/
├── pages/
│   ├── _app.js                 # Global layout, providers
│   ├── _document.js            # Custom document
│   ├── index.js                # Dashboard
│   ├── screener.js             # Screener page
│   ├── stock/[symbol].js       # Stock details (dynamic)
│   ├── watchlist.js            # Watchlist page
│   └── 404.js                  # Error page
├── components/
│   ├── common/
│   │   ├── Header.js
│   │   ├── Navbar.js
│   │   ├── SearchBar.js
│   │   ├── Table.js
│   │   ├── Modal.js
│   │   └── LoadingSpinner.js
│   ├── screener/
│   │   ├── FilterPanel.js      # All filters
│   │   ├── ResultsTable.js     # Results
│   │   ├── PreBuiltScreeners.js
│   │   └── ScreenerToolbar.js
│   ├── stock/
│   │   ├── StockHeader.js      # Name, price, snapshot
│   │   ├── FundamentalsTab.js  # Key metrics table
│   │   ├── FinancialsTab.js    # P&L, Balance Sheet
│   │   ├── ChartTab.js         # Price chart with SMA
│   │   ├── TechnicalTab.js     # RSI, MACD values
│   │   └── StockDetailsModal.js
│   ├── watchlist/
│   │   └── WatchlistTable.js
│   └── dashboard/
│       ├── MarketSnapshot.js   # Indices overview
│       ├── WatchlistSummary.js
│       └── RecentScreeners.js
├── lib/
│   ├── api.js                  # Axios instance & API calls
│   ├── hooks/
│   │   ├── useStocks.js        # Stock data fetching
│   │   ├── useScreener.js      # Screener queries
│   │   ├── useWatchlist.js     # Watchlist management
│   │   └── useMarket.js        # Market data
│   └── utils/
│       ├── formatters.js       # Number formatting
│       └── validators.js       # Input validation
├── styles/
│   └── globals.css             # Tailwind imports
├── public/
│   └── favicon.ico
├── .env.local                  # API_BASE_URL, etc.
├── .env.example
├── next.config.js
├── tailwind.config.js
├── postcss.config.js
└── package.json
```

**Key Pages:**

1. **Dashboard** (`pages/index.js`):
   - Quick search bar with auto-complete
   - Market indices snapshot (Nifty 50, Sensex, sector performance)
   - Watchlist summary (top 5-10 stocks with live prices)
   - Quick access buttons to pre-built screeners
   - Recent screener results

2. **Screener** (`pages/screener.js`):
   - Left sidebar: Filter panel (collapsible sections)
     - Basic Filters: Market Cap range, Sector multi-select, Industry
     - Fundamental Filters: P/E, P/B, ROE, ROCE, Debt/Equity ranges
     - Growth Filters: Revenue growth, Profit growth 3Y CAGR
     - Other Filters: Dividend yield, Current ratio
   - Center: Results table
     - Columns: Symbol, Name, Sector, Market Cap, P/E, P/B, ROE, ROCE
     - Sortable, pagination
     - Click row to view details
     - Checkbox to add/remove from watchlist
   - Top toolbar: "Run Screener" button, Clear filters, Export to CSV
   - Pre-built screeners dropdown

3. **Stock Details** (`pages/stock/[symbol].js`):
   - Header section: Name, Symbol, Price, % Change, Key metrics grid
   - Tab Navigation:
     - **Overview:** Business description, sector, industry, key metrics snapshot
     - **Fundamentals:** All P/E, P/B, ROE, ROCE, margins, ratios in table format
     - **Financials:** Last 4 quarters of P&L and Balance Sheet
     - **Chart:** Line chart of closing price for last 5 years with SMA50, SMA200 overlay
     - **Technicals:** RSI value, MACD values (macd, signal, histogram), mini-charts
   - Right sidebar: Add/Remove from watchlist button

4. **Watchlist** (`pages/watchlist.js`):
   - Table of all watchlisted stocks
   - Columns: Symbol, Name, Price, Change %, Sector, P/E, ROE, Actions
   - Real-time price updates (refresh every 5 minutes)
   - Remove button for each row
   - Sort functionality
   - Empty state message

**Key Components:**

```javascript
// lib/api.js - API Client
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000
});

export const stockAPI = {
  search: (query) => api.get(`/stocks/search?q=${query}`),
  getDetails: (symbol) => api.get(`/stocks/${symbol}`),
  getTechnicals: (symbol) => api.get(`/stocks/${symbol}/technicals`),
  getFinancials: (symbol) => api.get(`/stocks/${symbol}/financials`),
};

export const screenerAPI = {
  runScreener: (filters) => api.post(`/screener/run`, { filters }),
};

export const watchlistAPI = {
  getAll: () => api.get(`/watchlist`),
  add: (symbol) => api.post(`/watchlist/${symbol}`),
  remove: (symbol) => api.delete(`/watchlist/${symbol}`),
};

// components/screener/FilterPanel.js - Example
export default function FilterPanel({ onFilter }) {
  const [filters, setFilters] = useState({
    market_cap_min: '',
    market_cap_max: '',
    sectors: [],
    pe_max: 25,
    // ... other filters
  });

  const handleRunScreener = async () => {
    const results = await screenerAPI.runScreener(filters);
    onFilter(results.data);
  };

  return (
    <div className="filter-panel">
      {/* Filter inputs */}
      <button onClick={handleRunScreener}>Run Screener</button>
    </div>
  );
}

// components/stock/ChartTab.js - Example with Recharts
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function ChartTab({ symbol }) {
  const [priceData, setPriceData] = useState([]);

  useEffect(() => {
    api.get(`/stocks/${symbol}`).then(res => {
      setPriceData(res.data.price_history_5y);
    });
  }, [symbol]);

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={priceData}>
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="close" name="Close Price" stroke="#8884d8" />
        <Line type="monotone" dataKey="sma_50" name="SMA 50" stroke="#82ca9d" />
        <Line type="monotone" dataKey="sma_200" name="SMA 200" stroke="#ffc658" />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

**UI Specifics:**
- Clean, minimal design with Tailwind CSS
- Clear typography hierarchy
- Responsive: works on 1024px+ screens
- Light mode primary (optional dark mode toggle)
- No unnecessary animations
- Consistent color scheme: Primary (brand), Gray (neutral), Green (positive), Red (negative)

---

## 4. Specific Technical Indicators Required

Implement server-side calculations (stored in DB):

```javascript
// utils/technicalIndicators.js

// SMA (Simple Moving Average)
function calculateSMA(closePrices, period) {
  const sma = [];
  for (let i = period - 1; i < closePrices.length; i++) {
    const slice = closePrices.slice(i - period + 1, i + 1);
    const avg = slice.reduce((a, b) => a + b) / period;
    sma.push(avg);
  }
  return sma;
}

// RSI (Relative Strength Index) - 14 period
function calculateRSI(closePrices, period = 14) {
  const changes = [];
  for (let i = 1; i < closePrices.length; i++) {
    changes.push(closePrices[i] - closePrices[i - 1]);
  }

  const gains = changes.map(c => c > 0 ? c : 0);
  const losses = changes.map(c => c < 0 ? -c : 0);

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b) / period;

  const rsi = [];
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    const rs = avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));
  }
  return rsi;
}

// MACD (Moving Average Convergence Divergence)
function calculateMACD(closePrices) {
  const ema12 = calculateEMA(closePrices, 12);
  const ema26 = calculateEMA(closePrices, 26);
  const macd = ema12.map((val, i) => val - ema26[i]);
  const signal = calculateEMA(macd, 9);
  const histogram = macd.map((val, i) => val - signal[i]);
  return { macd, signal, histogram };
}

function calculateEMA(prices, period) {
  const k = 2 / (period + 1);
  const ema = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}
```

---

## 5. Data & Calculations

**Fundamental Metrics:**
- P/E Ratio: Stock Price / EPS
- P/B Ratio: Stock Price / Book Value Per Share
- ROE: (Net Income / Shareholders' Equity) × 100
- ROCE: (EBIT / (Equity + Debt)) × 100
- Debt/Equity: Total Debt / Total Equity
- Current Ratio: Current Assets / Current Liabilities
- Dividend Yield: (Annual Dividend / Current Price) × 100
- Revenue Growth 3Y CAGR: (Current Year Revenue / 3-Year Ago Revenue) ^ (1/3) - 1
- Profit Growth 3Y CAGR: (Current Year Profit / 3-Year Ago Profit) ^ (1/3) - 1

**Financial Statements Display:**
- Show last 4 quarters of: Revenue, Gross Profit, Operating Profit, EBITDA, Net Profit, EPS
- Show last 2 years of: Total Assets, Total Liabilities, Shareholders' Equity, Debt, Current Assets, Current Liabilities

---

## 6. Architecture (Local Setup)

```
stock-screener/
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── .env
│   ├── config/
│   │   └── database.js
│   ├── models/
│   ├── routes/
│   ├── controllers/
│   ├── utils/
│   ├── scripts/
│   └── middleware/
├── frontend/
│   ├── pages/
│   ├── components/
│   ├── lib/
│   ├── styles/
│   ├── public/
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── .env.local
│   └── tsconfig.json
└── README.md
```

**Backend `package.json`:**
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "mongoose": "^7.0.0",
    "prisma": "^5.0.0",
    "dotenv": "^16.3.1",
    "cors": "^2.8.5",
    "axios": "^1.6.0",
    "joi": "^17.10.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  },
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  }
}
```

**Frontend `package.json`:**
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "next": "^14.0.0",
    "axios": "^1.6.0",
    "recharts": "^2.10.0",
    "tailwindcss": "^3.3.0"
  },
  "devDependencies": {
    "tailwindcss": "^3.3.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  }
}
```

**How to Run Locally:**

```bash
# Terminal 1: Backend
cd backend
npm install
echo "MONGO_URL=mongodb://localhost:27017/stock-screener" > .env
echo "PORT=5000" >> .env
npm run dev
# Server runs on http://localhost:5000

# Terminal 2: Frontend
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:5000/api" > .env.local
npm run dev
# Application opens at http://localhost:3000
```

---

## 7. MVP Feature Set (In Priority Order)

### Priority 1 (Must Have - Week 1)
- ✅ Backend API setup with Express + MongoDB/PostgreSQL
- ✅ Database schema and models
- ✅ Stock search endpoint with auto-complete
- ✅ Basic screener with 5 filters (Market Cap, Sector, P/E, ROE, Debt/Equity)
- ✅ Pre-built "Value Stocks" screener
- ✅ Watchlist add/remove endpoints
- ✅ Frontend: Next.js setup, search bar, screener page, watchlist page
- ✅ Stock details modal with fundamentals table

### Priority 2 (Should Have - Week 2)
- ✅ Dashboard with quick links and market snapshot
- ✅ 10 more filters for advanced screening
- ✅ Pre-built screeners (Growth, Dividend, Low Debt, Quality)
- ✅ Technical indicators calculation (SMA50, SMA200, RSI, MACD)
- ✅ Stock details page with all tabs
- ✅ Simple price chart (5Y line chart with SMAs) using Recharts
- ✅ Financial statements display (P&L, Balance Sheet)
- ✅ Peer comparison (stocks with similar market cap in same sector)

### Priority 3 (Nice to Have - Week 3)
- ✅ Export screener results to CSV
- ✅ UI polish and responsive design
- ✅ Real-time watchlist price updates (every 5 minutes)
- ✅ Market indices display
- ✅ Data refresh script with automated scheduling
- ✅ Error handling and edge cases
- ✅ Loading states and spinners

---

## 8. Data Initialization & Update Strategy

**Initial Setup Script** (`scripts/fetchData.js`):
```javascript
// Fetch all NSE 500 stocks
// Get 5 years of daily OHLCV data
// Get latest fundamentals
// Populate MongoDB/PostgreSQL
// Estimated: 2-3 hours (due to API rate limits)

node scripts/fetchData.js
```

**Daily Update Script** (`scripts/updateData.js`):
```javascript
// Fetch latest EOD prices for all stocks
// Update technical indicators
// Update fundamentals (if available)
// Takes ~30 minutes depending on API limits

node scripts/updateData.js
```

**Scheduling:**
- Linux/Mac: Add to crontab
  ```bash
  # Run daily at 6:00 PM IST
  0 18 * * * cd /path/to/backend && node scripts/updateData.js
  ```
- Windows: Use Task Scheduler
- Manual: Run script when needed

**API Rate Limits:**
- Alpha Vantage: 5 req/min, 500/day
- Financial Modeling Prep: 250/day free
- Implement exponential backoff and caching

---

## 9. Specific Instructions for Development

### Backend Development Order (12-14 hours):
1. **Setup** (30 min): Express, MongoDB/PostgreSQL connection, .env
2. **Database Models** (1 hour): Define Mongoose schemas or Prisma models
3. **Data Fetch Script** (2 hours): Implement `fetchData.js` and test
4. **Search Endpoint** (30 min): GET /api/stocks/search
5. **Screening Engine** (3 hours): POST /api/screener/run with complex filtering
6. **Stock Details Endpoints** (2 hours): GET /api/stocks/{symbol}, financials, technicals
7. **Watchlist Endpoints** (1 hour): CRUD for watchlist
8. **Technical Indicators** (2 hours): Calculate and cache SMA, RSI, MACD
9. **Market Data Endpoints** (1 hour): GET /api/market/indices
10. **Testing** (1 hour): Postman API testing

### Frontend Development Order (14-16 hours):
1. **Project Setup** (30 min): Next.js, React, Tailwind, Recharts
2. **API Client** (30 min): axios wrapper in lib/api.js
3. **Reusable Components** (1 hour): Table, Modal, LoadingSpinner, SearchBar
4. **Screener Page** (3 hours): FilterPanel, ResultsTable, PreBuiltScreeners
5. **Stock Details Page** (3 hours): Tabs for Overview, Fundamentals, Financials, Chart, Technicals
6. **Watchlist Page** (1 hour): WatchlistTable with add/remove
7. **Dashboard** (1.5 hours): MarketSnapshot, WatchlistSummary, RecentScreeners
8. **Charts** (2 hours): Line charts with Recharts, SMA overlays
9. **Styling & Responsiveness** (2 hours): Tailwind CSS, mobile adaptation
10. **Testing & Bug Fixes** (1.5 hours): Manual testing, edge cases

---

## 10. Validation Checklist for Completion

- [ ] Backend Express server runs on `http://localhost:5000`
- [ ] Frontend Next.js app runs on `http://localhost:3000`
- [ ] MongoDB/PostgreSQL connection established and verified
- [ ] NSE 500 stocks loaded in database with 5 years price history
- [ ] Stock search returns results in < 1 second
- [ ] Screener executes with 5+ filters in < 3 seconds
- [ ] Stock details page loads fundamentals, financials, chart
- [ ] Watchlist persists in database across page refreshes
- [ ] Pre-built screeners work and return relevant stocks
- [ ] Technical indicators (SMA50, SMA200, RSI, MACD) display correctly
- [ ] Price chart renders with 5-year data and SMA overlays
- [ ] Watchlist updates with real-time prices every 5 minutes
- [ ] All pages responsive on 1024px and above screens
- [ ] No console errors or failed API calls
- [ ] CSV export works for screener results
- [ ] Data update script runs without errors
- [ ] Application works completely offline after initial load
- [ ] All modal/page transitions smooth
- [ ] Search auto-complete working with > 500 stocks

---

## 11. Quick Start Commands

```bash
# Backend Setup
cd backend
npm install
# Create .env file with:
# MONGO_URL=mongodb://localhost:27017/stock-screener
# OR
# DATABASE_URL=postgresql://user:password@localhost:5432/stock_screener
# PORT=5000
npm run dev

# Frontend Setup (new terminal)
cd frontend
npm install
# Create .env.local file with:
# NEXT_PUBLIC_API_URL=http://localhost:5000/api
npm run dev

# Access Application
# Frontend: http://localhost:3000
# Backend API: http://localhost:5000/api
```

---

## 12. Key Development Notes

1. **Start with Backend:** Build and test all API endpoints first using Postman/Insomnia before touching frontend
2. **Mock Data Initially:** Use sample stock data to develop frontend while backend data is loading
3. **Iterate Frequently:** Build smallest viable feature first (search), then expand
4. **Database Indexing:** Create indexes on frequently queried fields (symbol, sector, date)
5. **Error Handling:** All API calls should handle errors gracefully with user-friendly messages
6. **Performance:** Use pagination for large result sets, lazy-load data for tabs
7. **Caching:** Cache technical indicators calculation results
8. **Environment Variables:** Keep API keys and URLs in .env files, never hardcode
9. **Testing:** Use browser DevTools for frontend, Postman for backend API testing

---

## 13. Out of Scope (Explicitly Not Building)

❌ User authentication, 2FA, or multi-user support
❌ Monetization, subscription tiers, or pricing
❌ Natural language query input
❌ Advanced charting (candlestick, multiple indicator overlays)
❌ Backtesting engine or strategy testing
❌ Machine learning or AI-based recommendations
❌ Portfolio P&L tracking
❌ Broker integration or trade execution
❌ Mobile native apps (responsive web only)
❌ Cloud deployment (local only)
❌ Email notifications or SMS alerts
❌ News feed or sentiment analysis
❌ Credit ratings or insider trading data
❌ Options and derivatives analysis

---

## 14. File Structure Reference

```
stock-screener/
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── .env (create locally)
│   ├── .env.example
│   ├── config/
│   │   └── database.js
│   ├── models/
│   │   ├── Stock.js
│   │   ├── Fundamental.js
│   │   ├── PriceHistory.js
│   │   ├── FinancialStatement.js
│   │   └── Watchlist.js
│   ├── routes/
│   │   ├── stocks.js
│   │   ├── screener.js
│   │   ├── watchlist.js
│   │   ├── market.js
│   │   └── admin.js
│   ├── controllers/
│   │   ├── stockController.js
│   │   ├── screenerController.js
│   │   ├── watchlistController.js
│   │   └── marketController.js
│   ├── utils/
│   │   ├── dataFetcher.js
│   │   ├── technicalIndicators.js
│   │   └── validators.js
│   ├── scripts/
│   │   ├── fetchData.js
│   │   └── updateData.js
│   └── middleware/
│       └── errorHandler.js
├── frontend/
│   ├── pages/
│   │   ├── _app.js
│   │   ├── index.js
│   │   ├── screener.js
│   │   ├── stock/[symbol].js
│   │   ├── watchlist.js
│   │   └── 404.js
│   ├── components/
│   │   ├── common/
│   │   ├── screener/
│   │   ├── stock/
│   │   ├── watchlist/
│   │   └── dashboard/
│   ├── lib/
│   │   ├── api.js
│   │   ├── hooks/
│   │   └── utils/
│   ├── styles/
│   │   └── globals.css
│   ├── public/
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── .env.local (create locally)
│   ├── .env.example
│   └── tsconfig.json
└── README.md
```

---

## 15. Success Criteria

**By End of Week 1:**
- ✅ Backend API fully functional with 7+ endpoints
- ✅ Basic frontend with search and screener working
- ✅ Screener executes with 5 fundamental filters
- ✅ Watchlist functionality complete
- ✅ SQLite/MongoDB/PostgreSQL populated with 500 stocks

**By End of Week 2:**
- ✅ All 15 filters working
- ✅ Pre-built screeners functional
- ✅ Stock details page complete
- ✅ Charts and technical indicators displaying
- ✅ Financial statements visible

**By End of Week 3:**
- ✅ Complete MVP as per Priority 1 & 2
- ✅ Code cleanup and optimization
- ✅ Responsive design finalized
- ✅ Setup instructions documented
- ✅ Ready for daily personal use

---

**End of Development Brief**

This is a focused, executable plan for building a personal stock screener application in 2-3 weeks using Next.js, Node.js/Express, and MongoDB/PostgreSQL. Follow this prompt step-by-step to have a fully functional application running locally.
