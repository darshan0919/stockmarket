const Stock = require("../models/Stock");
const Fundamental = require("../models/Fundamental");
const PriceHistory = require("../models/PriceHistory");
const FinancialStatement = require("../models/FinancialStatement");
const QuarterlyResult = require("../models/QuarterlyResult");
const {
  calculateAllIndicators,
  calculateSMA,
} = require("../utils/technicalIndicators");
const { parseXBRL } = require("../utils/xbrlParser");
const { OrderBookExtractor, OrderEventType, OrderEvent } = require("../models/Orderbook");
const axios = require("axios");

/**
 * Search stocks by symbol or name using NSE India API
 * GET /api/stocks/search?q={query}&page={page}&limit={limit}
 */
const searchStocks = async (req, res, next) => {
  const { q, page = 1, limit = 10 } = req.query;

  if (!q || q.length < 1) {
    return res.status(400).json({
      success: false,
      error: "Search query is required",
    });
  }

  try {
    // Call NSE India autocomplete API
    const apiResponse = await axios.get(
      `https://www.nseindia.com/api/search/autocomplete?q=${encodeURIComponent(
        q
      )}`,
      {
        timeout: 10000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
        },
      }
    );

    // Extract and format the response from NSE India API
    const symbols = apiResponse.data.symbols || [];

    // Filter only equity stocks (not mutual funds, etc.)
    const equitySymbols = symbols.filter(
      (item) =>
        item.result_sub_type === "equity" &&
        item.activeSeries &&
        item.activeSeries.includes("EQ")
    );

    // Apply pagination
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedResults = equitySymbols.slice(startIndex, endIndex);

    // Format results to match our expected structure
    const formattedResults = paginatedResults.map((stock) => ({
      name: stock.symbol_info,
      symbol: stock.symbol,
      exchange: "NSE",
      sector: null,
      industry: null,
      current_price: null,
      change_percent: null,
      listing_date: stock.listing_date,
    }));

    res.json({
      success: true,
      results: formattedResults,
      total: equitySymbols.length,
      page: pageNum,
      limit: limitNum,
    });
  } catch (error) {
    console.error("NSE India API Error:", error.message);

    // Fallback to local database if NSE India API fails
    try {
      console.log("Using local database fallback for search:", q);

      const pageNum = Number(page);
      const limitNum = Number(limit);
      const skip = (pageNum - 1) * limitNum;

      const stocks = await Stock.find({
        $or: [
          { symbol: { $regex: q, $options: "i" } },
          { name: { $regex: q, $options: "i" } },
        ],
      })
        .skip(skip)
        .limit(limitNum)
        .select("id symbol name sector industry market_cap")
        .lean();

      const totalCount = await Stock.countDocuments({
        $or: [
          { symbol: { $regex: q, $options: "i" } },
          { name: { $regex: q, $options: "i" } },
        ],
      });

      return res.json({
        success: true,
        results: stocks.map((stock) => ({
          name: stock.name,
          symbol: stock.symbol,
          exchange: "NSE",
          sector: stock.sector,
          industry: stock.industry,
          current_price: null,
          change_percent: null,
        })),
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        fallback: true,
      });
    } catch (dbError) {
      console.error("Database fallback error:", dbError);
      next(error);
    }
  }
};

/**
 * Get stock details by symbol using NSE API
 * GET /api/stocks/:symbol
 */
const getStockDetails = async (req, res, next) => {
  const { symbol } = req.params;
  const upperSymbol = symbol.toUpperCase();

  try {
    // Fetch data from NSE India Quote API
    const nseResponse = await axios.get(
      `https://www.nseindia.com/api/quote-equity?symbol=${upperSymbol}`,
      {
        timeout: 10000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
        },
      }
    );

    const nseData = nseResponse.data;

    // Extract basic info
    const basicInfo = {
      symbol: upperSymbol,
      name: nseData.info?.companyName || upperSymbol,
      sector:
        nseData.industryInfo?.sector ||
        nseData.industryInfo?.macro ||
        "Unknown",
      industry:
        nseData.industryInfo?.basicIndustry ||
        nseData.metadata?.industry ||
        "Unknown",
      market_cap: nseData.securityInfo?.issuedSize
        ? nseData.securityInfo.issuedSize * (nseData.priceInfo?.lastPrice || 0)
        : null,
      listing_date: nseData.info?.listingDate || nseData.metadata?.listingDate,
      isin: nseData.info?.isin,
      face_value: nseData.securityInfo?.faceValue,
    };

    // Extract price info
    const priceInfo = nseData.priceInfo || {};
    const currentPrice = {
      last_price: priceInfo.lastPrice,
      change: priceInfo.change,
      change_percent: priceInfo.pChange,
      previous_close: priceInfo.previousClose,
      open: priceInfo.open,
      close: priceInfo.close,
      vwap: priceInfo.vwap,
      day_high: priceInfo.intraDayHighLow?.max,
      day_low: priceInfo.intraDayHighLow?.min,
      week_high: priceInfo.weekHighLow?.max,
      week_low: priceInfo.weekHighLow?.min,
      week_high_date: priceInfo.weekHighLow?.maxDate,
      week_low_date: priceInfo.weekHighLow?.minDate,
    };

    // Extract fundamentals
    const fundamentals = {
      pe_ratio: nseData.metadata?.pdSymbolPe || null,
      sector_pe: nseData.metadata?.pdSectorPe || null,
      market_cap: basicInfo.market_cap,
      face_value: nseData.securityInfo?.faceValue,
      book_value_per_share: null, // Not available in quote API
      dividend_yield: null, // Not available in quote API
      roe: null, // Not available in quote API
      roce: null, // Not available in quote API
      debt_to_equity: null, // Not available in quote API
    };

    // Generate simple price history from available data
    const priceHistory = [];
    if (priceInfo.previousClose && priceInfo.close) {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      priceHistory.push({
        date: yesterday.toISOString(),
        open: priceInfo.previousClose,
        high: priceInfo.previousClose,
        low: priceInfo.previousClose,
        close: priceInfo.previousClose,
        volume: 0,
      });

      priceHistory.push({
        date: today.toISOString(),
        open: priceInfo.open || priceInfo.close,
        high: priceInfo.intraDayHighLow?.max || priceInfo.close,
        low: priceInfo.intraDayHighLow?.min || priceInfo.close,
        close: priceInfo.close || priceInfo.lastPrice,
        volume: 0,
      });
    }

    res.json({
      success: true,
      data: {
        basic_info: basicInfo,
        price_info: currentPrice,
        fundamentals: fundamentals,
        latest_financial: {},
        price_history_5y: priceHistory,
        nse_data: {
          trading_status: nseData.securityInfo?.tradingStatus,
          board_status: nseData.securityInfo?.boardStatus,
          surveillance: nseData.securityInfo?.surveillance,
          is_fno: nseData.info?.isFNOSec,
          issued_size: nseData.securityInfo?.issuedSize,
        },
      },
    });
  } catch (error) {
    console.error("NSE API Error for stock details:", error.message);

    // Fallback to local database
    try {
      const stock = await Stock.findOne({ symbol: upperSymbol }).lean();

      if (!stock) {
        return res.status(404).json({
          success: false,
          error: `Stock ${upperSymbol} not found`,
        });
      }

      // Get latest fundamentals
      const fundamental = await Fundamental.findOne({ stock_id: stock._id })
        .sort({ date: -1 })
        .lean();

      // Get recent price history
      const priceHistory = await PriceHistory.find({
        stock_id: stock._id,
      })
        .sort({ date: -1 })
        .limit(365)
        .lean();

      // Get latest financial statement
      const latestFinancial = await FinancialStatement.findOne({
        stock_id: stock._id,
      })
        .sort({ fiscal_year: -1, quarter: -1 })
        .lean();

      const latestPrice = priceHistory.length > 0 ? priceHistory[0] : null;
      const prevPrice = priceHistory.length > 1 ? priceHistory[1] : null;

      res.json({
        success: true,
        data: {
          basic_info: {
            symbol: stock.symbol,
            name: stock.name,
            sector: stock.sector,
            industry: stock.industry,
            market_cap: stock.market_cap,
            listing_date: stock.listing_date,
          },
          price_info: latestPrice
            ? {
                last_price: latestPrice.close,
                change: prevPrice ? latestPrice.close - prevPrice.close : 0,
                change_percent:
                  prevPrice && prevPrice.close !== 0
                    ? ((latestPrice.close - prevPrice.close) /
                        prevPrice.close) *
                      100
                    : 0,
                previous_close: prevPrice?.close,
                open: latestPrice.open,
                close: latestPrice.close,
                day_high: latestPrice.high,
                day_low: latestPrice.low,
              }
            : {},
          fundamentals: fundamental || {},
          latest_financial: latestFinancial || {},
          price_history_5y: priceHistory.reverse().map((ph) => ({
            date: ph.date,
            open: ph.open,
            high: ph.high,
            low: ph.low,
            close: ph.close,
            volume: ph.volume,
          })),
          fallback: true,
        },
      });
    } catch (dbError) {
      console.error("Database fallback error:", dbError);
      next(error);
    }
  }
};

/**
 * Get stock technicals
 * GET /api/stocks/:symbol/technicals
 */
const getStockTechnicals = async (req, res, next) => {
  try {
    const { symbol } = req.params;

    const stock = await Stock.findOne({ symbol: symbol.toUpperCase() }).lean();

    if (!stock) {
      return res.status(404).json({
        success: false,
        error: "Stock not found",
      });
    }

    // Get recent price history for technical calculations
    const priceHistory = await PriceHistory.find({
      stock_id: stock._id,
    })
      .sort({ date: -1 })
      .limit(250)
      .lean();

    if (priceHistory.length === 0) {
      return res.json({
        success: true,
        data: {
          current_price: null,
          sma_50: null,
          sma_200: null,
          rsi_14: null,
          macd: { macd: null, signal: null, histogram: null },
        },
      });
    }

    // Reverse to get chronological order
    priceHistory.reverse();

    const indicators = calculateAllIndicators(priceHistory);
    const currentPrice = priceHistory[priceHistory.length - 1].close;

    res.json({
      success: true,
      data: {
        current_price: currentPrice,
        ...indicators,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get stock financial statements
 * GET /api/stocks/:symbol/financials?quarters=4
 */
const getStockFinancials = async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const quarters = parseInt(req.query.quarters) || 4;

    // Try to find stock in database
    const stock = await Stock.findOne({ symbol: symbol.toUpperCase() }).lean();

    // If stock not found in database, return empty data (not an error)
    // This allows the quarterly results widget to still work with NSE API
    if (!stock) {
      return res.json({
        success: true,
        data: {
          p_and_l: [],
          balance_sheet: [],
          message: "Historical financial data not available in database",
        },
      });
    }

    const financials = await FinancialStatement.find({
      stock_id: stock._id,
    })
      .sort({ fiscal_year: -1, quarter: -1 })
      .limit(quarters)
      .lean();

    res.json({
      success: true,
      data: {
        p_and_l: financials.map((f) => ({
          period: `Q${f.quarter} FY${f.fiscal_year}`,
          revenue: f.revenue,
          gross_profit: f.gross_profit,
          operating_profit: f.operating_profit,
          ebitda: f.ebitda,
          net_profit: f.net_profit,
        })),
        balance_sheet: financials.map((f) => ({
          period: `Q${f.quarter} FY${f.fiscal_year}`,
          total_assets: f.total_assets,
          total_liabilities: f.total_liabilities,
          shareholders_equity: f.shareholders_equity,
          total_debt: f.total_debt,
          current_assets: f.current_assets,
          current_liabilities: f.current_liabilities,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Helper function to calculate YoY and QoQ growth metrics
 * YoY compares same fiscal quarter from previous year
 * QoQ compares previous fiscal quarter
 */
function calculateGrowthMetrics(quarters) {
  // Sort by fiscal_year and quarter (newest first)
  const sorted = quarters.sort((a, b) => {
    if (b.fiscal_year !== a.fiscal_year) {
      return b.fiscal_year - a.fiscal_year;
    }
    return b.quarter - a.quarter;
  });

  sorted.forEach((quarter, index) => {
    // YoY Growth - find the same fiscal quarter from previous year
    const prevYearQuarter = sorted.find(
      (q, i) =>
        i > index &&
        q.quarter === quarter.quarter &&
        q.fiscal_year === quarter.fiscal_year - 1 &&
        q.consolidated === quarter.consolidated
    );

    if (prevYearQuarter) {
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

      if (
        quarter.eps_basic &&
        prevYearQuarter.eps_basic &&
        prevYearQuarter.eps_basic !== 0
      ) {
        quarter.yoy_eps_growth =
          ((quarter.eps_basic - prevYearQuarter.eps_basic) /
            Math.abs(prevYearQuarter.eps_basic)) *
          100;
      }
    }

    // QoQ Growth - compare with previous fiscal quarter
    const prevQuarter = sorted.find(
      (q, i) =>
        i > index &&
        q.consolidated === quarter.consolidated &&
        (q.fiscal_year === quarter.fiscal_year
          ? q.quarter === quarter.quarter - 1
          : q.fiscal_year === quarter.fiscal_year - 1 && q.quarter === 4)
    );

    if (prevQuarter) {
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

      if (
        quarter.eps_basic &&
        prevQuarter.eps_basic &&
        prevQuarter.eps_basic !== 0
      ) {
        quarter.qoq_eps_growth =
          ((quarter.eps_basic - prevQuarter.eps_basic) /
            Math.abs(prevQuarter.eps_basic)) *
          100;
      }
    }
  });

  // Reverse to oldest to newest for display
  return sorted.reverse();
}

/**
 * Format quarterly result for API response
 */
function formatQuarterForResponse(quarter) {
  return {
    period: quarter.period,
    quarter: quarter.quarter,
    fiscal_year: quarter.fiscal_year,
    to_date: quarter.to_date,
    from_date: quarter.from_date,
    broadcast_date: quarter.broadcast_date,

    // P&L Data
    sales: quarter.revenue,
    expenses:
      quarter.total_expenses ||
      quarter.cost_of_materials +
        quarter.employee_expenses +
        quarter.other_expenses,
    operating_profit: quarter.operating_profit,
    opm_percent: quarter.opm_percent,
    other_income: quarter.other_income,
    interest: quarter.finance_costs,
    depreciation: quarter.depreciation,
    pbt: quarter.profit_before_tax,
    tax_percent: quarter.tax_percent,
    net_profit: quarter.net_profit,
    eps: quarter.eps_basic || quarter.eps_diluted,
    audited: quarter.audited,
    consolidated: quarter.consolidated,

    // Growth Metrics
    yoy_sales_growth: quarter.yoy_revenue_growth,
    yoy_profit_growth: quarter.yoy_profit_growth,
    yoy_eps_growth: quarter.yoy_eps_growth,
    qoq_sales_growth: quarter.qoq_revenue_growth,
    qoq_profit_growth: quarter.qoq_profit_growth,
    qoq_eps_growth: quarter.qoq_eps_growth,

    // Balance Sheet Data
    equity_capital: quarter.equity_capital,
    reserves: quarter.reserves,
    borrowings: quarter.borrowings,
    other_liabilities: quarter.other_liabilities,
    total_liabilities: quarter.total_liabilities,
    fixed_assets: quarter.fixed_assets,
    cwip: quarter.cwip,
    investments: quarter.investments,
    other_assets: quarter.other_assets,
    total_assets: quarter.total_assets,

    // Cash Flow Data
    cash_from_operating: quarter.cash_from_operating,
    cash_from_investing: quarter.cash_from_investing,
    cash_from_financing: quarter.cash_from_financing,
    net_cash_flow: quarter.net_cash_flow,
  };
}

/**
 * Get quarterly financial results with XBRL parsing and caching
 * GET /api/stocks/:symbol/quarterly
 */
const getQuarterlyResults = async (req, res, next) => {
  const { symbol } = req.params;
  const upperSymbol = symbol.toUpperCase();
  const { force_refresh } = req.query; // ?force_refresh=true to bypass cache

  try {
    // Step 1: Check cache first (data from last 2 days for fresher financial data)
    const cacheExpiry = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    if (!force_refresh) {
      const cachedResults = await QuarterlyResult.find({
        symbol: upperSymbol,
        last_updated: { $gte: cacheExpiry },
      })
        .sort({ to_date: 1 }) // Oldest to newest
        .lean();

      if (cachedResults.length > 0) {
        console.log(
          `Cache hit for ${upperSymbol}: ${cachedResults.length} quarters`
        );

        // Calculate growth metrics
        const resultsWithGrowth = calculateGrowthMetrics(cachedResults);
        const formattedQuarters = resultsWithGrowth.map(
          formatQuarterForResponse
        );

        return res.json({
          success: true,
          data: {
            symbol: upperSymbol,
            quarters: formattedQuarters,
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

    // Fetch from both APIs and merge results
    const issuer = encodeURIComponent(companyName || `${upperSymbol} LIMITED`);

    // API 1: corporates-financial-results (historical data)
    let historicalResults = [];
    try {
      const historicalResponse = await axios.get(
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
      historicalResults = historicalResponse.data || [];
      console.log(`Historical API: ${historicalResults.length} quarters found`);
    } catch (err) {
      console.warn(`Historical API failed: ${err.message}`);
    }

    // API 2: integrated-filing-results (recent 4 quarters with broadcast time)
    let recentResults = [];
    try {
      const recentResponse = await axios.get(
        `https://www.nseindia.com/api/integrated-filing-results?index=equities&symbol=${upperSymbol}&issuer=${issuer}&period_ended=all&type=Integrated%20Filing-%20Financials&page=1&size=20`,
        {
          timeout: 15000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            Accept: "application/json",
          },
        }
      );
      recentResults = (recentResponse.data?.data || []).map((r) => ({
        xbrl: r.xbrl,
        companyName: r.cmName,
        consolidated: r.consolidated,
        audited: r.audited,
        fromDate: null, // Not provided in this API
        toDate: r.qe_Date,
        filingDate: r.creation_Date,
        broadcastDate: r.broadcast_Date,
        seqNumber: r.seq_Id,
      }));
      console.log(`Recent API: ${recentResults.length} quarters found`);
    } catch (err) {
      console.warn(`Recent API failed: ${err.message}`);
    }

    // Merge results: Use recent API data preferentially, then historical
    // Create a map to deduplicate by (toDate + consolidated)
    const resultsMap = new Map();

    // Add historical results first
    historicalResults.forEach((r) => {
      if (r.xbrl) {
        const key = `${r.toDate}_${r.consolidated}`;
        resultsMap.set(key, {
          ...r,
          source: "historical",
        });
      }
    });

    // Override/add with recent results (they have broadcast_date)
    recentResults.forEach((r) => {
      if (r.xbrl) {
        const key = `${r.toDate}_${r.consolidated}`;
        resultsMap.set(key, {
          ...r,
          source: "recent",
        });
      }
    });

    const allResults = Array.from(resultsMap.values());
    console.log(`Merged: ${allResults.length} unique quarters`);

    if (allResults.length === 0) {
      return res.json({
        success: true,
        data: {
          quarters: [],
          message: "No quarterly results available",
        },
      });
    }

    // Step 3: Parse XBRL documents and store in database
    const promises = [];

    // Process all results (both consolidated and standalone)
    const latestResults = allResults;

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

            // Parse toDate - handle different formats (DD-MMM-YYYY or YYYY-MM-DD)
            let toDate;
            if (result.toDate.includes("-") && result.toDate.length > 10) {
              // Format: DD-MMM-YYYY (e.g., "30-SEP-2025")
              const parts = result.toDate.split("-");
              const months = {
                JAN: 0,
                FEB: 1,
                MAR: 2,
                APR: 3,
                MAY: 4,
                JUN: 5,
                JUL: 6,
                AUG: 7,
                SEP: 8,
                OCT: 9,
                NOV: 10,
                DEC: 11,
                Jan: 0,
                Feb: 1,
                Mar: 2,
                Apr: 3,
                May: 4,
                Jun: 5,
                Jul: 6,
                Aug: 7,
                Sep: 8,
                Oct: 9,
                Nov: 10,
                Dec: 11,
              };
              const monthStr = parts[1].toUpperCase().substring(0, 3);
              toDate = new Date(
                parseInt(parts[2]),
                months[monthStr],
                parseInt(parts[0])
              );
            } else {
              toDate = new Date(result.toDate);
            }

            // Create period string using fiscal year (Apr-Mar)
            // Fiscal Q1 = Apr-Jun (month 3-5), Q2 = Jul-Sep (6-8), Q3 = Oct-Dec (9-11), Q4 = Jan-Mar (0-2)
            const month = toDate.getMonth(); // 0-11
            let quarter, fiscal_year;

            if (month >= 3 && month <= 5) {
              // Apr-Jun = Q1
              quarter = 1;
              fiscal_year = toDate.getFullYear() + 1; // FY 2025 for Apr-Jun 2024
            } else if (month >= 6 && month <= 8) {
              // Jul-Sep = Q2
              quarter = 2;
              fiscal_year = toDate.getFullYear() + 1;
            } else if (month >= 9 && month <= 11) {
              // Oct-Dec = Q3
              quarter = 3;
              fiscal_year = toDate.getFullYear() + 1;
            } else {
              // Jan-Mar = Q4
              quarter = 4;
              fiscal_year = toDate.getFullYear(); // FY 2025 for Jan-Mar 2025
            }

            const period = `Q${quarter} FY${String(fiscal_year).slice(-2)}`;

            // Parse broadcast date if available
            let broadcastDate = null;
            if (result.broadcastDate) {
              // Format: "16-Oct-2025 17:04:16"
              const bcParts = result.broadcastDate.split(" ");
              const dateParts = bcParts[0].split("-");
              const timeParts = bcParts[1].split(":");
              const months = {
                Jan: 0,
                Feb: 1,
                Mar: 2,
                Apr: 3,
                May: 4,
                Jun: 5,
                Jul: 6,
                Aug: 7,
                Sep: 8,
                Oct: 9,
                Nov: 10,
                Dec: 11,
              };
              broadcastDate = new Date(
                dateParts[2],
                months[dateParts[1]],
                dateParts[0],
                timeParts[0],
                timeParts[1],
                timeParts[2]
              );
            }

            // Prepare document
            const quarterDoc = {
              symbol: upperSymbol,
              company_name: result.companyName || companyName,
              from_date: result.fromDate ? new Date(result.fromDate) : null,
              to_date: toDate,
              period,
              quarter,
              fiscal_year,
              filing_date: result.filingDate
                ? new Date(result.filingDate)
                : null,
              broadcast_date: broadcastDate,
              audited:
                result.audited === "Audited" || result.audited === "Un-Audited"
                  ? result.audited === "Audited"
                  : false,
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
    const parsedResults = await Promise.all(promises);
    const validResults = parsedResults.filter((r) => r !== null);

    // Step 4: Calculate growth metrics
    const quarters = calculateGrowthMetrics(validResults);
    const formattedQuarters = quarters.map(formatQuarterForResponse);

    res.json({
      success: true,
      data: {
        symbol: upperSymbol,
        quarters: formattedQuarters,
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
        .lean();

      if (fallbackResults.length > 0) {
        const quarters = calculateGrowthMetrics(fallbackResults);
        const formattedQuarters = quarters.map(formatQuarterForResponse);

        return res.json({
          success: true,
          data: {
            symbol: upperSymbol,
            quarters: formattedQuarters,
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
 * Get order book for a stock
 * GET /api/stocks/:symbol/orderbook
 */
const getOrderBook = async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const upperSymbol = symbol.toUpperCase();

    // Initialize OrderBook extractor
    const extractor = new OrderBookExtractor(upperSymbol);

    // TODO: In production, fetch from actual data sources:
    // 1. Latest order book from annual/quarterly reports
    // 2. Order events from corporate announcements
    
    // For now, return example data structure
    // Set a sample latest order book (this should come from IR documents)
    extractor.setLatestOrderBook(
      5000.0, // Sample value in Cr
      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10), // 90 days ago
      "Quarterly_Report_Q2_FY25"
    );

    // Sample order events (these should come from NSE/BSE announcements)
    extractor.orderEvents = [
      new OrderEvent({
        date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
        eventType: OrderEventType.ORDER_INFLOW,
        amountCr: 300.0,
        description: "New order received from client",
      }),
      new OrderEvent({
        date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
        eventType: OrderEventType.ORDER_COMPLETION,
        amountCr: 150.0,
        description: "Project completion",
      }),
      new OrderEvent({
        date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
        eventType: OrderEventType.ORDER_INFLOW,
        amountCr: 250.0,
        description: "Additional order from existing client",
      }),
    ];

    // Generate the report
    const report = extractor.generateReport();

    return res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error("Error fetching order book:", error);
    return res.status(500).json({
      success: false,
      data: {
        symbol: req.params.symbol,
        error: "Unable to fetch order book data",
      },
    });
  }
};

module.exports = {
  searchStocks,
  getStockDetails,
  getStockTechnicals,
  getStockFinancials,
  getQuarterlyResults,
  getOrderBook,
};
