/**
 * @fileoverview Admin controller - HTTP handlers for admin endpoints
 * @module controllers/adminController
 * @see {@link docs/API_REFERENCE.md#admin-apis} for API docs
 */

const ModelResponse = require('../models/ModelResponse');

/**
 * Trigger data update
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @route GET /api/admin/data/update
 * @see {@link docs/API_REFERENCE.md#admin-apis} for API docs
 */
const triggerDataUpdate = async (req, res) => {
  try {
    // This would trigger the data update script
    // For now, return a success message
    res.json({
      success: true,
      message: 'Data update initiated',
      note: 'Run the scripts/updateData.js script manually for now',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Clear AI model cache for order book parsing
 * If symbol provided, clears cache for that symbol only
 * If no symbol, clears all orderbook-related cache
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @route DELETE /api/admin/cache/orderbook/:symbol?
 * @see {@link docs/API_REFERENCE.md#admin-apis} for API docs
 */
const clearOrderbookCache = async (req, res) => {
  try {
    const { symbol } = req.params;

    if (symbol) {
      // Clear cache for specific symbol
      const result = await ModelResponse.deleteMany({
        attachment_name: { $regex: symbol.toUpperCase(), $options: 'i' },
      });

      res.json({
        success: true,
        message: `Cleared ${result.deletedCount} cached responses for ${symbol.toUpperCase()}`,
        deletedCount: result.deletedCount,
      });
    } else {
      // Clear all orderbook-related cache
      const result = await ModelResponse.deleteMany({});

      res.json({
        success: true,
        message: `Cleared all ${result.deletedCount} cached AI responses`,
        deletedCount: result.deletedCount,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = {
  triggerDataUpdate,
  clearOrderbookCache,
};
