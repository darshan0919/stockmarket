# XBRL-Based Quarterly Results Implementation Guide

## Overview

This document outlines the implementation for fetching quarterly results from NSE's corporates-financial-results API, parsing XBRL documents, and caching the data in our database.

## Architecture

```
NSE API → XBRL Document → Parser → Database Cache → API Response
```

### Flow:

1. Check database cache first
2. If not cached or stale, fetch from NSE API
3. Parse XBRL documents for each quarter
4. Store parsed data in database
5. Return formatted response

---

## Phase 1: Database Model

### New Model: `QuarterlyResult`

**File:** `backend/models/QuarterlyResult.js`

```javascript
const mongoose = require("mongoose");

const quarterlyResultSchema = new mongoose.Schema(
  {
    symbol: {
      type: String,
      required: true,
      uppercase: true,
      index: true,
    },
    company_name: String,

    // Period information
    from_date: { type: Date, required: true },
    to_date: { type: Date, required: true, index: true },
    period: String, // "Q1 2024"
    quarter: Number, // 1-4
    fiscal_year: Number, // 2024

    // Filing information
    filing_date: Date,
    audited: { type: Boolean, default: false },
    consolidated: { type: Boolean, default: false },

    // Financial metrics (in crores INR)
    revenue: Number,
    other_income: Number,
    total_income: Number,

    // Expenses
    cost_of_materials: Number,
    employee_expenses: Number,
    finance_costs: Number, // Interest
    depreciation: Number,
    other_expenses: Number,
    total_expenses: Number,

    // Profitability
    operating_profit: Number,
    profit_before_tax: Number,
    tax_expense: Number,
    net_profit: Number,

    // Ratios
    opm_percent: Number, // Operating Profit Margin %
    tax_percent: Number,

    // Per share
    eps_basic: Number,
    eps_diluted: Number,
    face_value: Number,
    paid_up_capital: Number,

    // Growth (calculated)
    yoy_revenue_growth: Number,
    yoy_profit_growth: Number,
    qoq_revenue_growth: Number,
    qoq_profit_growth: Number,

    // Source tracking
    xbrl_url: String,
    seq_number: String,

    // Cache management
    fetched_at: { type: Date, default: Date.now },
    last_updated: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
quarterlyResultSchema.index({ symbol: 1, to_date: -1 });
quarterlyResultSchema.index({ symbol: 1, fiscal_year: -1, quarter: -1 });

module.exports = mongoose.model("QuarterlyResult", quarterlyResultSchema);
```

---

## Phase 2: XBRL Parser Utility

### File: `backend/utils/xbrlParser.js`

```javascript
const axios = require("axios");
const xml2js = require("xml2js");

/**
 * XBRL field mappings to our schema
 */
const XBRL_FIELD_MAP = {
  // Revenue
  "in-bse-fin:RevenueFromOperations": "revenue",
  "in-bse-fin:OtherIncome": "other_income",
  "in-bse-fin:Income": "total_income",

  // Expenses
  "in-bse-fin:CostOfMaterialsConsumed": "cost_of_materials",
  "in-bse-fin:EmployeeBenefitExpense": "employee_expenses",
  "in-bse-fin:FinanceCosts": "finance_costs",
  "in-bse-fin:DepreciationDepletionAndAmortisationExpense": "depreciation",
  "in-bse-fin:OtherExpenses": "other_expenses",
  "in-bse-fin:Expenses": "total_expenses",

  // Profitability
  "in-bse-fin:ProfitBeforeExceptionalItemsAndTax": "operating_profit",
  "in-bse-fin:ProfitBeforeTax": "profit_before_tax",
  "in-bse-fin:TaxExpense": "tax_expense",
  "in-bse-fin:ProfitLossForPeriod": "net_profit",

  // Per share
  "in-bse-fin:BasicEarningsLossPerShareFromContinuingOperations": "eps_basic",
  "in-bse-fin:DilutedEarningsLossPerShareFromContinuingOperations":
    "eps_diluted",
  "in-bse-fin:FaceValueOfEquityShareCapital": "face_value",
  "in-bse-fin:PaidUpValueOfEquityShareCapital": "paid_up_capital",

  // Metadata
  "in-bse-fin:NameOfTheCompany": "company_name",
  "in-bse-fin:DateOfStartOfReportingPeriod": "from_date",
  "in-bse-fin:DateOfEndOfReportingPeriod": "to_date",
  "in-bse-fin:WhetherResultsAreAuditedOrUnaudited": "audited_status",
  "in-bse-fin:NatureOfReportStandaloneConsolidated": "report_type",
};

/**
 * Parse XBRL XML document
 * @param {string} xbrlUrl - URL to XBRL XML file
 * @returns {Promise<Object>} Parsed financial data
 */
async function parseXBRL(xbrlUrl) {
  try {
    console.log(`Fetching XBRL from: ${xbrlUrl}`);

    const response = await axios.get(xbrlUrl, {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });

    // Parse XML to JSON
    const parser = new xml2js.Parser({
      explicitArray: false,
      tagNameProcessors: [xml2js.processors.stripPrefix],
    });

    const result = await parser.parseStringPromise(response.data);
    const xbrl = result.xbrl;

    // Extract data based on context (OneD for quarterly)
    const data = {};

    // Find fields and extract values
    for (const [xbrlField, ourField] of Object.entries(XBRL_FIELD_MAP)) {
      const cleanField = xbrlField.replace("in-bse-fin:", "");

      if (xbrl[cleanField]) {
        const entries = Array.isArray(xbrl[cleanField])
          ? xbrl[cleanField]
          : [xbrl[cleanField]];

        // Find the quarterly data (context OneD)
        const quarterlyEntry = entries.find(
          (e) =>
            e.$ && (e.$.contextRef === "OneD" || e.$.contextRef === "FourD")
        );

        if (quarterlyEntry) {
          let value = quarterlyEntry._;

          // Convert to number if applicable
          if (typeof value === "string" && !isNaN(value)) {
            value = parseFloat(value);

            // Convert from INR to Crores (divide by 10^7)
            if (quarterlyEntry.$.unitRef === "INR") {
              value = value / 10000000;
            }
          }

          // Handle special cases
          if (ourField === "audited_status") {
            data.audited = value === "Audited";
          } else if (ourField === "report_type") {
            data.consolidated = value === "Consolidated";
          } else {
            data[ourField] = value;
          }
        }
      }
    }

    // Calculate derived fields
    if (data.revenue && data.operating_profit) {
      data.opm_percent = (data.operating_profit / data.revenue) * 100;
    }

    if (data.profit_before_tax && data.tax_expense) {
      data.tax_percent = (data.tax_expense / data.profit_before_tax) * 100;
    }

    return data;
  } catch (error) {
    console.error("XBRL parsing error:", error.message);
    throw new Error(`Failed to parse XBRL: ${error.message}`);
  }
}

/**
 * Extract context periods from XBRL
 */
function extractPeriods(xbrl) {
  const periods = {};

  if (xbrl.context) {
    const contexts = Array.isArray(xbrl.context)
      ? xbrl.context
      : [xbrl.context];

    contexts.forEach((ctx) => {
      if (ctx.$ && ctx.$.id && ctx.period) {
        periods[ctx.$.id] = {
          start: ctx.period.startDate,
          end: ctx.period.endDate || ctx.period.instant,
        };
      }
    });
  }

  return periods;
}

module.exports = {
  parseXBRL,
  extractPeriods,
  XBRL_FIELD_MAP,
};
```

### Install Dependencies:

```bash
cd backend
npm install xml2js
```

---

## Phase 3: Updated Controller

### File: `backend/controllers/stockController.js`

Add this new improved function:

```javascript
const QuarterlyResult = require("../models/QuarterlyResult");
const { parseXBRL } = require("../utils/xbrlParser");

/**
 * Get quarterly financial results with XBRL parsing and caching
 * GET /api/stocks/:symbol/quarterly
 */
const getQuarterlyResultsV2 = async (req, res, next) => {
  const { symbol } = req.params;
  const upperSymbol = symbol.toUpperCase();
  const { force_refresh } = req.query; // ?force_refresh=true to bypass cache

  try {
    // Step 1: Check cache first (data from last 7 days)
    const cacheExpiry = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    if (!force_refresh) {
      const cachedResults = await QuarterlyResult.find({
        symbol: upperSymbol,
        last_updated: { $gte: cacheExpiry },
      })
        .sort({ to_date: 1 }) // Oldest to newest
        .limit(8)
        .lean();

      if (cachedResults.length > 0) {
        console.log(
          `Cache hit for ${upperSymbol}: ${cachedResults.length} quarters`
        );

        // Calculate growth metrics
        const resultsWithGrowth = calculateGrowthMetrics(cachedResults);

        return res.json({
          success: true,
          data: {
            symbol: upperSymbol,
            quarters: resultsWithGrowth,
            source: "Database Cache (NSE India)",
            cached: true,
          },
        });
      }
    }

    // Step 2: Fetch from NSE API
    console.log(`Cache miss for ${upperSymbol}, fetching from NSE...`);

    // First get company name from quote API
    let companyName = "";
    try {
      const quoteResponse = await axios.get(
        `https://www.nseindia.com/api/quote-equity?symbol=${upperSymbol}`,
        {
          timeout: 10000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            Accept: "application/json",
          },
        }
      );
      companyName = quoteResponse.data.info?.companyName || "";
    } catch (err) {
      console.warn(`Could not fetch company name: ${err.message}`);
    }

    // Fetch quarterly results metadata
    const issuer = encodeURIComponent(companyName || upperSymbol);
    const nseResponse = await axios.get(
      `https://www.nseindia.com/api/corporates-financial-results?index=equities&symbol=${upperSymbol}&issuer=${issuer}&period=Quarterly`,
      {
        timeout: 15000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json",
        },
      }
    );

    const results = nseResponse.data || [];

    if (!results || results.length === 0) {
      return res.json({
        success: true,
        data: {
          quarters: [],
          message: "No quarterly results available",
        },
      });
    }

    // Step 3: Parse XBRL documents and store in database
    const parsedQuarters = [];
    const promises = [];

    // Take latest 8 quarters
    const latestResults = results
      .filter((r) => r.xbrl && r.consolidated === "Consolidated") // Prefer consolidated
      .slice(0, 8);

    for (const result of latestResults) {
      promises.push(
        (async () => {
          try {
            // Check if already in database
            const existing = await QuarterlyResult.findOne({
              symbol: upperSymbol,
              seq_number: result.seqNumber,
            });

            if (existing && !force_refresh) {
              return existing;
            }

            // Parse XBRL
            const parsedData = await parseXBRL(result.xbrl);

            // Create period string
            const toDate = new Date(result.toDate);
            const quarter = Math.ceil((toDate.getMonth() + 1) / 3);
            const year = toDate.getFullYear();
            const period = `Q${quarter} ${year}`;

            // Prepare document
            const quarterDoc = {
              symbol: upperSymbol,
              company_name: result.companyName || companyName,
              from_date: new Date(result.fromDate),
              to_date: toDate,
              period,
              quarter,
              fiscal_year: year,
              filing_date: new Date(result.filingDate),
              audited: result.audited === "Audited",
              consolidated: result.consolidated === "Consolidated",
              seq_number: result.seqNumber,
              xbrl_url: result.xbrl,
              last_updated: new Date(),
              ...parsedData,
            };

            // Upsert to database
            const saved = await QuarterlyResult.findOneAndUpdate(
              { symbol: upperSymbol, seq_number: result.seqNumber },
              quarterDoc,
              { upsert: true, new: true }
            );

            return saved;
          } catch (error) {
            console.error(
              `Failed to parse quarter ${result.toDate}:`,
              error.message
            );
            return null;
          }
        })()
      );
    }

    // Wait for all parsing to complete
    const results = await Promise.all(promises);
    const validResults = results.filter((r) => r !== null);

    // Step 4: Calculate growth metrics
    const quarters = calculateGrowthMetrics(validResults);

    res.json({
      success: true,
      data: {
        symbol: upperSymbol,
        quarters,
        source: "NSE India (XBRL)",
        cached: false,
        source_url: `https://www.nseindia.com/get-quotes/equity?symbol=${upperSymbol}`,
      },
    });
  } catch (error) {
    console.error("Error fetching quarterly results:", error.message);

    // Fallback to database if API fails
    try {
      const fallbackResults = await QuarterlyResult.find({
        symbol: upperSymbol,
      })
        .sort({ to_date: 1 })
        .limit(8)
        .lean();

      if (fallbackResults.length > 0) {
        const quarters = calculateGrowthMetrics(fallbackResults);

        return res.json({
          success: true,
          data: {
            symbol: upperSymbol,
            quarters,
            source: "Database Cache (Fallback)",
            cached: true,
            warning: "Using cached data due to API error",
          },
        });
      }
    } catch (dbErr) {
      console.error("Database fallback error:", dbErr);
    }

    res.json({
      success: true,
      data: {
        symbol: upperSymbol,
        quarters: [],
        error: "Unable to fetch quarterly results",
      },
    });
  }
};

/**
 * Calculate YoY and QoQ growth metrics
 */
function calculateGrowthMetrics(quarters) {
  // Sort by date
  const sorted = quarters.sort(
    (a, b) => new Date(b.to_date) - new Date(a.to_date)
  );

  sorted.forEach((quarter, index) => {
    // YoY Growth (compare with quarter 4 positions back)
    if (index + 4 < sorted.length) {
      const prevYearQuarter = sorted[index + 4];

      if (
        quarter.revenue &&
        prevYearQuarter.revenue &&
        prevYearQuarter.revenue !== 0
      ) {
        quarter.yoy_revenue_growth =
          ((quarter.revenue - prevYearQuarter.revenue) /
            Math.abs(prevYearQuarter.revenue)) *
          100;
      }

      if (
        quarter.net_profit &&
        prevYearQuarter.net_profit &&
        prevYearQuarter.net_profit !== 0
      ) {
        quarter.yoy_profit_growth =
          ((quarter.net_profit - prevYearQuarter.net_profit) /
            Math.abs(prevYearQuarter.net_profit)) *
          100;
      }
    }

    // QoQ Growth
    if (index + 1 < sorted.length) {
      const prevQuarter = sorted[index + 1];

      if (quarter.revenue && prevQuarter.revenue && prevQuarter.revenue !== 0) {
        quarter.qoq_revenue_growth =
          ((quarter.revenue - prevQuarter.revenue) /
            Math.abs(prevQuarter.revenue)) *
          100;
      }

      if (
        quarter.net_profit &&
        prevQuarter.net_profit &&
        prevQuarter.net_profit !== 0
      ) {
        quarter.qoq_profit_growth =
          ((quarter.net_profit - prevQuarter.net_profit) /
            Math.abs(prevQuarter.net_profit)) *
          100;
      }
    }
  });

  // Reverse to oldest to newest
  return sorted.reverse();
}
```

---

## Phase 4: Background Job (Optional but Recommended)

### File: `backend/scripts/syncQuarterlyResults.js`

```javascript
const mongoose = require("mongoose");
const { getQuarterlyResultsV2 } = require("../controllers/stockController");

/**
 * Background job to sync quarterly results for all tracked stocks
 */
async function syncQuarterlyResults() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    // Get list of stocks to sync
    const Stock = require("../models/Stock");
    const stocks = await Stock.find().select("symbol").lean();

    console.log(`Syncing quarterly results for ${stocks.length} stocks...`);

    let synced = 0;
    let failed = 0;

    for (const stock of stocks) {
      try {
        // Simulate request/response
        const req = {
          params: { symbol: stock.symbol },
          query: { force_refresh: "true" },
        };
        const res = {
          json: (data) => {
            if (data.success && data.data.quarters.length > 0) {
              synced++;
              console.log(
                `✓ ${stock.symbol}: ${data.data.quarters.length} quarters`
              );
            }
          },
        };

        await getQuarterlyResultsV2(req, res, () => {});

        // Rate limiting - don't overwhelm NSE
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        failed++;
        console.error(`✗ ${stock.symbol}: ${error.message}`);
      }
    }

    console.log(`\nSync complete: ${synced} success, ${failed} failed`);
    process.exit(0);
  } catch (error) {
    console.error("Sync job error:", error);
    process.exit(1);
  }
}

syncQuarterlyResults();
```

Run with:

```bash
cd backend
node scripts/syncQuarterlyResults.js
```

---

## Phase 5: Frontend Updates

The frontend component (`QuarterlyResults.js`) already supports the response format. No changes needed if field names match.

### Mapping:

- `revenue` → `sales`
- `total_expenses` → `expenses`
- `operating_profit` → `operating_profit`
- `net_profit` → `net_profit`
- `eps_basic` → `eps`

---

## Implementation Steps

### Step 1: Install Dependencies

```bash
cd backend
npm install xml2js
```

### Step 2: Create Database Model

Create `backend/models/QuarterlyResult.js` with the schema above.

### Step 3: Create XBRL Parser

Create `backend/utils/xbrlParser.js` with parsing logic.

### Step 4: Update Controller

Add `getQuarterlyResultsV2()` to `stockController.js`.

### Step 5: Update Routes

```javascript
router.get("/:symbol/quarterly-v2", getQuarterlyResultsV2);
```

### Step 6: Test

```bash
# Test caching
curl http://localhost:5000/api/stocks/ZOMATO/quarterly-v2

# Force refresh
curl "http://localhost:5000/api/stocks/ZOMATO/quarterly-v2?force_refresh=true"
```

### Step 7: Background Sync (Optional)

Set up cron job to run `syncQuarterlyResults.js` daily.

---

## Testing Strategy

1. **Unit Tests:** Parser logic
2. **Integration Tests:** Full flow with mocked XBRL
3. **E2E Tests:** Real API calls (sparingly)
4. **Performance Tests:** Caching effectiveness

---

## Monitoring & Maintenance

1. **Cache Hit Rate:** Track percentage of requests served from cache
2. **Parse Success Rate:** Monitor XBRL parsing failures
3. **Data Freshness:** Alert if cache becomes stale
4. **API Rate Limits:** Monitor NSE API usage

---

## Benefits of This Approach

✅ **Accurate Data:** Direct from official XBRL filings  
✅ **Fast Response:** Database caching reduces API calls  
✅ **Reliable:** Fallback to cache if API fails  
✅ **Scalable:** Background jobs keep data fresh  
✅ **Complete:** All financial metrics available  
✅ **Auditable:** Track data source and update times

---

## Limitations & Considerations

⚠️ **XBRL Complexity:** Different companies may use different tags  
⚠️ **API Rate Limits:** NSE may throttle excessive requests  
⚠️ **Parsing Errors:** Some XBRL files may be malformed  
⚠️ **Storage:** Database will grow over time  
⚠️ **Initial Load:** First fetch for each stock will be slow

---

## Next Phase: Advanced Features

1. **Historical Trends:** Store all historical quarters
2. **Peer Comparison:** Compare with industry averages
3. **Alerts:** Notify on significant changes
4. **Export:** Download as Excel/PDF
5. **Annotations:** Add notes to specific quarters
6. **Forecasting:** ML-based quarter predictions

---

**Status:** Design Complete - Implementation Required  
**Estimated Effort:** 2-3 days full development  
**Priority:** High - Core feature enhancement
