# Backend Documentation

> **Code Location**: `backend/`  
> **Entry Point**: `backend/server.js`  
> **Last Updated**: 2024-12-31

## Overview

The backend is an Express.js REST API server that provides stock market data by integrating with NSE India, BSE India, and Gemini AI APIs.

## Directory Structure

```
backend/
├── api/                    # External API integrations
│   ├── nseIndiaApi.js     # NSE India API client
│   ├── bseIndiaApi.js     # BSE India API client
│   ├── geminiApi.js       # Gemini AI integration
│   ├── orderParser.js     # PDF order parsing
│   └── orderbookBaselineParser.js  # Orderbook calculations
├── config/
│   └── database.js        # MongoDB connection
├── controllers/            # Request handlers
│   ├── stockController.js
│   ├── screenerController.js
│   ├── watchlistController.js
│   ├── marketController.js
│   ├── resultTranscriptController.js
│   └── upcomingResult.js
├── middleware/
│   └── errorHandler.js    # Global error handling
├── models/                 # Mongoose schemas
│   ├── Stock.js
│   ├── QuarterlyResult.js
│   ├── FinancialStatement.js
│   ├── PriceHistory.js
│   ├── Fundamental.js
│   ├── Watchlist.js
│   ├── Orderbook.js
│   └── ModelResponse.js
├── prompts/                # AI prompts
│   ├── earning_call.txt
│   ├── order_extraction.txt
│   └── orderbook_baseline.txt
├── routes/                 # API routes
│   ├── stocks.js
│   ├── screener.js
│   ├── watchlist.js
│   ├── market.js
│   ├── orders.js
│   ├── announcements.js
│   ├── resultTranscript.js
│   ├── upcomingResult.js
│   └── admin.js
├── scripts/                # Data fetching scripts
│   ├── balanceSheetDataFetcher.js
│   ├── stockDetailsFetcher.js
│   ├── fetchData.js
│   └── updateData.js
├── tests/                  # Unit tests
│   └── stockController.test.js
├── utils/                  # Utility functions
│   ├── technicalIndicators.js
│   ├── validators.js
│   ├── dataFetcher.js
│   └── xbrlParser.js
└── server.js              # Application entry point
```

## Quick Reference

### Controllers

| Controller | File | Documentation |
|------------|------|---------------|
| Stock Controller | [stockController.js](./controllers/stockController.md) | Stock search, details, quarterly results |
| Screener Controller | [screenerController.js](./controllers/screenerController.md) | Stock screening |
| Market Controller | [marketController.js](./controllers/marketController.md) | Market indices |
| Watchlist Controller | [watchlistController.js](./controllers/watchlistController.md) | Watchlist CRUD |

### Utilities

| Utility | File | Documentation |
|---------|------|---------------|
| Technical Indicators | [technicalIndicators.js](./utils/technicalIndicators.md) | SMA, EMA, RSI, MACD |
| Validators | [validators.js](./utils/validators.md) | Joi validation schemas |
| XBRL Parser | [xbrlParser.js](./utils/xbrlParser.md) | Financial data parsing |

### External APIs

| API | File | Documentation |
|-----|------|---------------|
| NSE India | [nseIndiaApi.js](./api/nseIndiaApi.md) | NSE India integration |
| BSE India | [bseIndiaApi.js](./api/bseIndiaApi.md) | BSE India integration |
| Gemini AI | [geminiApi.js](./api/geminiApi.md) | AI analysis |

## Development

### Running the Server

```bash
# Prefer: install once from monorepo root (see repo README)
# yarn install

# From repository root
yarn workspace stock-screener-backend dev   # Development with hot reload
yarn workspace stock-screener-backend start # Production

# Or from backend/ (after root yarn install)
cd backend
yarn dev
yarn start
```

### Running Tests

```bash
yarn workspace stock-screener-backend test
yarn workspace stock-screener-backend test:watch
```

### Code Formatting

```bash
yarn workspace stock-screener-backend format
yarn workspace stock-screener-backend format:check
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 5000) |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `NODE_ENV` | No | Environment (development/production) |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `ALPHA_VANTAGE_API_KEY` | No | Alpha Vantage API key |
| `FMP_API_KEY` | No | Financial Modeling Prep API key |

## Adding New Features

### 1. Create a New Route

```javascript
// backend/routes/newFeature.js
const express = require('express');
const router = express.Router();
const { newHandler } = require('../controllers/newFeatureController');

router.get('/', newHandler);

module.exports = router;
```

### 2. Create the Controller

```javascript
// backend/controllers/newFeatureController.js

/**
 * Handler description
 * @route GET /api/new-feature
 * @access Public
 */
const newHandler = async (req, res, next) => {
  try {
    // Implementation
    res.json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};

module.exports = { newHandler };
```

### 3. Register the Route

```javascript
// backend/server.js
app.use('/api/new-feature', require('./routes/newFeature'));
```

### 4. Add Tests

```javascript
// backend/tests/newFeature.test.js
// See testing conventions in TESTING.md
```

## Database Models

### Stock Model
```javascript
// backend/models/Stock.js
{
  symbol: String,      // Unique, uppercase
  name: String,
  sector: String,
  industry: String,
  market_cap: Number,
  listing_date: Date,
  isin: String
}
```

### QuarterlyResult Model
```javascript
// backend/models/QuarterlyResult.js
{
  symbol: String,
  period: String,      // "Q1 2024"
  fiscal_year: Number,
  quarter: Number,
  revenue: Number,
  net_profit: Number,
  eps_basic: Number,
  // ... more fields
}
```

## Error Handling

All errors are caught by the global error handler:

```javascript
// backend/middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || 'Server Error'
  });
};
```

To throw a custom error:
```javascript
const error = new Error('Custom message');
error.statusCode = 400;
throw error;
```

