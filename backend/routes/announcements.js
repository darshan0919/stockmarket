const express = require('express');
const router = express.Router();
const {
  getAnnouncements,
  downloadAnnouncements,
} = require('../controllers/announcementsController');

/**
 * Announcements routes
 * @see {@link docs/API_REFERENCE.md#announcements-apis} for API docs
 */

router.get('/:symbol', getAnnouncements);
router.post('/:symbol/download', downloadAnnouncements);

module.exports = router;
