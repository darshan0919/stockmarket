const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * Get company announcements from NSE India
 * GET /api/announcements/:symbol
 */
router.get('/:symbol', async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const { index = 'equities' } = req.query;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: 'Symbol is required',
      });
    }

    const upperSymbol = symbol.toUpperCase();

    const response = await axios.get(`https://www.nseindia.com/api/corporate-announcements`, {
      params: {
        index,
        symbol: upperSymbol,
      },
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      },
      timeout: 15000,
    });

    res.json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    console.error('Error fetching announcements:', error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        error: 'Failed to fetch announcements from NSE India',
        details: error.response.data,
      });
    }

    next(error);
  }
});

module.exports = router;
