/**
 * @fileoverview Admin controller - HTTP handlers for admin endpoints
 * @module controllers/adminController
 * @see {@link docs/API_REFERENCE.md#admin-apis} for API docs
 */

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

module.exports = {
  triggerDataUpdate,
};
