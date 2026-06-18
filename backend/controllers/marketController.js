const Stock = require('../models/Stock');
const PriceHistory = require('../models/PriceHistory');
const { getTopGainers } = require('../services/topGainers');

/**
 * Get market indices overview
 * GET /api/market/indices
 */
const getMarketIndices = async (req, res, next) => {
  try {
    // Mock data for market indices - replace with actual data from API
    const indices = {
      nifty50: {
        current: 19200.5,
        change: 125.3,
        change_percent: 0.65,
      },
      sensex: {
        current: 62500.75,
        change: 200.5,
        change_percent: 0.32,
      },
    };

    // Calculate sector performance
    const sectors = await Stock.distinct('sector');
    const sectorPerformance = {};

    for (const sector of sectors) {
      if (!sector || sector === 'Unknown') continue;

      const sectorStocks = await Stock.find({ sector }).limit(10).lean();

      if (sectorStocks.length === 0) continue;

      let totalChange = 0;
      let count = 0;

      for (const stock of sectorStocks) {
        const latestPrice = await PriceHistory.findOne({ stock_id: stock._id })
          .sort({ date: -1 })
          .lean();

        const prevPrice = await PriceHistory.findOne({ stock_id: stock._id })
          .sort({ date: -1 })
          .skip(1)
          .lean();

        if (latestPrice && prevPrice && prevPrice.close !== 0) {
          const changePercent = ((latestPrice.close - prevPrice.close) / prevPrice.close) * 100;
          totalChange += changePercent;
          count++;
        }
      }

      if (count > 0) {
        sectorPerformance[sector] = Number((totalChange / count).toFixed(2));
      }
    }

    res.json({
      success: true,
      data: {
        ...indices,
        sectors: sectorPerformance,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get market statistics
 * GET /api/market/stats
 */
const getMarketStats = async (req, res, next) => {
  try {
    const totalStocks = await Stock.countDocuments();
    const sectors = await Stock.distinct('sector');

    res.json({
      success: true,
      data: {
        total_stocks: totalStocks,
        total_sectors: sectors.filter((s) => s && s !== 'Unknown').length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get top gainers with enriched metrics (price, % day change, volume, value,
 * delivery-to-trade ratio, P/E, 1-week change).
 * GET /api/market/top-gainers?count=20&bucket=allSec&enrich=true
 */
const getTopGainersHandler = async (req, res, next) => {
  try {
    const { count, bucket, exchange } = req.query;
    const enrich = req.query.enrich !== 'false';
    const data = await getTopGainers({ count, bucket, enrich, exchange });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching top gainers:', error.message);
    res.status(502).json({
      success: false,
      error: 'Failed to fetch top gainers from NSE',
      detail: error.message,
    });
  }
};

module.exports = {
  getMarketIndices,
  getMarketStats,
  getTopGainers: getTopGainersHandler,
};
