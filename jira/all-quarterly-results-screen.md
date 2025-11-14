## Add Quarterly Results Widget to Financials Tab (Stock Overview)

### **Requirements**

1. **Quarterly Results Widget**

   - In the `Financials` tab on the stock’s overview page, add a quarterly results widget.
   - The widget should visually and functionally resemble the quarterly results presentation on Screener.in (see example: [https://www.screener.in/company/SRM](https://www.screener.in/company/SRM): “Financials” → “Quarterly Results”).
   - Table/Widget must include the following rows (including all those shown on Screener.in plus these additional growth rows):
     - Sales
     - Expenses
     - Operating Profit
     - OPM %
     - Other Income
     - Interest
     - Depreciation
     - PBT (Profit Before Tax)
     - Tax %
     - Net Profit
     - EPS
     - YoY Sales Growth (%)
     - YoY Net Profit Growth (%)
     - QoQ Sales Growth (%)
     - QoQ Net Profit Growth (%)
   - Display the most recent 6–8 quarters, with each column representing a quarter (latest on the right).
   - Growth rows (YoY, QoQ) should be visually separated, trend colored (+green/-red), and calculated per period from actual reported numbers.

2. **API Source**

   - Fetch all quarterly financial results data from official NSE APIs only.
   - Use one or more of these endpoints depending on the stock/quarterly data needed:
     - `https://www.nseindia.com/api/corp-info?symbol={SYMBOL}&corpType=financialResult&market=equities&series=EQ`
     - `https://www.nseindia.com/json/quotes/financial-results.json`
     - `https://www.nseindia.com/api/corp-info?symbol={SYMBOL}&corpType=integratedFilingFinancialsWeb&market=equities`
     - `https://www.nseindia.com/json/quotes/integrated-financial-results.json`
   - Reference NSE's “Financial Results” tab e.g., [https://www.nseindia.com/get-quotes/equity?symbol=SRM](https://www.nseindia.com/get-quotes/equity?symbol=SRM)

3. **Backend Handling**

   - Provide an endpoint like `/api/stocks/:symbol/quarterly` that fetches and parses recent results from the appropriate NSE API.
   - Backend must:
     - Parse and normalize the quarterly data structure to match the UI’s requirements.
     - Compute YoY and QoQ growth rates as extra fields for sales and net profit for each applicable period.
     - Return data in a format suitable for direct tabular rendering on the frontend.

4. **Frontend**
   - In the `Financials` tab, render a responsive, horizontal scrollable widget/table:
     - Header: “Quarterly Results”
     - Quarters as columns, metrics as rows (see Screener.in for style)
     - YoY and QoQ rows appear below the related sales/profit rows; color values as per trend.
     - Loading, empty, and error states must be handled.
     - Link to underlying official NSE results source.
     - Layout should remain usable and readable on desktop (min 1024px).

---
