const { nse } = require('./src');
(async () => {
  try {
    const r = await nse.session.get('/fiidiiTradeReact', {
      referer: 'https://www.nseindia.com/reports/fii-dii',
      timeout: 20000,
    });
    console.log('NSE fiidii', JSON.stringify(r.data).slice(0, 600));
  } catch (e) {
    console.log('NSE ERR', e.response && e.response.status, e.message);
  }
})();
