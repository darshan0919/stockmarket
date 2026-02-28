# Financial Widgets Expansion - Implementation Plan

## Overview
Expanding the Financials tab to match Screener.in functionality with comprehensive financial data widgets.

## Completed Tasks ✅

### 1. EPS Growth Metrics
- ✅ Added YoY EPS Growth calculation to backend
- ✅ Added QoQ EPS Growth calculation to backend
- ✅ Updated `calculateGrowthMetrics()` function
- ✅ Added fields to API response
- ✅ Updated frontend QuarterlyResults component with new rows

**Files Modified:**
- `backend/controllers/stockController.js` - Lines 501-510 (YoY), 542-551 (QoQ), 589, 592
- `frontend/components/stock/QuarterlyResults.js` - Lines 136-167

### 2. BalanceSheet Component (Structure Created)
- ✅ Created `frontend/components/stock/BalanceSheet.js`
- ✅ Implemented Quarterly/Yearly toggle
- ✅ Implemented Consolidated/Standalone toggle
- ✅ Added horizontal scrolling
- ✅ Created table structure with:
  - Liabilities: Equity Capital, Reserves, Borrowings, Other Liabilities
  - Assets: Fixed Assets, CWIP, Investments, Other Assets
  - Totals: Total Liabilities, Total Assets

### 3. CashFlows Component (Structure Created)
- ✅ Created `frontend/components/stock/CashFlows.js`
- ✅ Implemented Quarterly/Yearly toggle
- ✅ Implemented Consolidated/Standalone toggle
- ✅ Added table structure for:
  - Cash from Operating Activity
  - Cash from Investing Activity
  - Cash from Financing Activity
  - Net Cash Flow

## Pending Tasks 🔄

### 4. Ratios Component
**Status**: Not Started
**Priority**: High

Create `frontend/components/stock/Ratios.js` with:
- Quarterly/Yearly toggle
- Consolidated/Standalone toggle
- Metrics based on Screener.in:
  - Debtor Days
  - Inventory Days
  - Days Payable
  - Cash Conversion Cycle
  - Working Capital Days
  - ROCE %
  - ROE %
  - Debt to Equity
  - Current Ratio
  - Quick Ratio

### 5. ShareholdingPattern Component
**Status**: Not Started
**Priority**: Medium

Create `frontend/components/stock/ShareholdingPattern.js` with:
- Quarterly/Yearly toggle
- Shareholding categories:
  - Promoters
  - FIIs (Foreign Institutional Investors)
  - DIIs (Domestic Institutional Investors)
  - Public
  - Number of Shareholders
- Visualization: Stacked bar chart or line chart showing trends

### 6. Documents Component
**Status**: Not Started
**Priority**: Low

Create `frontend/components/stock/Documents.js` with sections:
- **Announcements**: Recent, Important, Search, All
  - Fetch from NSE API or company website
- **Annual Reports**: By financial year
- **Credit Ratings**: From CARE, CRISIL, ICRA
- **Concalls**: Earnings call transcripts, notes, PPT

### 7. Backend API Development
**Status**: Not Started
**Priority**: Critical

#### 7.1 Balance Sheet API
**Endpoint**: `GET /api/stocks/:symbol/balance-sheet`

Need to add balance sheet fields to `QuarterlyResult` model:
```javascript
// Add to schema
equity_capital: Number,
reserves: Number,
borrowings: Number,
other_liabilities: Number,
total_liabilities: Number,
fixed_assets: Number,
cwip: Number,
investments: Number,
other_assets: Number,
total_assets: Number,
```

Update XBRL parser to extract these fields from NSE XBRL documents.

#### 7.2 Cash Flows API
**Endpoint**: `GET /api/stocks/:symbol/cash-flows`

Add cash flow fields to `QuarterlyResult` model:
```javascript
cash_from_operating: Number,
cash_from_investing: Number,
cash_from_financing: Number,
net_cash_flow: Number,
```

Update XBRL parser for cash flow items.

#### 7.3 Ratios API
**Endpoint**: `GET /api/stocks/:symbol/ratios`

Calculate ratios from existing data:
- Debtor Days = (Debtors / Sales) * 365
- Inventory Days = (Inventory / COGS) * 365
- ROCE = (EBIT / Capital Employed) * 100
- ROE = (Net Profit / Shareholders' Equity) * 100

Some fields need to be extracted from balance sheet.

#### 7.4 Shareholding API
**Endpoint**: `GET /api/stocks/:symbol/shareholding`

**NSE API**: `https://www.nseindia.com/api/corporate-shareholding?index=equities&symbol={SYMBOL}`

Create new model: `ShareholdingPattern`
```javascript
const shareholdingSchema = new mongoose.Schema({
  symbol: { type: String, required: true, index: true },
  quarter_end_date: { type: Date, required: true },
  promoters: Number,
  fiis: Number,
  diis: Number,
  public: Number,
  num_shareholders: Number,
  last_updated: { type: Date, default: Date.now },
});
```

#### 7.5 Documents API
**Endpoint**: `GET /api/stocks/:symbol/documents`

**NSE APIs**:
- Announcements: `https://www.nseindia.com/api/corporate-announcements?index=equities&symbol={SYMBOL}`
- Annual Reports: Extract from company filings
- Credit Ratings: Fetch from rating agency websites
- Concalls: Store links manually or scrape from earnings call platforms

### 8. Update FinancialsTab
**Status**: Not Started
**File**: `frontend/components/stock/FinancialsTab.js`

Import and render all new components:
```javascript
import QuarterlyResults from './QuarterlyResults';
import YearlyResults from './YearlyResults';
import BalanceSheet from './BalanceSheet';
import CashFlows from './CashFlows';
import Ratios from './Ratios';
import ShareholdingPattern from './ShareholdingPattern';
import Documents from './Documents';

// In JSX:
<div className="space-y-8">
  <QuarterlyResults symbol={symbol} />
  <YearlyResults symbol={symbol} />
  <BalanceSheet symbol={symbol} />
  <CashFlows symbol={symbol} />
  <Ratios symbol={symbol} />
  <ShareholdingPattern symbol={symbol} />
  <Documents symbol={symbol} />
</div>
```

### 9. Testing
**Status**: Not Started

Test all widgets with multiple stocks:
- SRM
- RELIANCE
- ETERNAL
- TCS
- INFY

Verify:
- Data accuracy
- Toggle functionality (Quarterly/Yearly, Consolidated/Standalone)
- Responsive design
- Loading states
- Error handling
- Horizontal scrolling

## XBRL Field Mapping for Balance Sheet

Based on XBRL documents structure:

```javascript
const BALANCE_SHEET_FIELD_MAP = {
  // Liabilities
  'in-gaap_EquityShareCapital': 'equity_capital',
  'in-gaap_ReservesAndSurplus': 'reserves',
  'in-gaap_LongTermBorrowings': 'long_term_borrowings',
  'in-gaap_ShortTermBorrowings': 'short_term_borrowings',
  'in-gaap_TotalLiabilities': 'total_liabilities',
  
  // Assets
  'in-gaap_PropertyPlantAndEquipment': 'fixed_assets',
  'in-gaap_CapitalWorkInProgress': 'cwip',
  'in-gaap_Investments': 'investments',
  'in-gaap_TotalAssets': 'total_assets',
};
```

## XBRL Field Mapping for Cash Flows

```javascript
const CASH_FLOW_FIELD_MAP = {
  'in-gaap_CashFlowFromOperatingActivities': 'cash_from_operating',
  'in-gaap_CashFlowFromInvestingActivities': 'cash_from_investing',
  'in-gaap_CashFlowFromFinancingActivities': 'cash_from_financing',
  'in-gaap_NetCashFlow': 'net_cash_flow',
};
```

## Implementation Priority

1. **HIGH PRIORITY**:
   - Backend: Add balance sheet and cash flow fields to XBRL parser
   - Backend: Update QuarterlyResult model
   - Backend: Ensure data is stored for all new fields
   - Frontend: Complete data integration for BalanceSheet and CashFlows components

2. **MEDIUM PRIORITY**:
   - Ratios component and API
   - ShareholdingPattern component and API
   - Testing with multiple stocks

3. **LOW PRIORITY**:
   - Documents component (less critical for analysis)
   - UI enhancements and polish
   - Additional calculated metrics

## Estimated Effort

- Backend XBRL parser updates: 4-6 hours
- Balance Sheet & Cash Flows data integration: 3-4 hours
- Ratios component: 3-4 hours
- ShareholdingPattern component: 2-3 hours
- Documents component: 4-5 hours
- Testing and bug fixes: 2-3 hours

**Total**: ~20-25 hours of development

## Current Status Summary

✅ **Completed** (30%):
- EPS Growth metrics
- Component structures for BalanceSheet and CashFlows
- UI framework with toggles

🔄 **In Progress** (20%):
- Backend data integration needed

⏳ **Pending** (50%):
- Ratios component
- ShareholdingPattern component
- Documents component
- Complete backend APIs
- Full testing

## Next Immediate Steps

1. Update `backend/utils/xbrlParser.js` to extract balance sheet and cash flow fields
2. Update `backend/models/QuarterlyResult.js` to include new fields
3. Test XBRL parsing with a few stocks
4. Connect frontend components to real data
5. Restart backend and verify data flow

---

**Note**: This is a large expansion. Consider implementing in phases:
- **Phase 1**: Balance Sheet & Cash Flows (data integration)
- **Phase 2**: Ratios
- **Phase 3**: Shareholding Pattern
- **Phase 4**: Documents

Each phase should be fully tested before moving to the next.

