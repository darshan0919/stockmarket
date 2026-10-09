const { stockscans } = require('@stock/api');
const base = {
  scanId: 'x',
  scanName: 't',
  scanDescription: '',
  industry: [],
  index: ['Nifty 500'],
  tags: [],
  watchlistIds: [],
  alertFrequency: null,
};
const run = async (f) => {
  const x = await stockscans.runScan(
    {
      ratiosType: 'Ratios',
      timePeriod: 'Latest',
      scan: { ...base, filters: f },
      watchlistIds: [],
      order: 'desc',
      orderBy: 'Market Capitalization',
      offset: 0,
    },
    ''
  );
  return x.total;
};
(async () => {
  const all = await run([{ left: 'Market Capitalization', sign: '>', right: '0' }]);
  const out = { universe: all };
  for (const m of ['EMA 20D', 'EMA 50D', 'EMA 200D', 'SMA 200D', 'SMA 50D'])
    out['above ' + m] = await run([{ left: 'Close Price', sign: '>', right: m }]);
  out.nearHigh20 = await run([{ left: '52WH Distance', sign: '<', right: '20' }]);
  out.nearHigh5 = await run([{ left: '52WH Distance', sign: '<', right: '5' }]);
  out.date = new Date().toISOString();
  console.log(JSON.stringify(out));
})().catch((e) => console.log('ERR', e.response ? JSON.stringify(e.response.data) : e.message));
