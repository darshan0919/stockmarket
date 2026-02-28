/**
 * @fileoverview Announcements controller - HTTP handler for NSE corporate announcements
 * @module controllers/announcementsController
 * @see {@link docs/API_REFERENCE.md#announcements-apis} for API docs
 */

const axios = require('axios');
const { NSE_HEADERS } = require('../utils/nseHelpers');

/**
 * Get company announcements from NSE India
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 * @route GET /api/announcements/:symbol
 * @see {@link docs/API_REFERENCE.md#announcements-apis} for API docs
 */
const getAnnouncements = async (req, res, next) => {
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
      headers: NSE_HEADERS,
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
};

module.exports = {
  getAnnouncements,
};
