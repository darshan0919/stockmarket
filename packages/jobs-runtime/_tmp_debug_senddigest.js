process.env.STOCKMARKET_JOB_NAME = 'post-close-scan-insights-adhoc-nightly';
const { loadEnv } = require('./lib/env');
loadEnv();
const { stockscans } = require('@stock/api');
const { syncAnnouncementSignalsWatchlist } = require('./lib/announcementSignalsWatchlistTtl.js');
(async () => {
  const t0 = Date.now();
  console.log('starting syncAnnouncementSignalsWatchlist at', new Date().toISOString());
  try {
    const res = await syncAnnouncementSignalsWatchlist(
      [{ companyId: 'NSE:ACMESOLAR', signalScore: 44 }],
      { runDate: new Date(), client: stockscans, creator: 'post-close-scan-insights' }
    );
    console.log('done in', Date.now() - t0, 'ms', JSON.stringify(res));
  } catch (e) {
    console.log('ERROR after', Date.now() - t0, 'ms:', e.message, e.stack);
  }
  process.exit(0);
})();
