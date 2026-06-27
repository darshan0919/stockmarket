const Stock = require('../models/Stock');
const Fundamental = require('../models/Fundamental');
const { fetchSavedScans, runScan } = require('../services/stockscansScreener');
const {
  fetchSymbolMetrics,
  fetchHistoryMetrics,
  fetchOrderBookMetrics,
  mapWithConcurrency,
} = require('../services/topGainers');
const { fetchFundamentals } = require('../services/stockscansMetrics');

/**
 * Run screener with filters (legacy — kept for backward compatibility)
 * POST /api/screener/run
 */
const runScreener = async (req, res, next) => {
  try {
    const { filters, sort_by = 'market_cap', sort_order = 'desc', limit = 100 } = req.body;

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

    const stocks = await Stock.find(stockQuery)
      .select('_id symbol name sector industry market_cap')
      .lean();

    if (stocks.length === 0) {
      return res.json({ success: true, data: [], count: 0 });
    }

    const stockIds = stocks.map((s) => s._id);
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
      fundamentalQuery.dividend_yield = {
        ...fundamentalQuery.dividend_yield,
        $gte: filters.dividend_yield_min,
      };
    }
    if (filters.dividend_yield_max !== undefined) {
      fundamentalQuery.dividend_yield = {
        ...fundamentalQuery.dividend_yield,
        $lte: filters.dividend_yield_max,
      };
    }
    if (filters.current_ratio_min !== undefined) {
      fundamentalQuery.current_ratio = { $gte: filters.current_ratio_min };
    }

    const fundamentals = await Fundamental.aggregate([
      { $match: fundamentalQuery },
      { $sort: { date: -1 } },
      { $group: { _id: '$stock_id', latest: { $first: '$$ROOT' } } },
    ]);

    const stockMap = {};
    stocks.forEach((stock) => { stockMap[stock._id.toString()] = stock; });

    const results = fundamentals
      .map((f) => {
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
      .filter((r) => r !== null);

    const sortField = sort_by === 'market_cap' ? 'market_cap' : sort_by;
    results.sort((a, b) => {
      const aVal = a[sortField] || 0;
      const bVal = b[sortField] || 0;
      return sort_order === 'desc' ? bVal - aVal : aVal - bVal;
    });

    const limitedResults = results.slice(0, Math.min(limit, 1000));

    res.json({ success: true, data: limitedResults, count: limitedResults.length, total: results.length });
  } catch (error) {
    next(error);
  }
};

/**
 * List the user's saved StockScans scans.
 * GET /api/screener/saved-scans
 */
const getSavedScans = async (req, res, next) => {
  try {
    const scans = await fetchSavedScans();
    res.json({ success: true, data: scans });
  } catch (err) {
    if (err.code === 'STOCKSCANS_AUTH_REQUIRED') {
      return res.status(401).json({ success: false, error: 'StockScans authentication required', code: err.code });
    }
    next(err);
  }
};

/**
 * Run a saved StockScans scan and enrich results with live NSE + history + order book data.
 * Returns rows in the same unified shape as the top-gainers endpoint.
 * POST /api/screener/run-scan
 * Body: { scan: <full scan definition object> }
 */
const runSavedScan = async (req, res, next) => {
  try {
    const { scan } = req.body;

    if (!scan || !scan.scanId) {
      return res.status(400).json({ success: false, error: 'scan object with scanId is required' });
    }

    // Get symbol list from StockScans scan (ignores the scan's metric columns)
    const { rows: scanRows, scanName } = await runScan(scan);

    // Only enrich NSE-listed symbols
    const nseRows = scanRows.filter((r) => r.exchange === 'NSE');

    // Seed rows in the unified shape (same as topGainers mapBaseRow output)
    const rows = nseRows.map((r) => ({
      symbol: r.symbol,
      name: r.symbol,
      price: null,
      changePercent: null,
      previousClose: null,
      volume: null,
      value: null,
      pe: null,
      marketCapCr: null,
      deliveryPercent: null,
      avgDeliveryPercent30d: null,
      weekChangePercent: null,
      retailHoldingPercent: null,
      patGrowthTtm: null,
      bidLevels: null,
      offerLevels: null,
      totalBidQty: null,
      totalOfferQty: null,
    }));

    if (rows.length > 0) {
      const symbols = rows.map((r) => r.symbol);
      let batchMetrics = {};
      try { batchMetrics = await fetchFundamentals(symbols); } catch { /* best-effort */ }

      const tasks = rows.map((row) => async () => {
        const [symbolMetrics, history, orderBook] = await Promise.all([
          fetchSymbolMetrics(row.symbol),
          fetchHistoryMetrics(row.symbol),
          fetchOrderBookMetrics(row.symbol),
        ]);
        const fm = batchMetrics[row.symbol] || {};
        if (symbolMetrics.price != null) row.price = symbolMetrics.price;
        if (symbolMetrics.changePercent != null) row.changePercent = symbolMetrics.changePercent;
        if (symbolMetrics.volume != null) row.volume = symbolMetrics.volume;
        if (symbolMetrics.value != null) row.value = symbolMetrics.value;
        row.marketCapCr = symbolMetrics.marketCapCr != null ? symbolMetrics.marketCapCr : (fm.marketCapCr != null ? fm.marketCapCr : null);
        row.pe = fm.pe != null ? fm.pe : null;
        row.retailHoldingPercent = fm.retailHoldingsPercent != null ? fm.retailHoldingsPercent : null;
        row.patGrowthTtm = fm.patGrowthTtm != null ? fm.patGrowthTtm : null;
        row.deliveryPercent = symbolMetrics.deliveryPercent != null ? symbolMetrics.deliveryPercent : history.deliveryPercent;
        row.avgDeliveryPercent30d = history.avgDeliveryPercent30d;
        row.weekChangePercent = history.weekChangePercent;
        row.bidLevels = orderBook.bidLevels;
        row.offerLevels = orderBook.offerLevels;
        row.totalBidQty = orderBook.totalBidQty;
        row.totalOfferQty = orderBook.totalOfferQty;
      });
      await mapWithConcurrency(tasks, 3);
    }

    res.json({
      success: true,
      data: { rows, total: rows.length, scanName },
    });
  } catch (err) {
    if (err.code === 'STOCKSCANS_AUTH_REQUIRED') {
      return res.status(401).json({ success: false, error: 'StockScans authentication required', code: err.code });
    }
    if (err.code === 'STOCKSCANS_INVALID_SCAN') {
      return res.status(400).json({ success: false, error: err.message });
    }
    next(err);
  }
};

module.exports = {
  runScreener,
  getSavedScans,
  runSavedScan,
};
