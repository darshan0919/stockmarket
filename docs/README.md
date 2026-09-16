# Stock Screener Documentation

> **Version**: 1.0.0  
> **Last Updated**: 2026-09-16  
> **Maintainer**: Stock Screener Team

## Overview

The Stock Market AI Ecosystem is a full-stack, platform-agnostic suite for advanced stock research, analysis, and automated insight generation. It provides real-time stock information, financial analysis, AI-driven indicators, and screening capabilities by securely wrapping NSE India, BSE India, Stockscans, and various LLM APIs.

The bulk of the repo's day-to-day value is the `skills/` directory (79+
equity-research Claude Agent Skills) and `jobs/Scheduled/` (scheduled
automation), which run via Claude Code/Cowork. The `screener-api` +
`screener-web` web app is a smaller, secondary piece of the ecosystem.

## Quick Links

| Document                                                    | Description                                                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| [Vision & Roadmap](./VISION_AND_ROADMAP.md)                 | Project philosophy, goals, and roadmap                                                  |
| [Architecture](./ARCHITECTURE.md)                           | System design and component overview                                                    |
| [Data Ecosystem v2](./DATA_ECOSYSTEM.md)                    | Flat JSON collections in `data/` ↔ Drive `StockMarket/data/v2` — design, envelope, sync |
| [Data Rules](./DATA_RULES.md)                               | MANDATORY checklist for any skill/job that persists data or adds a collection/type      |
| [Skill Data Audit](./SKILL_DATA_AUDIT.md)                   | Per-skill classification: what each skill needs, generates, and stores                  |
| [API Reference](./API_REFERENCE.md)                         | Complete REST API documentation (screener-api)                                          |
| [Testing Guide](./TESTING.md)                               | Testing strategies and conventions                                                      |
| [Contributing](./CONTRIBUTING.md)                           | Contribution guidelines                                                                 |
| [Stockscans API Schemas](./stockscans-api-schemas.md)       | Stockscans endpoint payload/response contracts                                          |
| [Anthropic API Schemas](./anthropic-api-schemas.md)         | Anthropic Messages API contract used by jobs-runtime digests                            |
| [Google Drive API Schemas](./google-drive-api-schemas.md)   | Google Drive API v3 sync contracts used by cloud-utils and jobs-runtime                 |
| [Order Book Extraction](./ORDER_BOOK_EXTRACTION.md)         | Order-book scraping/parsing pipeline                                                    |
| [Model Cost Orchestration](./MODEL_COST_ORCHESTRATION.md)   | Model selection and cost strategy across skills/jobs                                    |
| [Skills doc](./SKILLS.md)                                   | How the `skills/` framework works                                                       |
| [`screener-api/` README](../screener-api/README.md)         | Express REST API for the web app (see also `stock-api/README.md`)                       |
| [`stock-api/` README](../stock-api/README.md)               | Shared external-API clients + skill CLI entry points                                    |
| [`screener-web/` README](../screener-web/README.md)         | Next.js 14 frontend for the web app                                                     |
| [Dependency Tree Visualizer](../scripts/dependency-tree.js) | Visual multi-path dependency tree diagram generator for any variable or file            |

> **Note**: `docs/backend/` and `docs/frontend/` document the original
> `backend/`+`frontend/` app, which was deleted from the repo — those docs
> are marked historical/legacy at the top of each file. `docs/API_REFERENCE.md`
> and `docs/ARCHITECTURE.md` describe the current `screener-api`/`screener-web`.
> Several other docs aren't yet cross-linked from the Quick Links table above
> because their scope is narrower or they're partially superseded —
> `CONVERSATION_CAPTURE_PLAN.md`, `COWORK_DRIVE_DATA.md` (marked retired in
> its own header). Read them directly under `docs/` if you need that history.

## Project Structure

```
stockmarket/
├── package.json               # Yarn 3 workspaces root (yarn install, yarn dev)
├── yarn.lock                  # Pinned installs — commit to git
├── .yarnrc.yml                # Yarn settings (node_modules linker)
├── screener-api/               # Express.js REST API server — see screener-api/README.md
│   ├── src/core/               # Mongo config, shared api clients (NSE/BSE), middleware, utils
│   ├── src/features/           # per-feature routes/controllers/Mongoose models (stock, screener,
│   │                            # watchlist, market, orders, announcements, results, admin, twitter, research)
│   ├── scripts/                # Data fetching scripts (fetchData.js, etc.)
│   └── src/server.js           # Express entry point
├── screener-web/               # Next.js 14 React application — see screener-web/README.md
│   ├── pages/                  # Next.js pages
│   ├── src/core/                # shared components, API client (lib/api.js), hooks
│   └── src/features/            # dashboard, screener, results, stock feature components
├── stock-api/                  # shared external-API clients (Stockscans/NSE/BSE/etc.) + skill CLI entry points (bin/) — see stock-api/README.md
├── cloud-utils/                # Google Drive/Gmail integration shared across workspaces
├── packages/jobs-runtime/      # shared data/env/job-scheduling runtime for digests, trackers, skills
├── jobs/                       # scheduled-task definitions (delegate to packages/jobs-runtime)
├── skills/                     # Claude Agent Skills (equity-research, tooling, development) — see skills/README.md
├── data/                       # flat JSON collections ("Data Ecosystem v2") — gitignored, see DATA_ECOSYSTEM.md
├── docs/                       # Documentation
└── jira/                       # Feature specifications
```

## Tech Stack

### screener-api

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM — backs the web app's own screener/watchlist/stock-cache features specifically, not the skills/jobs data below
- **External APIs**: NSE India, BSE India, Stockscans

### screener-web

- **Framework**: Next.js 14
- **UI Library**: React 18
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **HTTP Client**: Axios

### Skills & jobs (Data Ecosystem v2)

- Flat JSON collections in `data/`, written only via
  `packages/jobs-runtime/lib/db.js`, mirrored to Google Drive. See
  [DATA_ECOSYSTEM.md](./DATA_ECOSYSTEM.md) and [DATA_RULES.md](./DATA_RULES.md).
  This is a separate data layer from the MongoDB one above — the two coexist
  for different purposes.

## Getting Started

### Prerequisites

- Node.js >= 18.x (enable Corepack: `corepack enable`)
- MongoDB >= 6.0 (for the `screener-api`/`screener-web` web app)
- Yarn 3 (version pinned via `packageManager` in root `package.json`)

### Quick Start

```bash
# Clone repository
git clone <repository-url>
cd stockmarket

corepack enable
yarn install

# Root .env: Mongo URL, PORT, API keys — see .env.example
# screener-web: API URL (create if missing)
echo "NEXT_PUBLIC_API_URL=http://localhost:5001/api" > screener-web/.env.local

# Run both apps in development (from repo root)
yarn dev
```

**Workspaces**: `screener-api`, `screener-web`, `stock-api`, `jobs`,
`cloud-utils`, and `packages/jobs-runtime` (see root `package.json`).
Dependencies resolve from the root `yarn.lock`.

### Environment Variables

Single root `.env` (see `.env.example` for the full list):

```env
PORT=5001
MONGO_URL=mongodb://localhost:27017/stockmarket
NODE_ENV=development
ALPHA_VANTAGE_API_KEY=<your-alphavantage-key>
FMP_API_KEY=<your-fmp-key>
```

**screener-web** (`screener-web/.env.local`):

```env
NEXT_PUBLIC_API_URL=http://localhost:5001/api
```

## Core Features

### 1. Stock Search & Details

- Real-time stock search via NSE India autocomplete API
- Comprehensive stock details including price, fundamentals, and technicals
- See: `screener-api/src/features/stock/stockController.js` → `searchStocks()`, `getStockDetails()`

### 2. Financial Results

- Quarterly and yearly financial results from XBRL data
- YoY and QoQ growth calculations
- Balance sheet and P&L analysis
- See: `screener-api/scripts/balanceSheetDataFetcher.js`

### 3. Stock Screener

- Filter stocks by market cap, P/E, P/B, ROE, ROCE
- Sort and paginate results
- See: `screener-api/src/features/screener/screenerController.js` → `runScreener()`

### 4. Technical Analysis

- SMA, EMA, RSI, MACD calculations
- Price chart with historical data
- See: `screener-api/src/core/utils/technicalIndicators.js`

### 5. Watchlist Management

- Add/remove stocks from watchlist
- Track multiple stocks
- See: `screener-api/src/features/watchlist/watchlistController.js`

### 6. Equity Research & AI Analysis

- Concall transcript analysis, forensic accounting, DRHP analysis, quarterly
  result analysis, and the rest of the deep research workflow now live in
  `skills/` (79+ skills) rather than in `screener-api`. See `skills/README.md`.
- Within `screener-api`, orderbook parsing and result-transcript endpoints
  still exist as thinner API-level features — see `docs/API_REFERENCE.md`.

## API Endpoints Quick Reference

| Endpoint                         | Method          | Description                  |
| --------------------------------- | --------------- | ----------------------------- |
| `/api/stocks/search`             | GET             | Search stocks by symbol/name |
| `/api/stocks/:symbol`            | GET             | Get stock details            |
| `/api/stocks/:symbol/quarterly`  | GET             | Get quarterly results        |
| `/api/stocks/:symbol/technicals` | GET             | Get technical indicators     |
| `/api/screener/run`              | POST            | Run stock screener           |
| `/api/watchlist`                 | GET/POST/DELETE | Manage watchlist             |
| `/api/market/indices`            | GET             | Get market indices           |
| `/api/upcoming-results`          | GET             | Get upcoming result dates    |

See [API_REFERENCE.md](./API_REFERENCE.md) for the full reference.

## Code Navigation

For AI agents and developers, key entry points:

### screener-api

- **Server Entry**: `screener-api/src/server.js`
- **Route Definitions**: `screener-api/src/features/*/*Routes.js`
- **Business Logic**: `screener-api/src/features/*/*Controller.js`
- **Data Models**: Mongoose models colocated per feature, e.g. `screener-api/src/features/stock/Stock.js`
- **External APIs**: `screener-api/src/core/api/*.js`
- **Utilities**: `screener-api/src/core/utils/*.js`

### screener-web

- **App Entry**: `screener-web/pages/_app.js`
- **API Client**: `screener-web/src/core/lib/api.js`
- **Custom Hooks**: `screener-web/src/core/lib/hooks/*.js`
- **Stock Components**: `screener-web/src/features/stock/components/*.js`
- **Common Components**: `screener-web/src/core/components/common/*.js`

## Related Documentation

- [NSE API Summary](../jira/implementation-notes/NSE-API-SUMMARY.md) - NSE India API details
- [XBRL Parsing Guide](../jira/implementation-notes/XBRL-PARSING-IMPLEMENTATION-GUIDE.md) - Financial data parsing
- [Orderbook Feature](../jira/features/orders/orderbook-feature-implementation.md) - Orderbook implementation
