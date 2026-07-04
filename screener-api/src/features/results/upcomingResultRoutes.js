const router = require('express').Router();
const { getUpcomingResults, getUpcomingResultsSymbols } = require('./upcomingResultController');

router.get('/', getUpcomingResults);
router.get('/symbols', getUpcomingResultsSymbols);

module.exports = router;
