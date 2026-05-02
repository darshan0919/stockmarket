const express = require('express');
const router = express.Router();
const {
  searchStocks,
  getStockDetails,
  getStockTechnicals,
  getStockFinancials,
  getQuarterlyResults,
  getDeliveryVolume,
} = require('../controllers/stockController');
const {
  headResearchDashboard,
  getResearchDashboard,
  postResearchDashboard,
  deleteResearchDashboard,
} = require('../controllers/researchDashboardController');

// Search stocks
router.get('/search', searchStocks);

// Institutional research dashboard HTML (uploaded)
router.head('/:symbol/research-dashboard', headResearchDashboard);
router.get('/:symbol/research-dashboard', getResearchDashboard);
router.post('/:symbol/research-dashboard', postResearchDashboard);
router.delete('/:symbol/research-dashboard', deleteResearchDashboard);

// Get stock details
router.get('/:symbol', getStockDetails);

// Get stock technicals
router.get('/:symbol/technicals', getStockTechnicals);

// Get stock financials
router.get('/:symbol/financials', getStockFinancials);

// Get quarterly results
router.get('/:symbol/quarterly', getQuarterlyResults);

// Get OHLC + delivery volume time series (proxies NSE historicalOR)
router.get('/:symbol/delivery-volume', getDeliveryVolume);

module.exports = router;
