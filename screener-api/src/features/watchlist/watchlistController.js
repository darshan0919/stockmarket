const Watchlist = require('./Watchlist');
const Stock = require('../stock/Stock');
const { getQuoteEquity } = require('../../core/api/nseIndiaApi');

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

    const symbols = watchlistItems.map((item) => item.symbol);
    const stocks = await Stock.find({ symbol: { $in: symbols } }).lean();

    const stockMap = {};
    stocks.forEach((stock) => {
      stockMap[stock.symbol] = stock;
    });

    // Get fundamentals and latest prices for each stock
    const enrichedWatchlist = await Promise.all(
      watchlistItems.map(async (item) => {
        const stock = stockMap[item.symbol];
        if (!stock) return null;

        // Fetch live quote from NSE instead of local DB history
        let nseData = null;
        try {
          nseData = await getQuoteEquity(stock.symbol);
        } catch (err) {
          console.warn(`Failed to fetch live quote for ${stock.symbol}:`, err.message);
        }

        const priceInfo = nseData?.priceInfo || {};
        const meta = nseData?.metadata || {};

        const price = priceInfo.lastPrice || null;
        const change = priceInfo.change || 0;
        const changePercent = priceInfo.pChange || 0;
        const peRatio = meta.pdSymbolPe || null;

        return {
          symbol: stock.symbol,
          name: stock.name,
          sector: stock.sector,
          price: price,
          change: change,
          change_percent: changePercent,
          pe_ratio: peRatio,
          roe: stock.roe || null,
          added_date: item.added_date,
        };
      })
    );

    const filteredWatchlist = enrichedWatchlist.filter((item) => item !== null);

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
