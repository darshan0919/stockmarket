---
name: Frontend DaisyUI Revamp
overview: Install top frontend development skills, migrate the entire frontend from custom Tailwind CSS to DaisyUI with light/dark theme toggle, and clean up dead code, duplicate utilities, and redundant documentation across the codebase.
todos: []
isProject: false
---

# Frontend DaisyUI Revamp and Codebase Cleanup

## Phase 1: Install Frontend Development Skills

Install 4 top-rated skills relevant to our stack (Next.js + Tailwind + DaisyUI + React):


| Skill                                                  | Installs | Why                                                      |
| ------------------------------------------------------ | -------- | -------------------------------------------------------- |
| `wshobson/agents@tailwind-design-system`               | 12.1K    | Tailwind design system patterns                          |
| `bobmatnyc/claude-mpm-skills@daisyui`                  | 268      | DaisyUI component patterns (best DaisyUI-specific skill) |
| `vercel-labs/agent-skills@vercel-react-best-practices` | 174.6K   | React best practices from Vercel                         |
| `anthropics/skills@frontend-design`                    | 106.4K   | General frontend design patterns                         |


Commands:

```bash
npx skills add wshobson/agents@tailwind-design-system -y
npx skills add bobmatnyc/claude-mpm-skills@daisyui -y
npx skills add vercel-labs/agent-skills@vercel-react-best-practices -y
npx skills add anthropics/skills@frontend-design -y
```

---

## Phase 2: DaisyUI + Tailwind CSS Revamp (All Components)

### 2a. Setup DaisyUI

- Install `daisyui` as a dev dependency in [frontend/package.json](frontend/package.json)
- Update [frontend/tailwind.config.js](frontend/tailwind.config.js) to add the DaisyUI plugin with `light` + `dark` themes
- Revamp [frontend/styles/globals.css](frontend/styles/globals.css): remove custom `.table-container`, `.data-table`, `.spinner`, `.text-positive`, `.text-negative`, `.bg-positive`, `.bg-negative` classes -- these will be replaced by DaisyUI equivalents (`table`, `loading`, `text-success`, `text-error`, etc.)
- DaisyUI handles base font, scrollbar, and reset styles, so we can simplify `globals.css` significantly

### 2b. Common Components (6 files)


| Component                                                                    | DaisyUI Conversion                           |
| ---------------------------------------------------------------------------- | -------------------------------------------- |
| [Header.js](frontend/components/common/Header.js) (71 lines)                 | `navbar` component + dark mode `swap` toggle |
| [SearchBar.js](frontend/components/common/SearchBar.js) (222 lines)          | `input`, `dropdown`, `menu` components       |
| [Modal.js](frontend/components/common/Modal.js) (55 lines)                   | `modal` + `modal-box` component              |
| [Table.js](frontend/components/common/Table.js) (38 lines)                   | `table` component with zebra/hover           |
| [LoadingSpinner.js](frontend/components/common/LoadingSpinner.js) (13 lines) | `loading loading-spinner` component          |
| [Snackbar.js](frontend/components/common/Snackbar.js) (77 lines)             | `toast` + `alert` components                 |


### 2c. Dashboard Components (3 files)


| Component                                                                           | DaisyUI Conversion                         |
| ----------------------------------------------------------------------------------- | ------------------------------------------ |
| [UpcomingResults.js](frontend/components/dashboard/UpcomingResults.js) (625 lines)  | `card`, `table`, `badge`, `btn` components |
| [WatchlistSummary.js](frontend/components/dashboard/WatchlistSummary.js) (54 lines) | `card`, `stat` components                  |
| [MarketSnapshot.js](frontend/components/dashboard/MarketSnapshot.js) (58 lines)     | `stats` component                          |


### 2d. Results Components (2 files)


| Component                                                                              | DaisyUI Conversion                                    |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| [ResultCard.js](frontend/components/results/ResultCard.js) (232 lines)                 | `card`, `badge`, `stat` components                    |
| [ResultsFilterPanel.js](frontend/components/results/ResultsFilterPanel.js) (452 lines) | `select`, `input`, `btn-group`, `collapse` components |


### 2e. Stock Detail Components (14 files)


| Component                                                            | DaisyUI Conversion                          |
| -------------------------------------------------------------------- | ------------------------------------------- |
| [StockHeader.js](frontend/components/stock/StockHeader.js)           | `stat`, `badge` components                  |
| [QuarterlyResults.js](frontend/components/stock/QuarterlyResults.js) | `table`, `badge`, `collapse`                |
| [FinancialResults.js](frontend/components/stock/FinancialResults.js) | `table`, `tabs`                             |
| [BalanceSheet.js](frontend/components/stock/BalanceSheet.js)         | `table`                                     |
| [CashFlows.js](frontend/components/stock/CashFlows.js)               | `table`                                     |
| [YearlyResults.js](frontend/components/stock/YearlyResults.js)       | `table`, `badge`                            |
| [AnnouncementsTab.js](frontend/components/stock/AnnouncementsTab.js) | `card`, `badge`, `collapse`                 |
| [TranscriptTab.js](frontend/components/stock/TranscriptTab.js)       | `card`, `chat`, `collapse`                  |
| [ChartTab.js](frontend/components/stock/ChartTab.js)                 | `btn-group`, `card` (Recharts stays)        |
| [TechnicalTab.js](frontend/components/stock/TechnicalTab.js)         | `stat`, `progress`, `badge`                 |
| [FundamentalsTab.js](frontend/components/stock/FundamentalsTab.js)   | `stat`, `card`                              |
| [FinancialsTab.js](frontend/components/stock/FinancialsTab.js)       | `tabs` component                            |
| [OrdersTab (+ sub-components)](frontend/components/stock/orders/)    | `table`, `card`, `btn`, `badge`, `collapse` |


### 2f. Screener Components (2 files)


| Component                                                                  | DaisyUI Conversion                |
| -------------------------------------------------------------------------- | --------------------------------- |
| [FilterPanel.js](frontend/components/screener/FilterPanel.js) (280 lines)  | `range`, `select`, `input`, `btn` |
| [ResultsTable.js](frontend/components/screener/ResultsTable.js) (76 lines) | `table`                           |


### 2g. Pages (6 files)


| Page                                                  | DaisyUI Conversion                         |
| ----------------------------------------------------- | ------------------------------------------ |
| [app.js](frontend/pages/_app.js)                      | Add `data-theme` attribute, theme provider |
| [document.js](frontend/pages/_document.js)            | Set default `data-theme="light"`           |
| [index.js](frontend/pages/index.js)                   | `hero`, layout with DaisyUI grid           |
| [results.js](frontend/pages/results.js)               | Layout updates                             |
| [watchlist.js](frontend/pages/watchlist.js)           | `table`, `btn`                             |
| [screener.js](frontend/pages/screener.js)             | Layout updates                             |
| [stock/[symbol].js](frontend/pages/stock/[symbol].js) | `tabs` component for tab navigation        |
| [404                                                  |                                            |


