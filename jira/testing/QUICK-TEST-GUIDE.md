# Quick Test Guide - Stock Details Page

## 🚀 Quick Start

### 1. Test the Backend API

```bash
# Test SRM stock
curl 'http://localhost:5000/api/stocks/SRM'

# Test other popular stocks
curl 'http://localhost:5000/api/stocks/RELIANCE'
curl 'http://localhost:5000/api/stocks/TCS'
curl 'http://localhost:5000/api/stocks/HDFCBANK'
```

### 2. Open Stock Pages in Browser

#### SRM Stock (Your Request)
- http://localhost:3000/stock/SRM
- http://localhost:3001/stock/SRM

#### Popular Stocks
- http://localhost:3000/stock/RELIANCE
- http://localhost:3000/stock/TCS
- http://localhost:3000/stock/HDFCBANK
- http://localhost:3000/stock/INFY
- http://localhost:3000/stock/WIPRO

---

## ✅ What to Verify

### Stock Header Should Show:
- ✅ Company name (e.g., "SRM Contractors Limited")
- ✅ Symbol and exchange (e.g., "SRM · NSE")
- ✅ Current price (e.g., "₹634.00")
- ✅ Price change with color (green for up, red for down)
- ✅ Trading status indicator

### Overview Tab Should Display:
- ✅ Company information (name, symbol, sector, industry)
- ✅ Day High and Low prices
- ✅ 52-Week High and Low
- ✅ P/E Ratio (when available)

### All Tabs Should Load:
- ✅ Overview
- ✅ Fundamentals
- ✅ Financials
- ✅ Chart
- ✅ Technicals

---

## 🧪 Test Scenarios

### Scenario 1: New Stock (SRM)
**URL**: http://localhost:3000/stock/SRM
**Expected**: 
- Page loads successfully
- Shows "SRM Contractors Limited"
- Displays current price from NSE
- Shows sector as "Construction"

### Scenario 2: Popular Large Cap (Reliance)
**URL**: http://localhost:3000/stock/RELIANCE
**Expected**:
- Shows "Reliance Industries Limited"
- Displays real-time price
- Shows F&O status (should be true)

### Scenario 3: Tech Stock (Infosys)
**URL**: http://localhost:3000/stock/INFY
**Expected**:
- Shows "Infosys Limited"
- Displays sector as IT or Technology
- Shows P/E ratio

### Scenario 4: Banking Stock (HDFC Bank)
**URL**: http://localhost:3000/stock/HDFCBANK
**Expected**:
- Shows "HDFC Bank Limited"
- Displays sector as Financial Services or Banking
- High market cap value

---

## 🔍 Advanced Testing

### Test API Response Format

```bash
curl 'http://localhost:5000/api/stocks/SRM' | python3 -m json.tool
```

**Should return JSON with:**
- `success: true`
- `data.basic_info` (company details)
- `data.price_info` (current prices)
- `data.fundamentals` (P/E, market cap, etc.)
- `data.nse_data` (trading status, F&O info)

### Test Multiple Stocks Quickly

```bash
for stock in SRM RELIANCE TCS HDFCBANK INFY; do
  echo "Testing $stock..."
  curl -s "http://localhost:5000/api/stocks/$stock" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data['success']:
    info = data['data']['basic_info']
    price = data['data']['price_info']
    print(f'✅ {info[\"symbol\"]}: {info[\"name\"]} - ₹{price[\"last_price\"]} ({price[\"change_percent\"]:.2f}%)')
"
  echo ""
done
```

---

## 🐛 Troubleshooting

### Page Shows "Loading..." Forever
**Solution**: Check backend is running on port 5000
```bash
curl http://localhost:5000/api/health
```

### "Stock not found" Error
**Possible causes:**
1. NSE API is down (check fallback is working)
2. Invalid stock symbol
3. Stock not listed on NSE

**Check API directly:**
```bash
curl 'http://localhost:5000/api/stocks/YOURSYMBOL'
```

### Price Shows as "N/A"
**Possible causes:**
1. Market closed (NSE only provides data during trading hours for some fields)
2. Stock suspended
3. Network issue with NSE API

**Verify NSE data:**
```bash
curl -s 'http://localhost:5000/api/stocks/YOURSYMBOL' | grep -i "last_price"
```

---

## 📊 Data Source Verification

### Check if Data is from NSE or Fallback

```bash
curl -s 'http://localhost:5000/api/stocks/SRM' | python3 -c "
import sys, json
data = json.load(sys.stdin)
if 'fallback' in data['data']:
    print('⚠️  Using FALLBACK data from local database')
else:
    print('✅ Using LIVE data from NSE India API')
"
```

---

## 🎯 Success Criteria

### ✅ All Green Means Success:
- [ ] Backend API responds on port 5000
- [ ] Frontend loads on port 3000 and 3001
- [ ] SRM stock page displays without errors
- [ ] Current price shows correctly
- [ ] Day High/Low visible
- [ ] 52-Week range displays
- [ ] All tabs are clickable
- [ ] Other stocks (RELIANCE, TCS) also work

---

## 🔗 Quick Links

### Backend API Endpoints
- Health Check: http://localhost:5000/api/health
- Stock Details: http://localhost:5000/api/stocks/:symbol
- Search: http://localhost:5000/api/stocks/search?q=hdfc

### Frontend Pages
- Dashboard: http://localhost:3000/
- Screener: http://localhost:3000/screener
- Stock Details: http://localhost:3000/stock/:symbol

### NSE Reference
- Sample NSE Page: https://www.nseindia.com/get-quotes/equity?symbol=SRM
- NSE API (used): `https://www.nseindia.com/api/quote-equity?symbol=SRM`

---

## 📝 Notes

1. **NSE API Headers**: Required headers are automatically set in the backend
2. **Fallback Mechanism**: If NSE fails, local database is used
3. **Real-time Data**: Prices update every time you refresh the page
4. **Coverage**: Works for ALL NSE-listed stocks (500+)

---

## 🎉 Expected Results

### For SRM Stock:
```
Company: SRM Contractors Limited
Symbol: SRM
Sector: Construction
Industry: Civil Construction
Current Price: ₹634.00
Change: +54.25 (+9.36%)
Day High: ₹639.5
Day Low: ₹582.4
52W High: ₹639.5
52W Low: ₹260.65
P/E Ratio: 18.24
```

---

**Last Updated**: November 14, 2025
**Status**: ✅ All Systems Working
**Data Source**: NSE India API with MongoDB fallback

