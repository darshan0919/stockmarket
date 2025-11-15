# Fiscal Year Implementation for Indian Stocks

## Overview
Successfully implemented proper fiscal year handling for Indian stocks, where the financial year runs from April to March (e.g., FY25 = April 2024 to March 2025).

## Problem Statement
The previous implementation treated quarters based on calendar year (Q1 = Jan-Mar, Q2 = Apr-Jun, etc.), which is incorrect for Indian companies that follow a fiscal year starting in April.

## Changes Implemented

### 1. Backend: Fiscal Quarter & Year Calculation

**File**: `backend/controllers/stockController.js`

#### Fiscal Quarter Mapping (lines 774-797)
```javascript
// Fiscal Q1 = Apr-Jun (month 3-5)
// Fiscal Q2 = Jul-Sep (month 6-8)  
// Fiscal Q3 = Oct-Dec (month 9-11)
// Fiscal Q4 = Jan-Mar (month 0-2)

const month = toDate.getMonth(); // 0-11

if (month >= 3 && month <= 5) {
  quarter = 1;
  fiscal_year = toDate.getFullYear() + 1; // FY 2025 for Apr-Jun 2024
} else if (month >= 6 && month <= 8) {
  quarter = 2;
  fiscal_year = toDate.getFullYear() + 1;
} else if (month >= 9 && month <= 11) {
  quarter = 3;
  fiscal_year = toDate.getFullYear() + 1;
} else {
  quarter = 4;
  fiscal_year = toDate.getFullYear(); // FY 2025 for Jan-Mar 2025
}

const period = `Q${quarter} FY${String(fiscal_year).slice(-2)}`;
```

#### Period Format
- **Old Format**: `Q1 2024`, `Q2 2024`, etc.
- **New Format**: `Q1 FY24`, `Q2 FY25`, etc.

#### Examples
| Date | Calendar Quarter | Fiscal Quarter | Fiscal Year | Period |
|------|------------------|----------------|-------------|---------|
| 2024-01-15 | Q1 2024 | Q4 | FY24 | Q4 FY24 |
| 2024-03-31 | Q1 2024 | Q4 | FY24 | Q4 FY24 |
| 2024-04-01 | Q2 2024 | Q1 | FY25 | Q1 FY25 |
| 2024-06-30 | Q2 2024 | Q1 | FY25 | Q1 FY25 |
| 2024-07-01 | Q3 2024 | Q2 | FY25 | Q2 FY25 |
| 2024-09-30 | Q3 2024 | Q2 | FY25 | Q2 FY25 |
| 2024-10-01 | Q4 2024 | Q3 | FY25 | Q3 FY25 |
| 2024-12-31 | Q4 2024 | Q3 | FY25 | Q3 FY25 |

### 2. Backend: YoY & QoQ Growth Calculations

**File**: `backend/controllers/stockController.js` (lines 454-535)

#### Updated Growth Logic
- **YoY Growth**: Now compares the same fiscal quarter from the previous fiscal year
  - Q1 FY25 is compared with Q1 FY24
  - Q2 FY26 is compared with Q2 FY25
  - Also ensures consolidated/standalone types are matched

- **QoQ Growth**: Compares with the previous fiscal quarter
  - Q2 FY25 is compared with Q1 FY25
  - Q1 FY25 is compared with Q4 FY24
  - Handles fiscal year boundaries correctly

```javascript
// YoY Growth - find the same fiscal quarter from previous year
const prevYearQuarter = sorted.find(
  (q, i) =>
    i > index &&
    q.quarter === quarter.quarter &&
    q.fiscal_year === quarter.fiscal_year - 1 &&
    q.consolidated === quarter.consolidated
);

// QoQ Growth - compare with previous fiscal quarter
const prevQuarter = sorted.find(
  (q, i) =>
    i > index &&
    q.consolidated === quarter.consolidated &&
    (q.fiscal_year === quarter.fiscal_year
      ? q.quarter === quarter.quarter - 1
      : q.fiscal_year === quarter.fiscal_year - 1 && q.quarter === 4)
);
```

### 3. Frontend: Yearly Results Aggregation

**File**: `frontend/components/stock/YearlyResults.js`

#### Fiscal Year Aggregation (lines 41-160)
- Parses fiscal year from period string (e.g., "Q1 FY25" → 2025)
- Groups quarters by fiscal year (Apr-Mar)
- Calculates yearly totals for:
  - Sales, Expenses, Operating Profit
  - Other Income, Interest, Depreciation
  - PBT, Net Profit, EPS
  - OPM%, Tax%

#### TTM (Trailing Twelve Months) Column
- Added TTM column showing the last 4 fiscal quarters
- Calculated separately for consolidated and standalone results
- Always appears as the rightmost column
- TTM is compared with the previous full fiscal year for YoY growth

#### Yearly Display Format
- **Column Headers**: `FY23`, `FY24`, `FY25`, `TTM`
- **YoY Growth**: Compares FY25 with FY24, FY24 with FY23, TTM with latest full FY

### 4. API Response Updates

**File**: `backend/controllers/stockController.js` (lines 540-570)

Added `quarter` and `fiscal_year` fields to API response:
```json
{
  "period": "Q1 FY25",
  "quarter": 1,
  "fiscal_year": 2025,
  "to_date": "2024-06-30T00:00:00.000Z",
  "from_date": "2024-04-01T00:00:00.000Z",
  "sales": 54867.1,
  "net_profit": 4769.7,
  "yoy_sales_growth": 20.17,
  "qoq_sales_growth": 12.34,
  "consolidated": true
}
```

## Testing Results

### Test 1: SRM Stock
```json
{
  "period": "Q4 FY24",
  "quarter": 4,
  "fiscal_year": 2024,
  "to_date": "2024-03-31",
  "sales": 107.87,
  "consolidated": true
}
{
  "period": "Q1 FY25",
  "quarter": 1,
  "fiscal_year": 2025,
  "to_date": "2024-06-30",
  "sales": 54.87,
  "consolidated": true
}
```

### Test 2: ETERNAL Stock
```json
{
  "period": "Q4 FY25",
  "quarter": 4,
  "fiscal_year": 2025,
  "to_date": "2025-03-31",
  "sales": 2192
}
{
  "period": "Q1 FY26",
  "quarter": 1,
  "fiscal_year": 2026,
  "to_date": "2025-06-30",
  "sales": 2413
}
```

### Test 3: RELIANCE - YoY Growth Validation
```
Q1 FY25: Sales 236,217 Cr → YoY: +12.04% (vs Q1 FY24)
Q2 FY25: Sales 235,481 Cr → YoY: +0.22% (vs Q2 FY24)
Q3 FY25: Sales 243,865 Cr → YoY: +6.97% (vs Q3 FY24)
Q4 FY25: Sales 264,573 Cr → YoY: +9.91% (vs Q4 FY24)
Q1 FY26: Sales 248,660 Cr → YoY: +5.27% (vs Q1 FY25) ✅
Q2 FY26: Sales 258,898 Cr → YoY: +9.94% (vs Q2 FY25) ✅
```

All YoY comparisons are correctly matching fiscal quarters!

## Benefits

1. **Accurate Comparisons**: YoY growth now compares the same fiscal periods (Q1 with Q1, Q2 with Q2)
2. **Industry Standard**: Matches how Indian companies and analysts report financial results
3. **Proper Aggregation**: Yearly results correctly aggregate Apr-Mar fiscal years
4. **TTM Support**: Added Trailing Twelve Months for real-time performance view
5. **Clear Labeling**: Period labels clearly indicate fiscal year (FY24, FY25, etc.)

## Database Impact

- Existing cached data in `QuarterlyResult` collection will be automatically updated on next fetch
- `force_refresh=true` parameter can be used to immediately update any stock's data
- Cache expiry is set to 2 days, so all data will naturally refresh within 2 days

## Files Modified

1. `backend/controllers/stockController.js`
   - Fiscal quarter calculation (lines 774-797)
   - Fiscal year assignment (lines 838)
   - YoY/QoQ growth logic (lines 454-535)
   - API response format (lines 540-570)

2. `frontend/components/stock/YearlyResults.js`
   - Fiscal year aggregation (lines 41-160)
   - TTM calculation (lines 103-153)
   - YoY growth for yearly data (lines 213-247)

3. `backend/models/QuarterlyResult.js`
   - Already had `quarter` and `fiscal_year` fields (no changes needed)

## Verification

✅ Fiscal quarter mapping correct (Apr-Jun = Q1, Jul-Sep = Q2, Oct-Dec = Q3, Jan-Mar = Q4)
✅ Fiscal year assignment correct (FY ends in March of that year)
✅ YoY growth compares same fiscal quarters
✅ QoQ growth compares sequential fiscal quarters
✅ Yearly aggregation uses fiscal year (Apr-Mar)
✅ TTM column shows last 4 fiscal quarters
✅ Period format updated (Q1 FY25 instead of Q1 2024)
✅ All tests passing for SRM, ETERNAL, and RELIANCE stocks

## Impact on Users

- Users will now see correct fiscal year periods in both Quarterly and Yearly Results widgets
- YoY comparisons will be more meaningful (comparing same business seasons)
- TTM column provides up-to-date performance view
- No breaking changes - API structure remains compatible

## Next Steps

- Monitor for any edge cases with older historical data
- Consider adding fiscal year info tooltip for user education
- Add fiscal year filter option to view specific FY data

---

**Implementation Date**: November 15, 2025
**Status**: ✅ Complete and Tested
**Cache Refresh**: Automatic over 2 days, or use `?force_refresh=true`

