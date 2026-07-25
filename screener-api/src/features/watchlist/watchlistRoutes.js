const express = require('express');
const router = express.Router();
const { getWatchlist, addToWatchlist, removeFromWatchlist } = require('./watchlistController');

// Get all watchlist items
router.get('/', getWatchlist);

// Add stock to watchlist
router.post('/:symbol', addToWatchlist);

// Remove stock from watchlist
router.delete('/:symbol', removeFromWatchlist);

module.exports = router;
