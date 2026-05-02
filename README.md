# Stock Screener Application

A comprehensive local-first stock screener web application for analyzing Indian stocks. Built with Next.js, Express, and MongoDB.

## Features

- 🔍 **Stock Search**: Fast auto-complete search across 500+ stocks
- 📊 **Advanced Screener**: Filter stocks with 15+ fundamental and technical criteria
- 📈 **Price Charts**: Interactive 5-year price charts with SMA overlays
- 📋 **Watchlist**: Track your favorite stocks with real-time price updates
- 💹 **Technical Indicators**: RSI, MACD, SMA50, SMA200 calculations
- 📑 **Financial Statements**: View P&L and Balance Sheets for last 4 quarters
- 🎯 **Pre-built Screeners**: Value, Growth, Dividend, Quality stock templates
- 📤 **CSV Export**: Export screener results to CSV

## Tech Stack

### Backend
- **Node.js** + **Express.js** - REST API
- **MongoDB** + **Mongoose** - Database
- **Axios** - External API calls
- **Joi** - Input validation

### Frontend
- **Next.js 14** - React framework
- **React 18** - UI library
- **Tailwind CSS** - Styling
- **Recharts** - Data visualization
- **Axios** - API client

## Project Structure

```
stockmarket/
├── package.json         # Yarn 3 workspaces root (yarn install, yarn dev)
├── yarn.lock            # Pinned dependency tree (commit this file)
├── .yarnrc.yml          # Yarn Berry settings (node_modules linker)
├── backend/
│   ├── config/           # Database configuration
│   ├── models/           # Mongoose schemas
│   ├── routes/           # API routes
│   ├── controllers/      # Business logic
│   ├── utils/           # Helper functions
│   ├── scripts/         # Data fetching scripts
│   ├── middleware/      # Error handling
│   └── server.js        # Express server
├── frontend/
│   ├── pages/           # Next.js pages
│   ├── components/      # React components
│   ├── lib/            # API client & utilities
│   ├── styles/         # CSS files
│   └── public/         # Static assets
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+ (includes [Corepack](https://nodejs.org/api/corepack.html) for the pinned Yarn version)
- MongoDB installed and running
- Terminal

Enable Corepack once per machine (lets the repo use Yarn 3 via the `packageManager` field in `package.json`):

```bash
corepack enable
```

### Installation

#### 1. Clone the repository and install dependencies

```bash
cd stockmarket
yarn install
```

This installs every dependency for the root package, `backend`, and `frontend` (Yarn workspaces).

#### 2. Configure environment

**Backend** — create `backend/.env` (see values your deployment needs), for example:

```bash
cat > backend/.env << EOF
MONGO_URL=mongodb://localhost:27017/stock-screener
PORT=5000
ALPHA_VANTAGE_API_KEY=your_api_key_here
FMP_API_KEY=your_api_key_here
NODE_ENV=development
EOF
```

**Frontend** — point the app at the API:

```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:5000/api" > frontend/.env.local
```

#### 3. Seed the database (optional, first run)

```bash
node backend/scripts/fetchData.js
```

#### 4. Run the full stack in development

From the **repository root**:

```bash
yarn dev
```

This starts the Express API (nodemon) and Next.js (`next dev`) together. Backend defaults to `http://localhost:5000`, frontend to `http://localhost:3000`.

To run a single workspace:

```bash
yarn workspace stock-screener-backend dev
yarn workspace stock-screener-frontend dev
```

### Accessing the Application

Open your browser and go to:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000/api

## API Endpoints

### Stock APIs
- `GET /api/stocks/search?q={query}` - Search stocks
- `GET /api/stocks/:symbol` - Get stock details
- `GET /api/stocks/:symbol/technicals` - Get technical indicators
- `GET /api/stocks/:symbol/financials` - Get financial statements

### Screener API
- `POST /api/screener/run` - Run stock screener with filters

### Watchlist APIs
- `GET /api/watchlist` - Get all watchlist items
- `POST /api/watchlist/:symbol` - Add stock to watchlist
- `DELETE /api/watchlist/:symbol` - Remove from watchlist

### Market APIs
- `GET /api/market/indices` - Get market indices data
- `GET /api/market/stats` - Get market statistics

## Usage Guide

### Dashboard
- Search for stocks using the search bar
- View market snapshot (Nifty 50, Sensex, sector performance)
- Quick access to watchlist summary
- Launch pre-built screeners

### Screener
- Apply filters: Market Cap, P/E, P/B, ROE, ROCE, Debt/Equity, etc.
- Click "Run Screener" to see results
- Click on any stock row to view details
- Export results to CSV

### Stock Details
- **Overview**: Company information and key metrics
- **Fundamentals**: All financial ratios and metrics
- **Financials**: P&L and Balance Sheet for 4 quarters
- **Chart**: 5-year price chart with SMA50 and SMA200
- **Technicals**: RSI, MACD, and moving averages

### Watchlist
- Add stocks from screener or stock details page
- View real-time prices and changes
- Remove stocks with one click

## Data Management

### Initial Data Population

The `scripts/fetchData.js` script seeds the database with 20 sample Indian stocks and generates:
- 5 years of daily price history
- Latest fundamental metrics
- 4 quarters of financial statements

```bash
cd backend
node scripts/fetchData.js
```

### Daily Data Updates

Run the update script to refresh prices and fundamentals:

```bash
cd backend
node scripts/updateData.js
```

To automate daily updates, set up a cron job:

```bash
# Edit crontab
crontab -e

# Add this line to run daily at 6:00 PM IST
0 18 * * * cd /Users/darshan.patel/code/personal/stockmarket/backend && node scripts/updateData.js
```

## Available Scripts

### Root (repository)

- `yarn install` — Install all workspace dependencies (uses `yarn.lock`)
- `yarn dev` — Backend + frontend dev servers in one terminal
- `yarn test` — Run backend tests, then frontend tests
- `yarn format` — Prettier in backend, then frontend

### Backend (`yarn workspace stock-screener-backend <script>`)

- `yarn workspace stock-screener-backend start` — Production server
- `yarn workspace stock-screener-backend dev` — Development with nodemon

### Frontend (`yarn workspace stock-screener-frontend <script>`)

- `yarn workspace stock-screener-frontend dev` — Next.js dev server
- `yarn workspace stock-screener-frontend build` — Production build
- `yarn workspace stock-screener-frontend start` — Production server

## Sample Stocks Included

The application comes pre-seeded with 20 major Indian stocks:
- RELIANCE, TCS, HDFCBANK, INFY, ICICIBANK
- HINDUNILVR, ITC, SBIN, BHARTIARTL, KOTAKBANK
- LT, AXISBANK, WIPRO, ASIANPAINT, MARUTI
- SUNPHARMA, TITAN, ULTRACEMCO, BAJFINANCE, NESTLEIND

## Features in Detail

### Screener Filters
- Market Cap (Min/Max)
- Sectors (Multi-select)
- P/E Ratio (Min/Max)
- P/B Ratio (Min/Max)
- ROE % (Min/Max)
- ROCE % (Min/Max)
- Debt/Equity (Max)
- Revenue Growth 3Y (Min %)
- Profit Growth 3Y (Min %)
- Dividend Yield % (Min/Max)
- Current Ratio (Min)

### Pre-built Screeners
1. **Value Stocks**: P/E ≤ 15, P/B ≤ 3, ROE ≥ 15%
2. **Growth Stocks**: Revenue Growth ≥ 15%, Profit Growth ≥ 15%
3. **Dividend Stocks**: Dividend Yield ≥ 2%, P/E ≤ 20
4. **Low Debt**: D/E ≤ 0.5, Current Ratio ≥ 1.5
5. **Quality Stocks**: ROE ≥ 15%, ROCE ≥ 15%, D/E ≤ 1

## Troubleshooting

### MongoDB Connection Error
- Ensure MongoDB is running: `mongod` or `brew services start mongodb-community`
- Check MONGO_URL in backend/.env

### Port Already in Use
- Backend (5000): Change PORT in backend/.env
- Frontend (3000): Use `yarn workspace stock-screener-frontend dev -- -p 3001`

### No Data in Application
- Run the seed script: `node backend/scripts/fetchData.js`

### API Errors
- Check backend server is running on port 5000
- Verify NEXT_PUBLIC_API_URL in frontend/.env.local

## Performance Notes

- Initial database seed takes 2-3 minutes
- Screener queries execute in < 3 seconds
- Price charts sample data for optimal rendering
- Watchlist refreshes every 5 minutes

## Future Enhancements

- Add more stocks (NSE 500)
- Real-time price updates via WebSocket
- Advanced charting (candlestick, volume)
- Portfolio tracking
- Backtesting engine
- Email alerts for watchlist

## License

This project is for personal use only.

## Support

For issues or questions, create an issue in the repository.

---

**Built with ❤️ for personal investment analysis**
