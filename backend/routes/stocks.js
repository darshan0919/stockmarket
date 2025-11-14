const express = require('express');
const router = express.Router();
const {
  searchStocks,
  getStockDetails,
  getStockTechnicals,
  getStockFinancials,
} = require('../controllers/stockController');

// Search stocks
router.get('/search', searchStocks);

// Get stock details
router.get('/:symbol', getStockDetails);

// Get stock technicals
router.get('/:symbol/technicals', getStockTechnicals);

// Get stock financials
router.get('/:symbol/financials', getStockFinancials);

module.exports = router;

