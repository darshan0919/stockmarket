# Stock Screener Documentation

> **Version**: 1.0.0  
> **Last Updated**: 2024-12-31  
> **Maintainer**: Stock Screener Team

## Overview

The Stock Market AI Ecosystem is a full-stack, platform-agnostic suite for advanced stock research, analysis, and automated insight generation. It provides real-time stock information, financial analysis, AI-driven indicators, and screening capabilities by securely wrapping NSE India, BSE India, Stockscans, and various LLM APIs.

## Quick Links

| Document                                                  | Description                                                                             |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [Vision & Roadmap](./VISION_AND_ROADMAP.md)               | Project philosophy, goals, and roadmap                                                  |
| [Architecture](./ARCHITECTURE.md)                         | System design and component overview                                                    |
| [Data Ecosystem v2](./DATA_ECOSYSTEM.md)                  | Flat JSON collections in `data/` ↔ Drive `StockMarket/data/v2` — design, envelope, sync |
| [Data Rules](./DATA_RULES.md)                             | MANDATORY checklist for any skill/job that persists data or adds a collection/type      |
| [Skill Data Audit](./SKILL_DATA_AUDIT.md)                 | Per-skill classification: what each skill needs, generates, and stores                  |
| [API Reference](./API_REFERENCE.md)                       | Complete REST API documentation                                                         |
| [Backend Guide](./backend/README.md)                      | Backend development guide                                                               |
| [Frontend Guide](./frontend/README.md)                    | Frontend development guide                                                              |
| [Testing Guide](./TESTING.md)                             | Testing strategies and conventions                                                      |
| [Contributing](./CONTRIBUTING.md)                         | Contribution guidelines                                                                 |
| [Stockscans API Schemas](./stockscans-api-schemas.md)     | Stockscans endpoint payload/response contracts                                          |
| [Anthropic API Schemas](./anthropic-api-schemas.md)       | Anthropic Messages API contract used by jobs-runtime digests                            |
| [Order Book Extraction](./ORDER_BOOK_EXTRACTION.md)       | Order-book scraping/parsing pipeline                                                    |
| [Model Cost Orchestration](./MODEL_COST_ORCHESTRATION.md) | Model selection and cost strategy across skills/jobs                                    |
| [Skills doc](./SKILLS.md)                                 | How the `skills/` framework works                                                       |
| [`screener-api/` README](../screener-api/README.md)       | Newer API service (see also `stock-api/README.md`)                                      |
| [`stock-api/` README](../stock-api/README.md)             | Shared external-API clients + skill CLI entry points                                    |
| [`screener-web/` README](../screener-web/README.md)       | Newer frontend                                                                          |

> **Note**: several docs below aren't yet cross-linked from a Quick Links row
> because their scope is narrower or they're partially superseded —
> `CONVERSATION_CAPTURE_PLAN.md`, `COWORK_DRIVE_DATA.md` (marked retired in
> its own header). Read them directly under `docs/` if you need that history.

## Project Structure

```
stockmarket/
├── package.json               # Yarn 3 workspaces root (yarn install, yarn dev)
├── yarn.lock                  # Pinned installs — commit to git
├── .yarnrc.yml                # Yarn settings (node_modules linker)
├── backend/                    # Express.js REST API server
│   ├── api/                   # External API integrations (NSE, BSE, Gemini)
│   ├── controllers/           # Request handlers
│   ├── models/                # Mongoose schemas
│   ├── routes/                # API route definitions
│   ├── utils/                 # Utility functions
│   ├── middleware/            # Express middleware
│   ├── scripts/               # Data fetching scripts
│   └── tests/                 # Unit tests
├── frontend/                   # Next.js React application
│   ├── components/            # React components
│   ├── lib/                   # API client and utilities
│   ├── pages/                 # Next.js pages
│   └── styles/                # CSS styles
├── screener-api/               # newer API service — see screener-api/README.md
├── screener-web/               # newer frontend — see screener-web/README.md
├── stock-api/                  # shared external-API clients (Stockscans/NSE/BSE/etc.) + skill CLI entry points (bin/) — see stock-api/README.md
├── cloud-utils/                # Google Drive/Gmail integration shared across workspaces
├── packages/jobs-runtime/      # shared data/env/job-scheduling runtime for digests, trackers, skills
├── jobs/                       # scheduled-task definitions (delegate to packages/jobs-runtime)
├── skills/                     # Claude Agent Skills (equity-research, tooling, development) — see skills/README.md
├── docs/                       # Documentation
└── jira/                       # Feature specifications
```

> **Note**: this tree and the "Core Features"/"API Endpoints" sections below
> describe the original `backend/`+`frontend/` app in detail. The newer
> `stock-api/`, `screener-api/`, `screener-web/`, `packages/jobs-runtime/`,
> and `skills/` areas are documented in their own READMEs (linked in Quick
> Links above) rather than duplicated here — this file hasn't been fully
> reconciled with which stack is authoritative for which feature; treat the
> per-workspace READMEs as the source of truth when they disagree with the
> narrative below.

## Tech Stack

### Backend

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **External APIs**: NSE India, BSE India, Gemini AI

### Frontend

- **Framework**: Next.js 14
- **UI Library**: React 18
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **HTTP Client**: Axios

## Getting Started

### Prerequisites

- Node.js >= 18.x (enable Corepack: `corepack enable`)
- MongoDB >= 6.0
- Yarn 3 (version pinned via `packageManager` in root `package.json`)

### Quick Start

```bash
# Clone repository
git clone <repository-url>
cd stockmarket

corepack enable
yarn install

# Backend: create backend/.env (Mongo URL, PORT, API keys — see README)
# Frontend: API URL (create if missing)
echo "NEXT_PUBLIC_API_URL=http://localhost:5000/api" > frontend/.env.local

# Run both apps in development (from repo root)
yarn dev
```

**Workspaces**: `backend` and `frontend` are Yarn workspaces. Dependencies resolve from the root `yarn.lock`.

### Environment Variables

**Backend** (`backend/.env`):

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/stockmarket
NODE_ENV=development
GEMINI_API_KEY=<your-gemini-api-key>
ALPHA_VANTAGE_API_KEY=<your-alphavantage-key>
FMP_API_KEY=<your-fmp-key>
```

**Frontend** (`frontend/.env.local`):

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

## Core Features

### 1. Stock Search & Details

- Real-time stock search via NSE India autocomplete API
- Comprehensive stock details including price, fundamentals, and technicals
- See: `backend/controllers/stockController.js` → `searchStocks()`, `getStockDetails()`

### 2. Financial Results

- Quarterly and yearly financial results from XBRL data
- YoY and QoQ growth calculations
- Balance sheet and P&L analysis
- See: `backend/scripts/balanceSheetDataFetcher.js`

### 3. Stock Screener

- Filter stocks by market cap, P/E, P/B, ROE, ROCE
- Sort and paginate results
- See: `backend/controllers/screenerController.js` → `runScreener()`

### 4. Technical Analysis

- SMA, EMA, RSI, MACD calculations
- Price chart with historical data
- See: `backend/utils/technicalIndicators.js`

### 5. Watchlist Management

- Add/remove stocks from watchlist
- Track multiple stocks
- See: `backend/controllers/watchlistController.js`

### 6. AI-Powered Analysis

- Earnings call transcript analysis using Gemini AI
- Orderbook parsing with AI
- See: `backend/api/geminiApi.js`

## API Endpoints Quick Reference

| Endpoint                         | Method          | Description                  |
| -------------------------------- | --------------- | ---------------------------- |
| `/api/stocks/search`             | GET             | Search stocks by symbol/name |
| `/api/stocks/:symbol`            | GET             | Get stock details            |
| `/api/stocks/:symbol/quarterly`  | GET             | Get quarterly results        |
| `/api/stocks/:symbol/technicals` | GET             | Get technical indicators     |
| `/api/screener/run`              | POST            | Run stock screener           |
| `/api/watchlist`                 | GET/POST/DELETE | Manage watchlist             |
| `/api/market/indices`            | GET             | Get market indices           |
| `/api/upcoming-results`          | GET             | Get upcoming result dates    |

## Code Navigation

For AI agents and developers, key entry points:

### Backend

- **Server Entry**: `backend/server.js`
- **Route Definitions**: `backend/routes/*.js`
- **Business Logic**: `backend/controllers/*.js`
- **Data Models**: `backend/models/*.js`
- **External APIs**: `backend/api/*.js`
- **Utilities**: `backend/utils/*.js`

### Frontend

- **App Entry**: `frontend/pages/_app.js`
- **API Client**: `frontend/lib/api.js`
- **Custom Hooks**: `frontend/lib/hooks/*.js`
- **Stock Components**: `frontend/components/stock/*.js`
- **Common Components**: `frontend/components/common/*.js`

## Related Documentation

- [NSE API Summary](../jira/implementation-notes/NSE-API-SUMMARY.md) - NSE India API details
- [XBRL Parsing Guide](../jira/implementation-notes/XBRL-PARSING-IMPLEMENTATION-GUIDE.md) - Financial data parsing
- [Orderbook Feature](../jira/features/orders/orderbook-feature-implementation.md) - Orderbook implementation
