const express = require('express');
const router = express.Router();
const { runScreener } = require('../controllers/screenerController');

// Run screener with filters
router.post('/run', runScreener);

module.exports = router;

