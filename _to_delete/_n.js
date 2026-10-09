const { stockscans } = require('@stock/api');
(async () => {
  for (const t of ['NSE:NIFTY', 'NSE:CNX500', 'NSE:NIFTY500', 'NSE:NIFTYBEES']) {
    try {
      const r = await stockscans.ohlcv(t, { tf: '1D' });
      console.log(t, r.prices.length, r.prices[r.prices.length - 1]);
    } catch (e) {
      console.log(t, 'ERR', e.message.slice(0, 60));
    }
  }
})();
