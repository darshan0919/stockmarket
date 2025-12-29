const router = require('express').Router();
const { getUpcomingResults, getUpcomingResultsSymbols } = require('../controllers/upcomingResult');

router.get('/', getUpcomingResults);
router.get('/symbols', getUpcomingResultsSymbols);

module.exports = router;