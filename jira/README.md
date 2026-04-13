# Jira / Feature Specifications

Feature specifications, implementation notes, testing guides, and **local Jira-style issue docs** for the Stock Screener application.

When someone says **“log Jira”** in this repo, the default is to add markdown under **`jira/issues/`** (or related folders) with tracking fields—not to create tickets in an external Jira unless explicitly requested. See `.cursor/rules/jira.mdc`.

## Table of Contents

- [Issues (local tracking)](#issues-local-tracking)
- [Features](#features)
  - [Search](#search)
  - [Financials](#financials)
  - [Orders](#orders)
  - [Downloads](#downloads)
  - [General](#general)
- [Implementation Notes](#implementation-notes)
- [Testing](#testing)

---

## Issues (local tracking)

Tracked bugs/tasks as markdown (optional **Issue Key** if mirrored in real Jira).

| Document | Description |
|----------|-------------|
| [issues/README.md](issues/README.md) | Convention for `jira/issues/` |
| [STOCK-ANNOUNCEMENTS-PAGINATION-ZIP-COUNT.md](issues/STOCK-ANNOUNCEMENTS-PAGINATION-ZIP-COUNT.md) | StockScans pagination broke bulk ZIP + announcement counts; offset fix |
| [STOCK-ANNOUNCEMENTS-STOCKSCANS-500-BAD-SYMBOL.md](issues/STOCK-ANNOUNCEMENTS-STOCKSCANS-500-BAD-SYMBOL.md) | StockScans HTTP 500 for unknown company mislabeled; clearer codes + UI hints |

---

## Features

### Search

| Document | Description |
|----------|-------------|
| [search-enhancement-1.md](features/search/search-enhancement-1.md) | Search API and Search Bar requirements (StockScans API integration) |
| [global-search-bar-implementation.md](features/search/global-search-bar-implementation.md) | Move search bar to header for global availability across all pages |

### Financials

| Document | Description |
|----------|-------------|
| [quarterly-yearly-results-final.md](features/financials/quarterly-yearly-results-final.md) | Final enhancements to Quarterly & Yearly Results widgets |
| [quarterly-results-enhancements-v3.md](features/financials/quarterly-results-enhancements-v3.md) | Major enhancements: Crores format, broadcast time, dual API, consolidated/standalone |
| [all-quarterly-results-enhancement.md](features/financials/all-quarterly-results-enhancement.md) | Display all available quarters with horizontal scrolling |
| [all-quarterly-results-screen.md](features/financials/all-quarterly-results-screen.md) | Add Quarterly Results widget to Financials tab (Screener.in style) |
| [merged-financial-results.md](features/financials/merged-financial-results.md) | Merge Quarterly and Yearly Results into single FinancialResults component |
| [financial-widgets-status.md](features/financials/financial-widgets-status.md) | Status report for financial widgets (EPS growth, Balance Sheet, Cash Flows) |
| [financial-widgets-expansion.md](features/financials/financial-widgets-expansion.md) | Implementation plan for expanding Financials tab (Ratios, Shareholding, Documents) |
| [fiscal-year-implementation.md](features/financials/fiscal-year-implementation.md) | Indian fiscal year handling (Apr–Mar) for quarters and YoY/QoQ growth |

### Orders

| Document | Description |
|----------|-------------|
| [orderbook-feature-implementation.md](features/orders/orderbook-feature-implementation.md) | OrderBook tracking and analysis in FundamentalsTab |
| [orders-non-ai-enhancements.md](features/orders/orders-non-ai-enhancements.md) | Copy JSON, baseline document, error fixes for Non-AI mode |
| [orders-non-ai-mode-implementation.md](features/orders/orders-non-ai-mode-implementation.md) | Non-AI mode for Orders Tab (raw announcements, no AI processing) |

### Downloads

| Document | Description |
|----------|-------------|
| [download-all-pdfs-feature.md](features/downloads/download-all-pdfs-feature.md) | Bulk download of order announcement PDFs |
| [download-zip-implementation-final.md](features/downloads/download-zip-implementation-final.md) | Server-side ZIP creation for PDF downloads |
| [snackbar-direct-download-final.md](features/downloads/snackbar-direct-download-final.md) | Snackbar notifications and direct download to Desktop/Stock_Data |

### General

| Document | Description |
|----------|-------------|
| [screener-init.md](features/screener-init.md) | Stock Screener MVP development prompt and requirements |
| [ideas.md](features/ideas.md) | Feature ideas and future enhancements |

---

## Implementation Notes

Post-implementation documentation and technical guides.

| Document | Description |
|----------|-------------|
| [search-enhancement-1-IMPLEMENTED.md](implementation-notes/search-enhancement-1-IMPLEMENTED.md) | StockScans API integration implementation summary |
| [search-enhancement-NSE-IMPLEMENTED.md](implementation-notes/search-enhancement-NSE-IMPLEMENTED.md) | NSE India autocomplete API implementation |
| [all-quarterly-results-screen-IMPLEMENTED.md](implementation-notes/all-quarterly-results-screen-IMPLEMENTED.md) | Quarterly Results widget implementation |
| [XBRL-PARSING-IMPLEMENTED.md](implementation-notes/XBRL-PARSING-IMPLEMENTED.md) | XBRL parsing for quarterly financial results |
| [XBRL-PARSING-IMPLEMENTATION-GUIDE.md](implementation-notes/XBRL-PARSING-IMPLEMENTATION-GUIDE.md) | Guide for XBRL-based quarterly results implementation |
| [NSE-STOCK-DETAILS-IMPLEMENTED.md](implementation-notes/NSE-STOCK-DETAILS-IMPLEMENTED.md) | NSE India Quote API for stock details page |
| [NSE-API-SUMMARY.md](implementation-notes/NSE-API-SUMMARY.md) | NSE India API integration quick summary |
| [balance-sheet-cashflow-implemented.md](implementation-notes/balance-sheet-cashflow-implemented.md) | Balance Sheet & Cash Flows XBRL extraction |
| [balance-sheet-and-cashflow-fix-summary.md](implementation-notes/balance-sheet-and-cashflow-fix-summary.md) | Fix summary for Balance Sheet and Cash Flow issues |
| [balance-sheet-issue-analysis.md](implementation-notes/balance-sheet-issue-analysis.md) | Root cause analysis for missing Balance Sheet data |
| [srm-missing-quarters-fix.md](implementation-notes/srm-missing-quarters-fix.md) | SRM missing latest quarters – cache and resolution |
| [final-implementation-summary.md](implementation-notes/final-implementation-summary.md) | Financial widgets final implementation summary |

---

## Testing

Testing guides and fix documentation.

| Document | Description |
|----------|-------------|
| [QUARTERLY-RESULTS-FIX-AND-TESTS.md](testing/QUARTERLY-RESULTS-FIX-AND-TESTS.md) | Quarterly Results 404 fix and test additions |
| [QUARTERLY-RESULTS-TESTING.md](testing/QUARTERLY-RESULTS-TESTING.md) | Quarterly Results widget testing guide |
| [QUICK-TEST-GUIDE.md](testing/QUICK-TEST-GUIDE.md) | Quick test guide for stock details page |
| [TESTING-GUIDE.md](testing/TESTING-GUIDE.md) | Testing guide for search enhancement |
