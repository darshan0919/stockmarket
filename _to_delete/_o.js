const { stockscans } = require('@stock/api');
(async () => {
  const t = Date.now();
  const r = await stockscans.ohlcv('NSE:SONACOMS', { tf: '1D' });
  console.log(
    r.prices.length,
    r.hasMore,
    r.prices[0],
    r.prices[r.prices.length - 1],
    Date.now() - t,
    'ms'
  );
  const w = await stockscans.ohlcv('NSE:SONACOMS', { tf: '1W' });
  console.log('W', w.prices.length, w.prices[w.prices.length - 1]);
})().catch((e) => console.log('ERR', e.message));
