const router = require('express').Router();
const { getUpcomingResults } = require('../controllers/upcomingResult');

router.get('/', getUpcomingResults);

module.exports = router;