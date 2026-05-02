# Stock Screener Backend

Express.js REST API for stock screening and analysis.

## Setup

### 1. Install Dependencies

From the **repository root** (Yarn workspaces):

```bash
corepack enable
yarn install
```

### 2. Configure Environment

Create a `.env` file:

```env
MONGO_URL=mongodb://localhost:27017/stock-screener
PORT=5000
ALPHA_VANTAGE_API_KEY=your_api_key_here
FMP_API_KEY=your_api_key_here
NODE_ENV=development
```

### 3. Start MongoDB

```bash
# macOS with Homebrew
brew services start mongodb-community

# Linux
sudo systemctl start mongod

# Windows
net start MongoDB
```

### 4. Seed Database

```bash
node scripts/fetchData.js
```

This will populate the database with 20 sample stocks and 5 years of historical data.

### 5. Start Server

```bash
# From repo root
yarn workspace stock-screener-backend dev
yarn workspace stock-screener-backend start   # production

# Or from this directory after root yarn install
yarn dev
yarn start   # production
```

Server will start on `http://localhost:5000`

## API Documentation

### Health Check

```
GET /api/health
```

### Stock APIs

#### Search Stocks
```
GET /api/stocks/search?q={query}
```

#### Get Stock Details
```
GET /api/stocks/:symbol
```

#### Get Technicals
```
GET /api/stocks/:symbol/technicals
```

#### Get Financials
```
GET /api/stocks/:symbol/financials?quarters=4
```

### Screener API

#### Run Screener
```
POST /api/screener/run
Content-Type: application/json

{
  "filters": {
    "market_cap_min": 1000,
    "pe_max": 25,
    "roe_min": 15
  },
  "sort_by": "market_cap",
  "sort_order": "desc",
  "limit": 100
}
```

### Watchlist APIs

#### Get Watchlist
```
GET /api/watchlist
```

#### Add to Watchlist
```
POST /api/watchlist/:symbol
```

#### Remove from Watchlist
```
DELETE /api/watchlist/:symbol
```

### Market APIs

#### Get Indices
```
GET /api/market/indices
```

#### Get Stats
```
GET /api/market/stats
```

## Database Models

### Stock
- symbol, name, sector, industry, market_cap, listing_date

### Fundamental
- stock_id, date, pe_ratio, pb_ratio, roe, roce, debt_to_equity, etc.

### PriceHistory
- stock_id, date, open, high, low, close, volume

### FinancialStatement
- stock_id, period_type, fiscal_year, quarter, revenue, profits, assets, etc.

### Watchlist
- symbol, added_date

## Scripts

### Fetch Data (Initial Seed)
```bash
node scripts/fetchData.js
```

### Update Data (Daily)
```bash
node scripts/updateData.js
```

## Technical Indicators

Implemented calculations:
- SMA (Simple Moving Average)
- EMA (Exponential Moving Average)
- RSI (Relative Strength Index)
- MACD (Moving Average Convergence Divergence)

## Error Handling

All endpoints return consistent error format:

```json
{
  "success": false,
  "error": "Error message here"
}
```

## Development

The backend uses:
- Express.js for REST API
- Mongoose for MongoDB ODM
- Joi for validation
- CORS for cross-origin requests

