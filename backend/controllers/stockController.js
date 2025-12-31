const Stock = require('../models/Stock');
const Fundamental = require('../models/Fundamental');
const PriceHistory = require('../models/PriceHistory');
const FinancialStatement = require('../models/FinancialStatement');
const QuarterlyResult = require('../models/QuarterlyResult');
const { calculateAllIndicators, calculateSMA } = require('../utils/technicalIndicators');
const { fetchAndStoreQuarterlyResults } = require('../scripts/balanceSheetDataFetcher');
const { fetchStockDetails } = require('../scripts/stockDetailsFetcher');
const axios = require('axios');
const { getStockScripCode } = require('../api/bseIndiaApi');

/**
 * Search stocks by symbol or name using NSE India API
 * GET /api/stocks/search?q={query}&page={page}&limit={limit}
 */
const searchStocks = async (req, res, next) => {
  const { q, page = 1, limit = 10 } = req.query;

  if (!q || q.length < 1) {
    return res.status(400).json({
      success: false,
      error: 'Search query is required',
    });
  }

  try {
    // Call NSE India autocomplete API
    const apiResponse = await axios.get(
      `https://www.nseindia.com/api/search/autocomplete?q=${encodeURIComponent(q)}`,
      {
        timeout: 10000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          Accept: 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      }
    );

    // Extract and format the response from NSE India API
    const symbols = apiResponse.data.symbols || [];

    // Filter only equity stocks (not mutual funds, etc.)
    const equitySymbols = symbols.filter(
      (item) =>
        item.result_sub_type === 'equity' && item.activeSeries && item.activeSeries.includes('EQ')
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
      exchange: 'NSE',
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
    console.error('NSE India API Error:', error.message);

    // Fallback to local database if NSE India API fails
    try {
      console.log('Using local database fallback for search:', q);

      const pageNum = Number(page);
      const limitNum = Number(limit);
      const skip = (pageNum - 1) * limitNum;

      const stocks = await Stock.find({
        $or: [{ symbol: { $regex: q, $options: 'i' } }, { name: { $regex: q, $options: 'i' } }],
      })
        .skip(skip)
        .limit(limitNum)
        .select('id symbol name sector industry market_cap')
        .lean();

      const totalCount = await Stock.countDocuments({
        $or: [{ symbol: { $regex: q, $options: 'i' } }, { name: { $regex: q, $options: 'i' } }],
      });

      return res.json({
        success: true,
        results: stocks.map((stock) => ({
          name: stock.name,
          symbol: stock.symbol,
          exchange: 'NSE',
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
      console.error('Database fallback error:', dbError);
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

    const scripCode = await getStockScripCode(symbol);
    const stockDetails = await fetchStockDetails(upperSymbol, scripCode);

    res.json({
      success: true,
      data: {
        basic_info: stockDetails.basicInfo,
        price_info: stockDetails.currentPrice,
        fundamentals: stockDetails.fundamentals,
        price_history_5y: stockDetails.priceHistory,
      },
    });
  } catch (error) {
    console.error('Database fallback error:', error);
    next(error);
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
        error: 'Stock not found',
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
          message: 'Historical financial data not available in database',
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
      if (quarter.revenue && prevYearQuarter.revenue && prevYearQuarter.revenue !== 0) {
        quarter.yoy_revenue_growth =
          ((quarter.revenue - prevYearQuarter.revenue) / Math.abs(prevYearQuarter.revenue)) * 100;
      }

      if (quarter.net_profit && prevYearQuarter.net_profit && prevYearQuarter.net_profit !== 0) {
        quarter.yoy_profit_growth =
          ((quarter.net_profit - prevYearQuarter.net_profit) /
            Math.abs(prevYearQuarter.net_profit)) *
          100;
      }

      if (quarter.eps_basic && prevYearQuarter.eps_basic && prevYearQuarter.eps_basic !== 0) {
        quarter.yoy_eps_growth =
          ((quarter.eps_basic - prevYearQuarter.eps_basic) / Math.abs(prevYearQuarter.eps_basic)) *
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
          ((quarter.revenue - prevQuarter.revenue) / Math.abs(prevQuarter.revenue)) * 100;
      }

      if (quarter.net_profit && prevQuarter.net_profit && prevQuarter.net_profit !== 0) {
        quarter.qoq_profit_growth =
          ((quarter.net_profit - prevQuarter.net_profit) / Math.abs(prevQuarter.net_profit)) * 100;
      }

      if (quarter.eps_basic && prevQuarter.eps_basic && prevQuarter.eps_basic !== 0) {
        quarter.qoq_eps_growth =
          ((quarter.eps_basic - prevQuarter.eps_basic) / Math.abs(prevQuarter.eps_basic)) * 100;
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
      quarter.cost_of_materials + quarter.employee_expenses + quarter.other_expenses,
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

    if (!force_refresh) {
      const cachedResults = await QuarterlyResult.find({
        symbol: upperSymbol,
      })
        .sort({ to_date: 1 }) // Oldest to newest
        .lean();

      if (cachedResults.length > 0) {
        console.log(`Cache hit for ${upperSymbol}: ${cachedResults.length} quarters`);

        // Calculate growth metrics
        const resultsWithGrowth = calculateGrowthMetrics(cachedResults);
        const formattedQuarters = resultsWithGrowth.map(formatQuarterForResponse);

        return res.json({
          success: true,
          data: {
            symbol: upperSymbol,
            quarters: formattedQuarters,
            source: 'Database Cache (NSE India)',
            cached: true,
          },
        });
      }
    }

    // Step 2: Fetch from NSE API
    console.log(`Cache miss for ${upperSymbol}, fetching from NSE...`);

    const parsedResults = await fetchAndStoreQuarterlyResults(upperSymbol);
    const validResults = parsedResults.filter((r) => r !== null);

    // Step 4: Calculate growth metrics
    const quarters = calculateGrowthMetrics(validResults);
    const formattedQuarters = quarters.map(formatQuarterForResponse);

    res.json({
      success: true,
      data: {
        symbol: upperSymbol,
        quarters: formattedQuarters,
        source: 'NSE India (XBRL)',
        cached: false,
        source_url: `https://www.nseindia.com/get-quotes/equity?symbol=${upperSymbol}`,
      },
    });
  } catch (error) {
    console.error('Error fetching quarterly results:', error);

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
            source: 'Database Cache (Fallback)',
            cached: true,
            warning: 'Using cached data due to API error',
          },
        });
      }
    } catch (dbErr) {
      console.error('Database fallback error:', dbErr);
    }

    res.json({
      success: true,
      data: {
        symbol: upperSymbol,
        quarters: [],
        error: 'Unable to fetch quarterly results',
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
};
