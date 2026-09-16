# Setup

1. Jobs folder is linked as cowork root folder.
2. .env at root has all the secrets
3. Google drive is used as database.
4. All skills are stored in github & orchestrated via a single registry skill

# 📈 Stock Market AI Ecosystem

A comprehensive, **platform-agnostic AI ecosystem** built for advanced stock research, screening, and tracking. What started as a local-first stock screener has evolved into an ultimate system to simplify and automate the investing journey.

> **Our Ultimate Goal**: Constantly learn ➔ take notes ➔ convert to actionable insights ➔ implement into our thesis/signal generation system ➔ review/test ➔ iterate.

By wrapping around and enhancing existing third-party APIs (NSE, BSE, Stockscans, LLMs), we provide a robust, cross-platform product suite that manages data pipelines efficiently with minimal resources.

## 🌟 Ecosystem Vision & Highlights

- **Platform-Agnostic Architecture**: Designed to seamlessly integrate cross-platform tools, bridging web interfaces, automated background jobs, and AI agents.
- **Robust Database Management (Minimal Resources)**: Leveraging highly optimized data pipelines (`@stock/jobs` and `cowork-jobs`), the system syncs, offloads, and manages massive datasets without overwhelming local or cloud resources.
- **Enhanced Third-Party APIs**: We wrap existing APIs (NSE, BSE, AlphaVantage) and augment them with AI and custom caching layers to deliver enriched insights faster.
- **Automated AI Insights**: Wrapping around LLMs and skills to parse filings, extract catalysts, and generate actionable insights automatically.

## 🚀 Achievements & Roadmap

### What We've Achieved So Far

- **Comprehensive Screener**: Fast, auto-complete search across 500+ stocks with 15+ fundamental and technical filters.
- **Technical & Fundamental Workbenches**: 5-year interactive price charts, SMA overlays, RSI, MACD, and 4-quarter P&L/Balance Sheets.
- **Automated Data Pipelines**: Cron-scheduled jobs that offload and sync data autonomously.
- **AI-Powered Watchlists**: Real-time tracking infused with AI insight validation.
- **Corporate Announcements Scanner**: Dedicated workflows to scan and analyze corporate documents and track top gainers live.

### What to Expect Next

- **Advanced Signal Generation**: Transforming raw notes and learned patterns into automated trading/investing signals.
- **Broader Market Coverage**: Expanding to the broader NSE 500 and beyond.
- **Real-time Event Streaming**: Upgrading to WebSocket-based live price feeds and alerts.
- **Backtesting Engine**: A robust engine to test our generated signals against historical data.

---

## 💻 Core Features

- 🔍 **Stock Search**: Fast auto-complete search across 500+ stocks
- 📊 **Advanced Screener**: Filter stocks with 15+ fundamental and technical criteria
- 📈 **Price Charts**: Interactive 5-year price charts with SMA overlays
- 📋 **Watchlist**: Track your favorite stocks with real-time price updates
- 🏢 **Corporate Announcements**: Scan and analyze corporate announcements and documents
- 🚀 **Top Gainers**: Track daily top gainers live
- 🤖 **Automated Insights**: AI-powered insight validation and generation for watchlists
- 🔄 **Data Pipelines**: Robust jobs for syncing and offloading data from real sources (NSE, BSE, Stockscans)
- 💹 **Technical Indicators**: RSI, MACD, SMA50, SMA200 calculations
- 📑 **Financial Statements**: View P&L and Balance Sheets for last 4 quarters
- 🎯 **Pre-built Screeners**: Value, Growth, Dividend, Quality stock templates
- 📤 **CSV Export**: Export screener results to CSV

## Tech Stack

### `screener-api` (Express API)

- **Node.js** + **Express.js** - REST API
- **MongoDB** + **Mongoose** - Database for the web app's own screener/watchlist/stock-cache data
- **Axios** - External API calls
- **Joi** - Input validation

### `screener-web` (Next.js frontend)

- **Next.js 14** - React framework
- **React 18** - UI library
- **Tailwind CSS** - Styling
- **Recharts** - Data visualization
- **Axios** - API client

### Skills & jobs (the bulk of the repo's value today)

- **`skills/`** - 79+ Claude Agent Skills for Indian equity research (concall
  analysis, forensic accounting, DRHP/IPO analysis, quarterly-result
  analysis, etc.) — run via Claude Code/Cowork, not the web stack. See
  `skills/README.md`.
- **`jobs/Scheduled/`** - scheduled automation jobs (digests, trackers,
  scanners) that delegate to `packages/jobs-runtime/`.
- **Data Ecosystem v2** - flat JSON collections under `data/`, accessed only
  through `packages/jobs-runtime/lib/db.js`, mirrored to Google Drive. See
  `docs/DATA_ECOSYSTEM.md` and `docs/DATA_RULES.md`. This is separate from
  the MongoDB layer above — MongoDB backs `screener-api`'s own transactional
  features (screener runs, watchlist), while the Data Ecosystem backs
  research/skills data.

## Project Structure

```
stockmarket/
├── package.json          # Yarn 3 workspaces root (yarn install, yarn dev)
├── yarn.lock             # Pinned dependency tree (commit this file)
├── .yarnrc.yml            # Yarn Berry settings (node_modules linker)
├── screener-api/          # Express REST API (workspace: screener-api)
│   ├── src/core/          # config (Mongo), shared api clients, middleware, utils
│   ├── src/features/      # one folder per feature: stock, screener, watchlist,
│   │                       # market, orders, announcements, results, admin, twitter, research
│   │   └── .../*Routes.js, *Controller.js, and Mongoose models (e.g. stock/Stock.js)
│   ├── scripts/           # data-fetch scripts (fetchData.js, etc.)
│   └── src/server.js      # Express entry point
├── screener-web/          # Next.js 14 frontend (workspace: screener-web)
│   ├── pages/              # Next.js pages
│   ├── src/core/           # shared components, API client (lib/api.js), hooks
│   └── src/features/       # dashboard, screener, results, stock feature components
├── stock-api/             # shared external-API clients (Stockscans/NSE/BSE) + skill CLI entry points
├── cloud-utils/           # Google Drive/Gmail integration shared across workspaces
├── packages/jobs-runtime/ # shared data/env/job-scheduling runtime (db.js is the only writer to data/)
├── jobs/                  # scheduled-task definitions (delegate to packages/jobs-runtime)
├── skills/                # Claude Agent Skills (equity research, tooling, dev) — see skills/README.md
├── data/                  # flat JSON collections ("Data Ecosystem v2") — gitignored, see docs/DATA_ECOSYSTEM.md
├── docs/                  # Documentation
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

This installs every dependency for the root package and all workspaces
(`screener-api`, `screener-web`, `stock-api`, `jobs`, `cloud-utils`,
`packages/jobs-runtime`) in one Yarn 3 install.

#### 2. Configure environment

There is a single root `.env` (see `.env.example` for the full list of keys —
Mongo URL, port, third-party API keys, Google Drive/skills credentials, etc.),
for example:

```bash
cat >> .env << EOF
MONGO_URL=mongodb://localhost:27017/stock-screener
PORT=5001
EOF
```

**screener-web** — point the app at the API (`screener-web/.env.local`):

```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:5001/api" > screener-web/.env.local
```

#### 3. Seed the database (optional, first run)

```bash
yarn seed
```

#### 4. Run the full stack in development

From the **repository root**:

```bash
yarn dev
```

This starts `screener-api` (nodemon) and `screener-web` (`next dev`) together
via `concurrently`. `screener-api` defaults to port `5001` (auto-picks the
next free port if taken), `screener-web` to `http://localhost:3000`.

To run a single workspace:

```bash
yarn workspace screener-api dev
yarn workspace screener-web dev
```

### Accessing the Application

Open your browser and go to:

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5001/api

## API Endpoints

`screener-api` routes live under `screener-api/src/features/<feature>/`. Key
examples (see `docs/API_REFERENCE.md` for the full reference):

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
- **Insights**: AI-powered insight validation and summaries for watched stocks

### Corporate Announcements & Scans

- Scan through official corporate announcements
- Live tracking of Top Gainers
- Dedicated dashboards for detailed document analysis

## Data Management

There are two separate data layers in this repo — don't confuse them:

1. **MongoDB** — backs `screener-api`'s own screener/watchlist/stock-cache
   features (the web app you run with `yarn dev`).
2. **Data Ecosystem v2** — flat JSON collections under `data/`, used by
   `skills/` and `jobs/`, accessed only through
   `packages/jobs-runtime/lib/db.js` and mirrored to Google Drive. See
   `docs/DATA_ECOSYSTEM.md` and `docs/DATA_RULES.md` for the authoritative
   description.

### Initial Data Population (MongoDB / web app)

`screener-api/scripts/fetchData.js` seeds the database with sample Indian
stocks and generates price history, fundamentals, and financial statements:

```bash
yarn seed
```

### Data Ecosystem sync (skills/jobs data)

```bash
yarn data:push        # push local data/ to Google Drive
yarn data:pull        # pull latest from Google Drive
yarn data:sync        # push, then pull, then print status
yarn data:status      # sync status
```

## Available Scripts

### Root (repository)

- `yarn install` — Install all workspace dependencies (uses `yarn.lock`)
- `yarn dev` — `screener-api` + `screener-web` dev servers together (via `concurrently`)
- `yarn build` — Production build of `screener-web`
- `yarn start` — `screener-api` + `screener-web` production servers together
- `yarn seed` — Seed MongoDB via `screener-api/scripts/fetchData.js`
- `yarn test` — Run `screener-api` tests, then `screener-web` tests
- `yarn format` / `yarn format:check` — Prettier across the repo
- `yarn lint` / `yarn lint:fix` — ESLint across the repo
- `yarn quality` — Pre-submit sweep: `rules:check` + `format:check` + `lint` + `test`
- `yarn dead-code:scan` — Scan monorepo for unreferenced files, committed stray artifacts, and coding practice violations
- `yarn dep:tree <target>` — Generate visual dependency tree diagram (HTML, Mermaid, text) for any given variable or file across direct imports, skills, scheduled jobs, and scripts
- `yarn data:push` / `yarn data:pull` / `yarn data:sync` / `yarn data:status` — Data Ecosystem v2 sync with Google Drive (see above)
- `yarn rules:check` / `yarn rules:sync` — verify/fix parity between `AGENTS.md` and the tool-specific rule files (`CLAUDE.md`, `.cursor/rules/*.mdc`, `.gemini/rules/*.md`)

### screener-api (`yarn workspace screener-api <script>`)

- `yarn workspace screener-api start` — Production server
- `yarn workspace screener-api dev` — Development with nodemon
- `yarn workspace screener-api test` — Jest tests

### screener-web (`yarn workspace screener-web <script>`)

- `yarn workspace screener-web dev` — Next.js dev server
- `yarn workspace screener-web build` — Production build
- `yarn workspace screener-web start` — Production server

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
- Check `MONGO_URL` in the root `.env`

### Port Already in Use

- `screener-api` (default 5001): change `PORT` in the root `.env`, or let it auto-pick the next free port
- `screener-web` (3000): `yarn workspace screener-web dev -- -p 3001`

### No Data in Application

- Run the seed script: `yarn seed`

### API Errors

- Check the `screener-api` server is running (port 5001 by default)
- Verify `NEXT_PUBLIC_API_URL` in `screener-web/.env.local`

## Performance Notes

- Initial database seed takes 2-3 minutes
- Screener queries execute in < 3 seconds
- Price charts sample data for optimal rendering
- Watchlist refreshes every 5 minutes

## License

This project is for personal use only.

## Support

For issues or questions, create an issue in the repository.

---

**Built with ❤️ for personal investment analysis**
