const express = require('express');
const router = express.Router();
const { triggerDataUpdate, clearOrderbookCache } = require('../controllers/adminController');

/**
 * Admin routes
 * @see {@link docs/API_REFERENCE.md#admin-apis} for API docs
 */

router.get('/data/update', triggerDataUpdate);
router.delete('/cache/orderbook/:symbol', clearOrderbookCache);
router.delete('/cache/orderbook', clearOrderbookCache);

module.exports = router;
