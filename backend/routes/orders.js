/**
 * Orders routes - thin router mapping endpoints to controller handlers
 * @module routes/orders
 * @see {@link docs/API_REFERENCE.md#orders-apis} for API documentation
 */

const express = require('express');
const router = express.Router();
const {
  getOrders,
  parsePdf,
  getFullOrders,
  getOrderbook,
  downloadAll,
  downloadDirect,
  getQuarters,
  downloadQuarter,
} = require('../controllers/ordersController');

router.get('/:symbol', getOrders);
router.post('/:symbol/parse-pdf', parsePdf);
router.get('/:symbol/full', getFullOrders);
router.get('/:symbol/orderbook', getOrderbook);
router.post('/:symbol/download-all', downloadAll);
router.post('/:symbol/download-direct', downloadDirect);
router.get('/:symbol/quarters', getQuarters);
router.post('/:symbol/download-quarter', downloadQuarter);

module.exports = router;
