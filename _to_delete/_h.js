const { stockscans } = require('@stock/api');
(async () => {
  const scan = {
    scanId: 'x',
    scanName: 't',
    scanDescription: '',
    industry: [],
    index: [],
    tags: [],
    watchlistIds: [],
    alertFrequency: null,
    filters: [
      { left: 'Market Capitalization', sign: '>=', right: '500' },
      { left: 'Volume SMA 20D * SMA 20D', sign: '>=', right: '70000000' },
      { left: 'Returns 3M', sign: '>', right: '-100' },
      { left: 'Returns 6M', sign: '>', right: '-100' },
      { left: 'Returns 1Y', sign: '>', right: '-100' },
      { left: 'Close Price', sign: '>', right: 'EMA 200D' },
      { left: '52WH Distance', sign: '<=', right: '20' },
    ],
  };
  const d = await stockscans.runScan(
    {
      ratiosType: 'Ratios',
      timePeriod: 'Latest',
      scan,
      watchlistIds: [],
      order: 'desc',
      orderBy: 'Market Capitalization',
      offset: 0,
    },
    ''
  );
  console.log(d.total, JSON.stringify(d.table.slice(0, 3)));
})().catch((e) => console.log('ERR', e.message));
