const { stockscans } = require('@stock/api');
(async () => {
  const r = await stockscans.watchlistsList({ view: 'names' });
  const s = JSON.stringify(r);
  const i = s.indexOf('838b3f7e');
  console.log(s.slice(Math.max(0, i - 200), i + 400));
})().catch((e) => console.log('ERR', e.message));
