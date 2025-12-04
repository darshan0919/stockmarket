const express = require('express');
const router = express.Router();
const {
  searchStocks,
  getStockDetails,
  getStockTechnicals,
  getStockFinancials,
  getQuarterlyResults,
  getOrderBook,
} = require('../controllers/stockController');

// Search stocks
router.get('/search', searchStocks);

// Get stock details
router.get('/:symbol', getStockDetails);

// Get stock technicals
router.get('/:symbol/technicals', getStockTechnicals);

// Get stock financials
router.get('/:symbol/financials', getStockFinancials);

// Get quarterly results
router.get('/:symbol/quarterly', getQuarterlyResults);

// Get order book
router.get('/:symbol/orderbook', getOrderBook);

module.exports = router;

