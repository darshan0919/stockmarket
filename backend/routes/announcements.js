const express = require('express');
const router = express.Router();
const { getAnnouncements } = require('../controllers/announcementsController');

/**
 * Announcements routes
 * @see {@link docs/API_REFERENCE.md#announcements-apis} for API docs
 */

router.get('/:symbol', getAnnouncements);

module.exports = router;
