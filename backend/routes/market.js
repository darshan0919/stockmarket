const express = require('express');
const router = express.Router();
const {
  getMarketIndices,
  getMarketStats,
  getTopGainers,
} = require('../controllers/marketController');

// Get market indices
router.get('/indices', getMarketIndices);

// Get market stats
router.get('/stats', getMarketStats);

// Get top gainers table
router.get('/top-gainers', getTopGainers);

module.exports = router;
