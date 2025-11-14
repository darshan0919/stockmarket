const Stock = require('../models/Stock');
const Fundamental = require('../models/Fundamental');
const PriceHistory = require('../models/PriceHistory');
const FinancialStatement = require('../models/FinancialStatement');
const { calculateAllIndicators, calculateSMA } = require('../utils/technicalIndicators');

/**
 * Search stocks by symbol or name
 * GET /api/stocks/search?q={query}
 */
const searchStocks = async (req, res, next) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 1) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required',
      });
    }

    const stocks = await Stock.find({
      $or: [
        { symbol: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
      ],
    })
      .limit(20)
      .select('id symbol name sector industry market_cap')
      .lean();

    res.json({
      success: true,
      data: stocks,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get stock details by symbol
 * GET /api/stocks/:symbol
 */
const getStockDetails = async (req, res, next) => {
  try {
    const { symbol } = req.params;

    const stock = await Stock.findOne({ symbol: symbol.toUpperCase() }).lean();

    if (!stock) {
      return res.status(404).json({
        success: false,
        error: 'Stock not found',
      });
    }

    // Get latest fundamentals
    const fundamental = await Fundamental.findOne({ stock_id: stock._id })
      .sort({ date: -1 })
      .lean();

    // Get 5 years price history
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

    const priceHistory = await PriceHistory.find({
      stock_id: stock._id,
      date: { $gte: fiveYearsAgo },
    })
      .sort({ date: 1 })
      .lean();

    // Get latest financial statement
    const latestFinancial = await FinancialStatement.findOne({
      stock_id: stock._id,
    })
      .sort({ fiscal_year: -1, quarter: -1 })
      .lean();

    res.json({
      success: true,
      data: {
        basic_info: {
          id: stock._id,
          symbol: stock.symbol,
          name: stock.name,
          sector: stock.sector,
          industry: stock.industry,
          market_cap: stock.market_cap,
          listing_date: stock.listing_date,
        },
        fundamentals: fundamental || {},
        latest_financial: latestFinancial || {},
        price_history_5y: priceHistory.map(ph => ({
          date: ph.date,
          open: ph.open,
          high: ph.high,
          low: ph.low,
          close: ph.close,
          volume: ph.volume,
        })),
      },
    });
  } catch (error) {
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

    const stock = await Stock.findOne({ symbol: symbol.toUpperCase() }).lean();

    if (!stock) {
      return res.status(404).json({
        success: false,
        error: 'Stock not found',
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
        p_and_l: financials.map(f => ({
          period: `Q${f.quarter} FY${f.fiscal_year}`,
          revenue: f.revenue,
          gross_profit: f.gross_profit,
          operating_profit: f.operating_profit,
          ebitda: f.ebitda,
          net_profit: f.net_profit,
        })),
        balance_sheet: financials.map(f => ({
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

module.exports = {
  searchStocks,
  getStockDetails,
  getStockTechnicals,
  getStockFinancials,
};

