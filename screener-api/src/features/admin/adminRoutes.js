const express = require('express');
const router = express.Router();
const { triggerDataUpdate } = require('./adminController');

/**
 * Admin routes
 * @see {@link docs/API_REFERENCE.md#admin-apis} for API docs
 */

router.get('/data/update', triggerDataUpdate);

module.exports = router;
