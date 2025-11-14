const Stock = require('../models/Stock');
const Fundamental = require('../models/Fundamental');

/**
 * Run screener with filters
 * POST /api/screener/run
 */
const runScreener = async (req, res, next) => {
  try {
    const { filters, sort_by = 'market_cap', sort_order = 'desc', limit = 100 } = req.body;

    // Build stock query
    const stockQuery = {};
    
    if (filters.market_cap_min !== undefined) {
      stockQuery.market_cap = { ...stockQuery.market_cap, $gte: filters.market_cap_min };
    }
    if (filters.market_cap_max !== undefined) {
      stockQuery.market_cap = { ...stockQuery.market_cap, $lte: filters.market_cap_max };
    }
    if (filters.sectors && filters.sectors.length > 0) {
      stockQuery.sector = { $in: filters.sectors };
    }
    if (filters.industries && filters.industries.length > 0) {
      stockQuery.industry = { $in: filters.industries };
    }

    // Get matching stocks
    const stocks = await Stock.find(stockQuery).select('_id symbol name sector industry market_cap').lean();

    if (stocks.length === 0) {
      return res.json({
        success: true,
        data: [],
        count: 0,
      });
    }

    const stockIds = stocks.map(s => s._id);

    // Build fundamental query
    const fundamentalQuery = { stock_id: { $in: stockIds } };

    if (filters.pe_min !== undefined) {
      fundamentalQuery.pe_ratio = { ...fundamentalQuery.pe_ratio, $gte: filters.pe_min };
    }
    if (filters.pe_max !== undefined) {
      fundamentalQuery.pe_ratio = { ...fundamentalQuery.pe_ratio, $lte: filters.pe_max };
    }
    if (filters.pb_min !== undefined) {
      fundamentalQuery.pb_ratio = { ...fundamentalQuery.pb_ratio, $gte: filters.pb_min };
    }
    if (filters.pb_max !== undefined) {
      fundamentalQuery.pb_ratio = { ...fundamentalQuery.pb_ratio, $lte: filters.pb_max };
    }
    if (filters.roe_min !== undefined) {
      fundamentalQuery.roe = { ...fundamentalQuery.roe, $gte: filters.roe_min };
    }
    if (filters.roe_max !== undefined) {
      fundamentalQuery.roe = { ...fundamentalQuery.roe, $lte: filters.roe_max };
    }
    if (filters.roce_min !== undefined) {
      fundamentalQuery.roce = { ...fundamentalQuery.roce, $gte: filters.roce_min };
    }
    if (filters.roce_max !== undefined) {
      fundamentalQuery.roce = { ...fundamentalQuery.roce, $lte: filters.roce_max };
    }
    if (filters.debt_to_equity_max !== undefined) {
      fundamentalQuery.debt_to_equity = { $lte: filters.debt_to_equity_max };
    }
    if (filters.revenue_growth_3y_min !== undefined) {
      fundamentalQuery.revenue_growth_3y = { $gte: filters.revenue_growth_3y_min };
    }
    if (filters.profit_growth_3y_min !== undefined) {
      fundamentalQuery.profit_growth_3y = { $gte: filters.profit_growth_3y_min };
    }
    if (filters.dividend_yield_min !== undefined) {
      fundamentalQuery.dividend_yield = { ...fundamentalQuery.dividend_yield, $gte: filters.dividend_yield_min };
    }
    if (filters.dividend_yield_max !== undefined) {
      fundamentalQuery.dividend_yield = { ...fundamentalQuery.dividend_yield, $lte: filters.dividend_yield_max };
    }
    if (filters.current_ratio_min !== undefined) {
      fundamentalQuery.current_ratio = { $gte: filters.current_ratio_min };
    }

    // Get fundamentals matching criteria
    const fundamentals = await Fundamental.aggregate([
      { $match: fundamentalQuery },
      { $sort: { date: -1 } },
      {
        $group: {
          _id: '$stock_id',
          latest: { $first: '$$ROOT' },
        },
      },
    ]);

    // Merge stock and fundamental data
    const stockMap = {};
    stocks.forEach(stock => {
      stockMap[stock._id.toString()] = stock;
    });

    const results = fundamentals
      .map(f => {
        const stock = stockMap[f._id.toString()];
        if (!stock) return null;

        return {
          id: stock._id,
          symbol: stock.symbol,
          name: stock.name,
          sector: stock.sector,
          industry: stock.industry,
          market_cap: stock.market_cap,
          pe_ratio: f.latest.pe_ratio,
          pb_ratio: f.latest.pb_ratio,
          roe: f.latest.roe,
          roce: f.latest.roce,
          debt_to_equity: f.latest.debt_to_equity,
          revenue_growth_3y: f.latest.revenue_growth_3y,
          profit_growth_3y: f.latest.profit_growth_3y,
          dividend_yield: f.latest.dividend_yield,
          current_ratio: f.latest.current_ratio,
        };
      })
      .filter(r => r !== null);

    // Sort results
    const sortField = sort_by === 'market_cap' ? 'market_cap' : sort_by;
    results.sort((a, b) => {
      const aVal = a[sortField] || 0;
      const bVal = b[sortField] || 0;
      return sort_order === 'desc' ? bVal - aVal : aVal - bVal;
    });

    // Limit results
    const limitedResults = results.slice(0, Math.min(limit, 1000));

    res.json({
      success: true,
      data: limitedResults,
      count: limitedResults.length,
      total: results.length,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  runScreener,
};

