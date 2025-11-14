const Watchlist = require('../models/Watchlist');
const Stock = require('../models/Stock');
const Fundamental = require('../models/Fundamental');
const PriceHistory = require('../models/PriceHistory');

/**
 * Get all watchlist items
 * GET /api/watchlist
 */
const getWatchlist = async (req, res, next) => {
  try {
    const watchlistItems = await Watchlist.find().sort({ added_date: -1 }).lean();

    if (watchlistItems.length === 0) {
      return res.json({
        success: true,
        data: [],
      });
    }

    const symbols = watchlistItems.map(item => item.symbol);
    const stocks = await Stock.find({ symbol: { $in: symbols } }).lean();

    const stockMap = {};
    stocks.forEach(stock => {
      stockMap[stock.symbol] = stock;
    });

    // Get fundamentals and latest prices for each stock
    const enrichedWatchlist = await Promise.all(
      watchlistItems.map(async item => {
        const stock = stockMap[item.symbol];
        if (!stock) return null;

        const fundamental = await Fundamental.findOne({ stock_id: stock._id })
          .sort({ date: -1 })
          .lean();

        const latestPrice = await PriceHistory.findOne({ stock_id: stock._id })
          .sort({ date: -1 })
          .lean();

        const prevPrice = await PriceHistory.findOne({ stock_id: stock._id })
          .sort({ date: -1 })
          .skip(1)
          .lean();

        const price = latestPrice ? latestPrice.close : null;
        const change = latestPrice && prevPrice ? latestPrice.close - prevPrice.close : 0;
        const changePercent = prevPrice && prevPrice.close !== 0 ? (change / prevPrice.close) * 100 : 0;

        return {
          symbol: stock.symbol,
          name: stock.name,
          sector: stock.sector,
          price: price,
          change: change,
          change_percent: changePercent,
          pe_ratio: fundamental ? fundamental.pe_ratio : null,
          roe: fundamental ? fundamental.roe : null,
          added_date: item.added_date,
        };
      })
    );

    const filteredWatchlist = enrichedWatchlist.filter(item => item !== null);

    res.json({
      success: true,
      data: filteredWatchlist,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add stock to watchlist
 * POST /api/watchlist/:symbol
 */
const addToWatchlist = async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const upperSymbol = symbol.toUpperCase();

    // Check if stock exists
    const stock = await Stock.findOne({ symbol: upperSymbol });
    if (!stock) {
      return res.status(404).json({
        success: false,
        error: 'Stock not found',
      });
    }

    // Check if already in watchlist
    const existing = await Watchlist.findOne({ symbol: upperSymbol });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Stock already in watchlist',
      });
    }

    const watchlistItem = new Watchlist({
      symbol: upperSymbol,
    });

    await watchlistItem.save();

    res.status(201).json({
      success: true,
      message: 'Stock added to watchlist',
      data: { symbol: upperSymbol },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove stock from watchlist
 * DELETE /api/watchlist/:symbol
 */
const removeFromWatchlist = async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const upperSymbol = symbol.toUpperCase();

    const result = await Watchlist.findOneAndDelete({ symbol: upperSymbol });

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Stock not in watchlist',
      });
    }

    res.json({
      success: true,
      message: 'Stock removed from watchlist',
      data: { symbol: upperSymbol },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
};

