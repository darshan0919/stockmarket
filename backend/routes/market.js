const express = require('express');
const router = express.Router();
const { getMarketIndices, getMarketStats } = require('../controllers/marketController');

// Get market indices
router.get('/indices', getMarketIndices);

// Get market stats
router.get('/stats', getMarketStats);

module.exports = router;
