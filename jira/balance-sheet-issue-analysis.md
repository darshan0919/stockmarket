# Balance Sheet Data Issue - Root Cause Analysis

**Date**: November 16, 2025  
**Status**: 🔍 DIAGNOSED - CRITICAL ISSUE FOUND

---

## 🚨 Root Cause Identified

### The Problem
Balance Sheet data showing as `null` or `0` in our widgets despite successful XBRL parsing.

### The Root Cause
**NSE's quarterly XBRL documents DO NOT contain Balance Sheet data at all!**

---

## Investigation Process

### Step 1: Downloaded Actual XBRL Document
```bash
curl -s "https://nsearchives.nseindia.com/corporate/xbrl/INTEGRATED_FILING_INDAS_1574631_13112025115340_WEB.xml" > sample_xbrl.xml
```

### Step 2: Analyzed XBRL Content
Searched for Balance Sheet related fields:
- ✅ Found P&L fields: Revenue, Expenses, Tax, Net Profit, EPS
- ✅ Found Cash Flow fields: Operating, Investing, Financing activities
- ❌ **NO Balance Sheet fields found**: No Equity, Assets, Liabilities, etc.

### Step 3: Verified Context IDs
- `OneD` = Q2 FY26 (Jul-Sep 2025) - **Duration context for P&L**
- `FourD` = H1 FY26 (Apr-Sep 2025) - **Duration context for P&L**  
- `OneI` = As of Sep 30, 2025 - **Instant context (should have BS, but doesn't)**
- `PY_I` = As of Mar 31, 2025 - **Previous year instant (should have BS, but doesn't)**

Balance Sheet data uses "instant" contexts (point-in-time snapshots), but the XBRL files only contain P&L (duration) and Cash Flow data.

---

## What NSE XBRL Files Actually Contain

### ✅ Profit & Loss Statement (Working)
```xml
<in-capmkt:RevenueFromOperations contextRef="OneD" decimals="-3" unitRef="INR">2841329000</in-capmkt:RevenueFromOperations>
<in-capmkt:ProfitLossForPeriodFromContinuingOperations contextRef="OneD" decimals="-3" unitRef="INR">233479000</in-capmkt:ProfitLossForPeriodFromContinuingOperations>
<in-capmkt:DilutedEarningsLossPerShareFromContinuingOperations contextRef="OneD" decimals="-2" unitRef="INRPerShare">3.64</in-capmkt:DilutedEarningsLossPerShareFromContinuingOperations>
```

### ✅ Cash Flow Statement (Working)
```xml
<in-capmkt:CashFlowsFromUsedInOperatingActivities contextRef="FourD" decimals="-3" unitRef="INR">545714000</in-capmkt:CashFlowsFromUsedInOperatingActivities>
<in-capmkt:CashFlowsFromUsedInInvestingActivities contextRef="FourD" decimals="-3" unitRef="INR">-628428000</in-capmkt:CashFlowsFromUsedInInvestingActivities>
<in-capmkt:CashFlowsFromUsedInFinancingActivities contextRef="FourD" decimals="-3" unitRef="INR">183251000</in-capmkt:CashFlowsFromUsedInFinancingActivities>
```

### ❌ Balance Sheet (MISSING)
**Expected but NOT found**:
- EquityShareCapital
- ReservesAndSurplus
- BorrowingsCurrent / BorrowingsNoncurrent
- PropertyPlantAndEquipment
- TradeReceivables
- TotalAssets / TotalLiabilities

---

## Why This Happens

### NSE's Quarterly Filing Structure
Indian companies are required to file:
1. **Quarterly**: P&L Statement + Cash Flow Statement (what we're parsing)
2. **Annually**: Complete financials including Balance Sheet

The "integrated-filing-results" API provides quarterly XBRL files which contain:
- Quarterly P&L
- Quarterly Cash Flow  
- **NO Balance Sheet** (only filed annually or semi-annually)

---

## Potential Solutions

### Option 1: Use Annual Reports for Balance Sheet Data ✅ BEST
**Pros**:
- Most accurate source
- Officially filed with NSE/SEBI
- Contains audited data

**Cons**:
- Only available annually (not quarterly)
- Different API endpoint needed

**Implementation**:
- Use NSE's annual report API
- Parse annual XBRL or PDF reports
- Show "Last reported BS date" in widget

---

### Option 2: Use NSE's Corporate Announcements API
**Endpoint**: `https://www.nseindia.com/api/corporate-announcements`

**Pros**:
- May contain balance sheet in some announcements
- Real-time data

**Cons**:
- Inconsistent format
- Not guaranteed to have BS data

---

### Option 3: Scrape from Annual Reports Section
**Endpoint**: `https://www.nseindia.com/companies-listing/corporate-filings-financial-results`

**Pros**:
- Official source
- Complete data

**Cons**:
- Complex parsing (PDF/HTML)
- Less structured than XBRL

---

### Option 4: Use Third-Party APIs (Like Screener.in does)
**Examples**:
- Money Control API
- BSE India API
- Financial aggregator services

**Pros**:
- Pre-processed data
- Quarterly granularity might be available

**Cons**:
- May require paid subscription
- Not direct from source

---

### Option 5: Hybrid Approach ⭐ RECOMMENDED
1. **P&L & Cash Flow**: Use current XBRL quarterly data (working)
2. **Balance Sheet**: 
   - Show annual BS data from annual reports
   - Display "As of [Annual Report Date]" disclaimer
   - Update once per year

**Benefits**:
- Best of both worlds
- Free and official data
- Matches how most financial sites handle it

---

## How Screener.in Handles This

Visit: https://www.screener.in/company/SRM/

**Observation**:
- **Quarterly Results**: Shows P&L quarterly ✅
- **Balance Sheet**: Shows **annual** figures, not quarterly ⚠️
- **Cash Flows**: Shows **annual** figures, not quarterly ⚠️

**Screener's Approach**:
```
Quarterly:
- Revenue, Expenses, Profit, EPS (from quarterly filings)

Yearly:
- Balance Sheet (from annual reports)
- Detailed Cash Flows (from annual reports)
```

This confirms that **even Screener doesn't have quarterly balance sheet data!**

---

## Recommended Implementation

### Update Our Widgets

#### 1. P&L Widget (Financial Results) ✅ NO CHANGES
```
Quarterly Mode: Use quarterly XBRL (current implementation)
Yearly Mode: Aggregate quarterly data (current implementation)
```

#### 2. Cash Flow Widget ✅ MINOR FIX NEEDED
```
Quarterly Mode: Extract from quarterly XBRL (currently working)
Yearly Mode: Aggregate quarterly CF data
```

**Action**: Update XBRL parser to correctly extract Cash Flow fields (they exist in XBRL).

#### 3. Balance Sheet Widget ⚠️ MAJOR CHANGE NEEDED
```
Option A: Show Annual Balance Sheet only
- Fetch from annual reports
- Display "As of [Date]" for each column
- Show last 5 years

Option B: Disable until we implement annual report parsing
- Show "Coming Soon" message
- Link to NSE's financial results page
```

---

## Next Steps

### Immediate (Today)
1. ✅ Fix Cash Flow parsing (data exists in XBRL)
2. ⚠️ Update Balance Sheet widget to show disclaimer or disable it
3. 📝 Document the limitation

### Short-term (This Week)
1. Research NSE annual report APIs
2. Implement annual Balance Sheet data fetching
3. Update Balance Sheet widget with annual data

### Long-term (Future)
1. Add PDF parsing for annual reports
2. Implement comprehensive data aggregation
3. Add data quality indicators

---

## Code Changes Required

### 1. Update `xbrlParser.js` - Fix Cash Flow Fields
```javascript
// Cash Flow fields ARE in XBRL, just need correct mapping
const XBRL_FIELD_MAP = {
  // ... existing P&L fields ...
  
  // Cash Flows (PRESENT in XBRL)
  cash_from_operating: [
    'in-capmkt:CashFlowsFromUsedInOperatingActivities',
    'CashFlowsFromUsedInOperatingActivities',
  ],
  cash_from_investing: [
    'in-capmkt:CashFlowsFromUsedInInvestingActivities',
    'CashFlowsFromUsedInInvestingActivities',
  ],
  cash_from_financing: [
    'in-capmkt:CashFlowsFromUsedInFinancingActivities',
    'CashFlowsFromUsedInFinancingActivities',
  ],
  // ...
};
```

### 2. Update `BalanceSheet.js` - Show Disclaimer
```javascript
if (!hasBalanceSheetData) {
  return (
    <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
      <h3>Balance Sheet Data Not Available</h3>
      <p>NSE only provides Balance Sheet data annually. We're working on integrating annual reports.</p>
      <a href={`https://www.nseindia.com/companies-listing/corporate-filings-annual-reports`}>
        View Annual Reports on NSE
      </a>
    </div>
  );
}
```

### 3. Update `QuarterlyResult` model - Add data availability flags
```javascript
data_availability: {
  has_pl: { type: Boolean, default: false },
  has_balance_sheet: { type: Boolean, default: false },
  has_cash_flow: { type: Boolean, default: false },
},
```

---

## Testing Plan

### 1. Verify Cash Flow Extraction
```bash
# Test with SRM (known good data)
curl "http://localhost:5000/api/stocks/SRM/quarterly?force_refresh=true"

# Check cash_from_operating, cash_from_investing, cash_from_financing fields
```

### 2. Verify Balance Sheet Absence
```bash
# Confirm all balance sheet fields are null/0
# This is EXPECTED behavior now that we understand the issue
```

### 3. Test Frontend Widgets
- ✅ P&L Widget: Should work perfectly
- ✅ Cash Flow Widget: Should work after parser fix
- ⚠️ Balance Sheet Widget: Should show appropriate message

---

## Documentation Updates

### User-Facing
- Add note in UI: "Balance Sheet data shown annually"
- Add tooltip explaining data availability
- Link to NSE for detailed reports

### Developer-Facing
- Update README with data source limitations
- Document XBRL structure
- Add troubleshooting guide

---

## Conclusion

🎯 **Key Finding**: NSE's quarterly XBRL files do NOT contain Balance Sheet data. This is by design, not a bug in our parser.

✅ **What Works**: P&L and Cash Flow data extraction  
⚠️ **What Doesn't**: Balance Sheet (needs annual report integration)

🚀 **Path Forward**: 
1. Fix Cash Flow parser (quick win)
2. Implement annual Balance Sheet data (requires new API integration)
3. Update UI to reflect data availability

---

**Status**: Analysis Complete  
**Next Action**: Fix Cash Flow parser and update Balance Sheet widget  
**Priority**: HIGH (user-facing issue)

---

**Last Updated**: November 16, 2025  
**Investigated By**: AI Assistant  
**Verified With**: Actual NSE XBRL document inspection

