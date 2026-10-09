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
(async () => {
  const ok = [];
  for (const c of [
    'Returns 1M',
    'Returns 3M',
    'Returns 6M',
    'Returns 9M',
    'Returns 1Y',
    'Returns 2Y',
    'Returns 1W',
    'Returns 1D',
    'Returns YTD',
  ]) {
    try {
      const x = await stockscans.runScan(
        {
          ratiosType: 'Ratios',
          timePeriod: 'Latest',
          scan: { ...base, filters: [{ left: c, sign: '>', right: '-1000' }] },
          watchlistIds: [],
          order: 'desc',
          orderBy: 'Market Capitalization',
          offset: 0,
        },
        ''
      );
      ok.push(c + ':' + x.total + ' hdr=' + x.table[0].slice(-3).join(','));
    } catch (e) {
      ok.push(c + ':BAD');
    }
  }
  console.log(ok.join('\n'));
})();
