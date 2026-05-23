const express = require('express');
const router = express.Router();
const {
  getAnnouncements,
  downloadAnnouncements,
  downloadLatestConcalls,
} = require('../controllers/announcementsController');

/**
 * Announcements routes
 * @see {@link docs/API_REFERENCE.md#announcements-apis} for API docs
 */

router.post('/concalls/download', downloadLatestConcalls);
router.get('/:symbol', getAnnouncements);
router.post('/:symbol/download', downloadAnnouncements);

module.exports = router;
