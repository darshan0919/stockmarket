/**
 * Routes for declared quarterly results
 * @module routes/declaredResults
 * @see {@link docs/API_REFERENCE.md#declared-results-apis} for API docs
 */

const express = require('express');
const router = express.Router();
const {
  getDeclaredResults,
  getFilterOptions,
  downloadTranscriptNotes,
} = require('../controllers/declaredResultsController');

/**
 * POST /api/declared-results
 * Get declared quarterly results with filters
 */
router.post('/', getDeclaredResults);

/**
 * GET /api/declared-results/filters
 * Get available filter options
 */
router.get('/filters', getFilterOptions);

/**
 * POST /api/declared-results/download-notes
 * Download transcript notes for all results in current quarter
 */
router.post('/download-notes', downloadTranscriptNotes);

module.exports = router;
