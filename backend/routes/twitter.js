/**
 * Routes for X (Twitter) API proxy (tweet export).
 * @module routes/twitter
 * @see {@link docs/API_REFERENCE.md#x-twitter-apis}
 */

const express = require('express');
const router = express.Router();
const { fetchTweetsForDownload } = require('../controllers/twitterController');

router.post('/fetch-tweets', fetchTweetsForDownload);

module.exports = router;
