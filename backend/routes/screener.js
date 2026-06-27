const express = require('express');
const router = express.Router();
const { runScreener, getSavedScans, runSavedScan } = require('../controllers/screenerController');

// Legacy: run screener with manual filters
router.post('/run', runScreener);

// List the user's saved StockScans scans
router.get('/saved-scans', getSavedScans);

// Run a saved scan and enrich with live NSE data
router.post('/run-scan', runSavedScan);

module.exports = router;
