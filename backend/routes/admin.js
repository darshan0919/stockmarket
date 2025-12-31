const express = require('express');
const router = express.Router();
const ModelResponse = require('../models/ModelResponse');

/**
 * Trigger data update
 * GET /api/admin/data/update
 */
router.get('/data/update', async (req, res) => {
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
});

/**
 * Clear AI model cache for order book parsing
 * DELETE /api/admin/cache/orderbook/:symbol?
 * If symbol provided, clears cache for that symbol only
 * If no symbol, clears all orderbook-related cache
 */
router.delete('/cache/orderbook/:symbol?', async (req, res) => {
  try {
    const { symbol } = req.params;
    
    if (symbol) {
      // Clear cache for specific symbol
      const result = await ModelResponse.deleteMany({
        attachment_name: { $regex: symbol.toUpperCase(), $options: 'i' }
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
});

module.exports = router;

