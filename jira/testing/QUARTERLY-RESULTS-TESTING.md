# Quarterly Results Widget - Testing Guide

## Quick Test Instructions

### 1. Verify Backend is Running

```bash
# Check if backend is running on port 5000
curl http://localhost:5000/api/stocks/SRM/quarterly | python3 -m json.tool | head -50
```

**Expected Output:** JSON with quarterly data for SRM stock

### 2. Verify Frontend is Running

```bash
# Check if Next.js dev server is running on port 3000
curl -s http://localhost:3000 | head -5
```

### 3. Test the Widget in Browser

1. Open browser: `http://localhost:3000/stock/SRM`
2. Click on **"Financials"** tab
3. You should see **"Quarterly Results"** widget at the top

### Expected Visual Elements:

✅ **Header:** "Quarterly Results" with "View on NSE" link  
✅ **Table:** Horizontal scrollable with quarters as columns  
✅ **Metrics (11 rows):**
   - Sales
   - Expenses
   - Operating Profit
   - OPM %
   - Other Income
   - Interest
   - Depreciation
   - Profit Before Tax
   - Tax %
   - Net Profit
   - EPS

✅ **Growth Metrics Section (gray header)**  
✅ **Growth Rows (4 rows):**
   - YoY Sales Growth % (colored)
   - YoY Net Profit Growth % (colored)
   - QoQ Sales Growth % (colored)
   - QoQ Net Profit Growth % (colored)

✅ **Colors:**
   - Green for positive growth
   - Red for negative growth

### 4. Test Different Stocks

Try these stocks to verify the widget works across different companies:

- RELIANCE: `http://localhost:3000/stock/RELIANCE`
- TCS: `http://localhost:3000/stock/TCS`
- INFY: `http://localhost:3000/stock/INFY`
- HDFCBANK: `http://localhost:3000/stock/HDFCBANK`

### 5. Test Edge Cases

**A. Stock with no quarterly data:**
```bash
curl http://localhost:5000/api/stocks/INVALID/quarterly
```
Expected: `{"success":true,"data":{"quarters":[],"message":"No quarterly results available"}}`

**B. Stock page with no data:**
- Should show: "No quarterly results available"

### 6. Troubleshooting

#### Backend Not Starting?
```bash
cd /Users/darshan.patel/code/personal/stockmarket/backend
node server.js
# Check logs for errors
```

#### Frontend Not Showing Widget?

1. **Clear browser cache and reload**
2. **Check browser console for errors** (F12 → Console tab)
3. **Verify API call:**
   ```javascript
   // In browser console
   fetch('http://localhost:5000/api/stocks/SRM/quarterly')
     .then(r => r.json())
     .then(d => console.log(d))
   ```

4. **Check if component is loaded:**
   - Open browser DevTools → Elements
   - Search for "Quarterly Results" in the DOM

5. **Restart Next.js dev server:**
   ```bash
   cd /Users/darshan.patel/code/personal/stockmarket/frontend
   # Kill existing process
   lsof -ti:3000 | xargs kill
   # Restart
   npm run dev
   ```

#### Widget Showing But No Data?

1. **Test API directly:**
   ```bash
   curl -v http://localhost:5000/api/stocks/SRM/quarterly
   ```

2. **Check NSE API access:**
   ```bash
   curl -s "https://www.nseindia.com/api/results-comparision?symbol=SRM&period=Quarterly&comparisionType=quarterly" \
     -H "User-Agent: Mozilla/5.0" \
     -H "Accept: application/json" | python3 -m json.tool | head -50
   ```

3. **Check backend logs:**
   ```bash
   tail -f /tmp/backend.log
   ```

### 7. Sample API Response

For reference, here's what the API should return:

```json
{
  "success": true,
  "data": {
    "symbol": "SRM",
    "quarters": [
      {
        "period": "Q1 2024",
        "to_date": "31-MAR-2024",
        "from_date": "01-JAN-2024",
        "sales": 10787.07,
        "expenses": 9515,
        "operating_profit": 1272.07,
        "opm_percent": 11.79,
        "other_income": 79.38,
        "interest": 287.24,
        "depreciation": 265.37,
        "pbt": 798.84,
        "tax_percent": 14.12,
        "net_profit": 686.04,
        "eps": 16.39,
        "audited": true
      },
      {
        "period": "Q2 2024",
        "to_date": "30-JUN-2024",
        "from_date": "01-APR-2024",
        "sales": 5421.71,
        "expenses": 4445.03,
        "operating_profit": 976.68,
        "opm_percent": 18.01,
        "other_income": 97.75,
        "interest": 211.92,
        "depreciation": 246.93,
        "pbt": 615.58,
        "tax_percent": 23.99,
        "net_profit": 467.9,
        "eps": 8.16,
        "audited": false,
        "qoq_sales_growth": -49.74,
        "qoq_profit_growth": -31.80
      }
    ],
    "source": "NSE India",
    "source_url": "https://www.nseindia.com/get-quotes/equity?symbol=SRM"
  }
}
```

### 8. Visual Verification Checklist

When viewing the widget in browser:

- [ ] Widget appears at top of Financials tab
- [ ] Header shows "Quarterly Results"
- [ ] "View on NSE" link is clickable and opens NSE website
- [ ] Table has sticky left column (metric names)
- [ ] Table scrolls horizontally on smaller screens
- [ ] All 11 financial metrics are displayed
- [ ] Growth metrics section has gray separator
- [ ] Positive growth values show in green
- [ ] Negative growth values show in red
- [ ] Values are formatted with ₹ symbol (e.g., ₹10.79Cr)
- [ ] Percentages show with % symbol
- [ ] EPS values show with 2 decimal places
- [ ] Missing values show as "-"
- [ ] Latest quarter appears on the right side

### 9. Performance Check

- [ ] Widget loads within 2-3 seconds
- [ ] No console errors in browser
- [ ] Backend responds within 1 second
- [ ] Table is responsive and doesn't break layout
- [ ] Horizontal scroll works smoothly

---

## Common Issues & Solutions

### Issue 1: "No quarterly results available"
**Cause:** NSE API might be down or the stock symbol is incorrect  
**Solution:** Try another stock symbol or check NSE API status

### Issue 2: Widget not appearing
**Cause:** Frontend hasn't reloaded the new component  
**Solution:** 
```bash
# Clear Next.js cache and restart
cd frontend
rm -rf .next
npm run dev
```

### Issue 3: API timeout
**Cause:** NSE API is slow or network issues  
**Solution:** Increase timeout in backend controller (currently 10 seconds)

### Issue 4: Formatting looks wrong
**Cause:** CSS not loaded or Tailwind not compiling  
**Solution:** 
```bash
cd frontend
npm run build
npm run dev
```

---

## Success Criteria

✅ Widget displays on Financials tab  
✅ Shows 4-8 quarters of data  
✅ All metrics are properly formatted  
✅ Growth calculations are correct  
✅ Colors indicate positive/negative growth  
✅ Table is responsive and scrollable  
✅ NSE link works correctly  
✅ Loading and error states work  
✅ No console errors  
✅ API responds with valid data  

---

**Last Updated:** November 14, 2025

