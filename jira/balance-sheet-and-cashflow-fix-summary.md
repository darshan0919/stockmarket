# Balance Sheet & Cash Flow Issue - Fix Summary

**Date**: November 16, 2025  
**Status**: ✅ PARTIALLY FIXED - Cash Flow updated, Balance Sheet requires annual data

---

## 🎯 Summary

### Issues Found
1. ❌ **Balance Sheet data**: Not available in NSE quarterly XBRL files (only in annual reports)
2. ⚠️ **Cash Flow data**: Available but **cumulative** (not quarterly breakdowns)

### Actions Taken
1. ✅ Updated XBRL parser with NSE field names (`in-capmkt:` namespace)
2. ✅ Added user-friendly message for missing Balance Sheet data
3. ✅ Documented the root cause and limitations
4. ✅ Updated Cash Flow field mappings

---

## 📊 What NSE Provides in Quarterly XBRL

### ✅ Available (Working)
| Data Type | Granularity | Status |
|-----------|-------------|--------|
| P&L Statement | Quarterly | ✅ Working |
| Cash Flow Statement | **Cumulative (YTD)** | ⚠️ Cumulative only |

### ❌ NOT Available
| Data Type | Reason | Alternative |
|-----------|--------|-------------|
| Balance Sheet | Only in annual reports | Need annual XBRL/PDF parsing |

---

## 🔧 Changes Made

### 1. Backend - XBRL Parser (`backend/utils/xbrlParser.js`)

**Added NSE field mappings for Cash Flow**:
```javascript
// Cash Flows (NSE format in-capmkt namespace)
"in-capmkt:CashFlowsFromUsedInOperatingActivities": "cash_from_operating",
"in-capmkt:CashFlowsFromUsedInInvestingActivities": "cash_from_investing",
"in-capmkt:CashFlowsFromUsedInFinancingActivities": "cash_from_financing",
"in-capmkt:IncreaseDecreaseInCashAndCashEquivalents": "net_cash_flow",
```

**Updated field extraction logic**:
```javascript
const cleanField = xbrlField.replace("in-bse-fin:", "").replace("in-capmkt:", "");
```

### 2. Frontend - Balance Sheet Widget (`frontend/components/stock/BalanceSheet.js`)

**Added data availability check and informative message**:
- Detects when Balance Sheet data is missing
- Shows yellow info box explaining NSE limitations  
- Provides link to view official NSE reports
- Explains that we're working on annual report integration

---

## 📝 Understanding Cash Flow Data

### The Reality
NSE quarterly XBRL files provide **Year-to-Date (YTD) cumulative** cash flows, not quarter-by-quarter breakdowns.

**Example for Q2 FY26** (Jul-Sep 2025):
- File contains data for `FourD` context = Apr-Sep 2025 (6 months cumulative)
- To get Q2 only, we'd need to subtract Q1 values
- Q1 data is in a separate XBRL file

### Current Behavior
```
XBRL provides:
Q1 Filing: Cash flow for Apr-Jun (3 months)
Q2 Filing: Cash flow for Apr-Sep (6 months) ← Cumulative!
Q3 Filing: Cash flow for Apr-Dec (9 months) ← Cumulative!
Q4 Filing: Cash flow for Apr-Mar (12 months) ← Full year!
```

### To Get Quarterly Cash Flow
We need to:
1. Fetch multiple XBRL files (current + previous quarters)
2. Calculate differences:
   - Q2 = H1 data - Q1 data
   - Q3 = 9M data - H1 data
   - Q4 = FY data - 9M data

---

## 🎨 Updated User Experience

### Balance Sheet Widget
**Before**: Showed empty table with zeros  
**After**: Shows informative message:

```
⚠️ Balance Sheet Data Not Available

NSE only provides Balance Sheet data in annual financial reports, 
not in quarterly filings. Quarterly XBRL documents contain P&L and 
Cash Flow statements only.

We're working on integrating annual report data to show Balance Sheet 
information. In the meantime, you can view the official reports on NSE.

[View on NSE →]
```

### Cash Flow Widget
**Before**: Showed undefined/null values  
**After**: Will show cumulative YTD cash flows (after next data refresh)

---

## 🚀 Next Steps

### Short-term (This Week)
1. ⏳ **Implement quarterly Cash Flow calculation**
   - Fetch previous quarters
   - Calculate quarter-by-quarter differences
   - Store calculated values in database

2. ⏳ **Add YTD indicators**
   - Show "YTD" label for cumulative data
   - Add tooltip explaining cumulative nature
   - Optionally show both YTD and quarterly

### Medium-term (Next Sprint)
1. ⏳ **Implement Annual Balance Sheet fetching**
   - Research NSE annual report APIs
   - Implement annual XBRL parsing
   - Update Balance Sheet widget with annual data

2. ⏳ **Data quality improvements**
   - Add data freshness indicators
   - Show "As of [Date]" for point-in-time data
   - Add refresh timestamps

### Long-term (Future)
1. ⏳ **PDF report parsing**
   - Parse annual reports (PDF format)
   - Extract Balance Sheet, detailed ratios
   - Implement OCR if needed

2. ⏳ **Data aggregation service**
   - Combine multiple data sources
   - Validate data consistency
   - Handle data conflicts gracefully

---

## 📋 Files Modified

| File | Changes | Status |
|------|---------|--------|
| `backend/utils/xbrlParser.js` | Added NSE Cash Flow field mappings | ✅ DONE |
| `frontend/components/stock/BalanceSheet.js` | Added data availability check & message | ✅ DONE |
| `jira/balance-sheet-issue-analysis.md` | Comprehensive root cause analysis | ✅ DONE |
| `jira/balance-sheet-and-cashflow-fix-summary.md` | This summary document | ✅ DONE |

---

## 🧪 Testing

### Test Cash Flow Data
```bash
curl "http://localhost:5000/api/stocks/SRM/quarterly?force_refresh=true" | \
  jq '.data.quarters[0] | {period, cash_from_operating, cash_from_investing, cash_from_financing}'
```

**Expected**: Values should populate (cumulative YTD data)

### Test Balance Sheet Widget
1. Navigate to `http://localhost:3000/stock/SRM`
2. Go to Financials tab
3. Scroll to Balance Sheet widget
4. Should see yellow info box with explanation

---

## 💡 Key Learnings

### 1. NSE Data Structure
- Quarterly filings: P&L + cumulative Cash Flow only
- Annual filings: Complete financials including Balance Sheet
- XBRL namespace: `in-capmkt:` (not `in-bse-fin:`)

### 2. Context IDs in XBRL
- `OneD`: Q1 only (Apr-Jun)
- `FourD`: H1 cumulative (Apr-Sep)
- `OneI`: Point-in-time snapshot (Sep 30)
- `PY_I`: Previous year snapshot (Mar 31)

### 3. Data Availability
Even Screener.in doesn't show quarterly Balance Sheets - they use annual data!

---

## 📚 References

### NSE APIs
- Quarterly Results: `https://www.nseindia.com/api/corporates-financial-results`
- Filing Documents: `https://www.nseindia.com/api/integrated-filing-results`
- Company Info: `https://www.nseindia.com/api/quote-equity`

### Screener.in (for comparison)
- Example: `https://www.screener.in/company/SRM/`
- Shows: Quarterly P&L, Annual Balance Sheet, Annual Cash Flows

### XBRL Standards
- Indian XBRL Taxonomy: `in-capmkt:` namespace for capital markets
- BSE XBRL: `in-bse-fin:` namespace (different from NSE)

---

## ✅ Verification Checklist

- [x] Identified root cause (NSE doesn't provide quarterly BS)
- [x] Updated XBRL parser with NSE field names
- [x] Added user-friendly error message for Balance Sheet
- [x] Documented limitations and workarounds
- [x] Created action plan for future improvements
- [ ] Test Cash Flow data with multiple stocks
- [ ] Implement quarterly Cash Flow calculation
- [ ] Research annual Balance Sheet data sources
- [ ] Update documentation for developers

---

## 🎯 Success Criteria

### Immediate (This Session)
- ✅ Balance Sheet shows informative message instead of empty data
- ✅ Cash Flow parser uses correct NSE field names
- ✅ Root cause documented thoroughly

### Short-term (This Week)
- [ ] Cash Flow widget shows cumulative YTD data
- [ ] Quarterly Cash Flow calculation implemented
- [ ] Data freshness indicators added

### Long-term (Next Month)
- [ ] Balance Sheet widget shows annual data
- [ ] All widgets have proper data with timestamps
- [ ] Data quality meets Screener.in standards

---

## 🤝 User Communication

### What to tell users
✅ "We've identified that NSE only provides Balance Sheet data annually. We're working on integrating annual reports."

✅ "Cash Flow data is available but cumulative (Year-to-Date). We're implementing quarter-by-quarter breakdowns."

❌ Don't say: "The data is broken" or "NSE doesn't provide this"

### Setting Expectations
- Balance Sheet: Will require annual data integration (few weeks)
- Cash Flow: Can be fixed with calculation logic (few days)
- P&L: Already working perfectly ✅

---

**Last Updated**: November 16, 2025  
**Fixed By**: AI Assistant  
**Status**: Cash Flow updated, Balance Sheet documented as limitation
**Next Action**: Implement quarterly Cash Flow calculation

