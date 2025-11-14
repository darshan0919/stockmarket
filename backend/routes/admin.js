const express = require('express');
const router = express.Router();

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

module.exports = router;

