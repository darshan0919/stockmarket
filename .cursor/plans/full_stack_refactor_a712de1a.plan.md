---
name: Full Stack Refactor
overview: "Comprehensive refactoring of the Stock Screener project: fix DRY violations, extract shared utilities, split fat files, add global state management, fix all bugs, modernize MongoDB setup, complete two-way linked documentation, and prepare for TypeScript migration."
todos:
  - id: install-skills
    content: Install code-refactoring and nextjs-best-practices skills
    status: completed
  - id: extract-nse-helpers
    content: Create backend/utils/nseHelpers.js consolidating parseNseDate, parseNseDateToTimestamp, NSE_HEADERS from 3+ files
    status: completed
  - id: extract-gemini-client
    content: Create backend/api/geminiClient.js with shared PDF parsing, JSON cleanup, and ModelResponse caching logic
    status: completed
  - id: fix-backend-bugs
    content: "Fix 5 bugs: undeclared data var, getROCE scope, modelRespnse typo, BSE_API_URL rename, missing let/const"
    status: completed
  - id: split-orders-route
    content: Refactor routes/orders.js (930 lines) into ordersController.js + ordersService.js + thin route file
    status: completed
  - id: extract-admin-announcements
    content: Move inline handlers from routes/admin.js and routes/announcements.js into proper controllers
    status: completed
  - id: modernize-mongodb
    content: "Update config/database.js: remove deprecated options, add pooling, graceful shutdown, event logging"
    status: completed
  - id: add-snackbar-context
    content: Create global SnackbarContext provider, wire into _app.js, replace local Snackbar state in OrdersTab
    status: completed
  - id: split-orderstab
    content: Split OrdersTab.js (2100 lines) into 6+ focused sub-components under components/stock/orders/
    status: completed
  - id: dry-formatters
    content: Remove duplicated formatters from SearchBar, UpcomingResults, results.js, ResultCard; add barrel export
    status: completed
  - id: add-swr
    content: Add SWR for data fetching, replace useState+useEffect patterns, remove console.log from API interceptors
    status: completed
  - id: replace-alert-confirm
    content: Replace alert() and confirm() calls with Snackbar and Modal components
    status: completed
  - id: generate-missing-docs
    content: Create ~20 missing documentation files referenced in code @see and README tables
    status: completed
  - id: fix-crosslinks
    content: Audit and fix all two-way doc-to-code and code-to-doc cross-references
    status: completed
  - id: organize-jira
    content: Restructure jira/ folder into features/, implementation-notes/, testing/ with index README
    status: completed
  - id: update-api-reference
    content: Update docs/API_REFERENCE.md to reflect all refactored controllers and routes
    status: completed
  - id: verify-tests-format
    content: Run npm test and npm run format across both backend and frontend; fix any regressions
    status: completed
isProject: false
---

# Full-Stack Clean Code Refactoring Plan

## Current State Assessment

The codebase has significant structural debt across all layers:

- **Backend**: 930-line `routes/orders.js` mixing routing + business logic, duplicated NSE headers/date parsers across 3+ files, two separate Gemini AI parsers with duplicated cache logic, bugs (undeclared vars, model name typos, misleading variable names)
- **Frontend**: 2100-line `OrdersTab.js`, no global state (Snackbar is local), duplicated formatters across components, no SSR/SWR/React Query, `alert()`/`confirm()` instead of proper UI
- **Docs**: 20+ referenced docs are missing, jira/ folder has 36 feature specs but no structure, cross-links are broken

## Phase 0: Install Additional Skills

Install two more high-value skills before starting:

```bash
npx skills add skillcreatorai/ai-agent-skills@code-refactoring -y      # 440 installs
npx skills add sickn33/antigravity-awesome-skills@nextjs-best-practices -y  # 2.2K installs
```

These, combined with the 10 already-installed skills, give us guidance for every refactoring area.

---

## Phase 1: Backend DRY Extraction and Bug Fixes

### 1.1 Extract Shared Utilities

Create shared modules to eliminate all duplicated code:

- `**backend/utils/nseHelpers.js**` -- Consolidate `parseNseDate`, `parseNseDateToTimestamp`, and `NSE_HEADERS` currently duplicated across:
  - [routes/orders.js](backend/routes/orders.js) (lines 123-155, line 14)
  - [api/orderbookBaselineParser.js](backend/api/orderbookBaselineParser.js) (lines 140-174)
  - [routes/announcements.js](backend/routes/announcements.js)
- `**backend/api/geminiClient.js**` -- Extract shared Gemini AI client with common logic for:
  - PDF content extraction and JSON cleanup
  - `ModelResponse` cache lookup/save pattern
  - Error handling and retry logic
  - Currently duplicated between [api/orderParser.js](backend/api/orderParser.js) and [api/orderbookBaselineParser.js](backend/api/orderbookBaselineParser.js)

### 1.2 Fix All Bugs

| Bug                                        | File                                           | Fix                        |
| ------------------------------------------ | ---------------------------------------------- | -------------------------- |
| Undeclared `data` variable                 | `controllers/resultTranscriptController.js:29` | Add `const`                |
| `getROCE` references `result` out of scope | `scripts/balanceSheetDataFetcher.js:55-61`     | Fix scope                  |
| Model name typo `modelRespnse`             | `models/ModelResponse.js:25`                   | Rename to `modelResponse`  |
| Misleading `BSE_API_URL` for Gemini URL    | `api/geminiApi.js:6`                           | Rename to `GEMINI_API_URL` |
| Variables without `let`/`const`            | `api/bseIndiaApi.js:25-26,30`                  | Add declarations           |

### 1.3 Split Fat Route File

Refactor [routes/orders.js](backend/routes/orders.js) (~930 lines) into:

```
backend/
├── controllers/
│   └── ordersController.js       # All handler functions
├── services/
│   └── ordersService.js          # Business logic (filtering, aggregation)
├── routes/
│   └── orders.js                 # Thin route definitions only (~50 lines)
```

Similarly, move inline handlers from [routes/announcements.js](backend/routes/announcements.js) and [routes/admin.js](backend/routes/admin.js) into proper controllers.

### 1.4 Modernize MongoDB Setup

Update [config/database.js](backend/config/database.js):

- Remove deprecated options (`useNewUrlParser`, `useUnifiedTopology`)
- Add connection pooling config (`maxPoolSize`, `serverSelectionTimeoutMS`)
- Add graceful shutdown handler
- Add connection event logging (connected, disconnected, error)
- Add indexes review across all models
- Follow patterns from the **mongodb** skill

---

## Phase 2: Frontend Modernization

### 2.1 Add Global State / Context

- `**frontend/lib/contexts/SnackbarContext.js` -- Global toast notification provider (replace local state in `OrdersTab`)
- `**frontend/lib/contexts/AppContext.js` -- Wrap app with providers in `_app.js`

### 2.2 Split Fat Component

Refactor [components/stock/OrdersTab.js](frontend/components/stock/OrdersTab.js) (~2100 lines) into:

```
frontend/components/stock/orders/
├── OrdersTab.js              # Main tab (imports sub-components)
├── OrderAnnouncements.js     # Announcement list + filters
├── OrderDetails.js           # Single order detail view
├── OrderBookSummary.js       # Orderbook aggregation view
├── OrderQuarterView.js       # Quarter-wise breakdown
├── OrderFilters.js           # Filter controls
└── OrderDownloads.js         # PDF download + ZIP logic
```

### 2.3 Eliminate Duplicated Formatters

Audit and consolidate all formatting functions into [lib/utils/formatters.js](frontend/lib/utils/formatters.js):

- Remove `formatPrice`, `formatChange`, `getChangeColor` from `SearchBar.js` -- import from formatters
- Remove `formatQuarterDate` duplication between `results.js` and `ResultCard.js`
- Remove inline formatters from `UpcomingResults.js` (`formatPrice`, `formatPercent`)
- Add barrel export: `frontend/lib/utils/index.js`

### 2.4 Improve Data Fetching

- Add **SWR** for client-side data fetching with caching, revalidation, and error retry
- Replace raw `useState` + `useEffect` fetch patterns across all pages and components
- Add request cancellation for unmounted components
- Remove `console.log` from API interceptors in production

### 2.5 Replace alert()/confirm() with Proper UI

- Replace `alert()` in `StockHeader.js` and `Watchlist` page with Snackbar
- Replace `confirm()` in `Watchlist` page with `Modal` component

---

## Phase 3: Documentation Completeness

### 3.1 Generate All Missing Docs

Create the ~20 missing documentation files referenced in code via `@see` and in README tables:

**Backend docs needed:**

- `docs/backend/controllers/` -- stockController.md, screenerController.md, marketController.md, watchlistController.md, ordersController.md (new), resultTranscriptController.md, declaredResultsController.md
- `docs/backend/utils/` -- validators.md, xbrlParser.md
- `docs/backend/api/` -- bseIndiaApi.md, geminiApi.md (update for new geminiClient)
- `docs/backend/services/` -- stockscansAuth.md

**Frontend docs needed:**

- `docs/frontend/components/` -- QuarterlyResults.md, StockHeader.md, ResultCard.md, ResultsFilterPanel.md
- `docs/frontend/hooks/` -- useMarket.md, useWatchlist.md
- `docs/frontend/utils/` -- formatters.md
- `docs/frontend/pages/` -- results.md

### 3.2 Ensure Two-Way Linking

Every doc must link to its source file, and every source file must have `@see` linking back to its doc. Audit and fix all broken cross-references.

### 3.3 Organize jira/ Folder

Structure the 36 files in [jira/](jira/) into categories:

```
jira/
├── features/                 # Feature specs and ideas
│   ├── search/
│   ├── financials/
│   ├── orders/
│   └── downloads/
├── implementation-notes/     # Implementation summaries (*-IMPLEMENTED.md)
├── testing/                  # Test guides
└── README.md                 # Index with links to all specs
```

### 3.4 Update API_REFERENCE.md

Update [docs/API_REFERENCE.md](docs/API_REFERENCE.md) to reflect any new controllers/routes created during refactoring.

---

## Phase 4: Verification and Cleanup

- Run `npm test` in both backend and frontend to ensure nothing is broken
- Run `npm run format` (Prettier) across the entire project
- Verify all `@see` doc links resolve to existing files
- Verify all JSDoc comments are present on new/modified functions

---

## Execution Approach

Each phase will be done as a series of focused changes:

```mermaid
graph LR
    P0[Phase0: Install Skills] --> P1A[1.1 Extract Utils]
    P1A --> P1B[1.2 Fix Bugs]
    P1B --> P1C[1.3 Split Routes]
    P1C --> P1D[1.4 Mongo Setup]
    P1D --> P2A[2.1 Global State]
    P2A --> P2B[2.2 Split OrdersTab]
    P2B --> P2C[2.3 DRY Formatters]
    P2C --> P2D[2.4 Add SWR]
    P2D --> P2E["2.5 Replace alert/confirm"]
    P2E --> P3A[3.1 Missing Docs]
    P3A --> P3B[3.2 Two-Way Links]
    P3B --> P3C[3.3 Organize jira]
    P3C --> P3D[3.4 Update API Ref]
    P3D --> P4[Phase4: Verify]
```

This is a large refactoring effort. Each sub-phase is a self-contained change that can be tested independently. We will follow the installed skills (nodejs-backend-patterns, frontend-patterns, mongodb, code-refactoring, nextjs-best-practices, documentation-update, file-organization, api-design, api-documentation) as guides throughout.
