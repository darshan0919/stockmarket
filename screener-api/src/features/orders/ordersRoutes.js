/**
 * Orders routes - thin router mapping endpoints to controller handlers
 * @module routes/orders
 * @see {@link docs/API_REFERENCE.md#orders-apis} for API documentation
 */

const express = require('express');
const router = express.Router();
const {
  getOrders,
  downloadAll,
  downloadDirect,
  getQuarters,
  downloadQuarter,
} = require('./ordersController');

router.get('/:symbol', getOrders);
router.post('/:symbol/download-all', downloadAll);
router.post('/:symbol/download-direct', downloadDirect);
router.get('/:symbol/quarters', getQuarters);
router.post('/:symbol/download-quarter', downloadQuarter);

module.exports = router;
