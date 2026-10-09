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
const cands = [
  'EMA 10D',
  'EMA 21D',
  'EMA 50D',
  'EMA 20D',
  'SMA 200D',
  'SMA 20D',
  'EMA 150D',
  'EMA 30W',
  'EMA 10W',
  'RSI 14D',
  'RSI',
  'Volume',
  'Volume SMA 20D',
  'Volume SMA 10D',
  'Delivery %',
  'Delivery Percentage',
  'Return 1Y',
  'Returns 1Y',
  'Price Change 1Y',
  '1Y Return',
  '3M Return',
  'Return 3M',
  'High',
  'Low',
  'Open Price',
  'Previous Close',
  'Prev Close',
  '52WH',
  '52 Week High',
  'ATR 14D',
  'Beta',
  'Promoter Holding',
  'Promoter Holdings',
  'Pledged',
  'Sales Growth',
  'PE',
  'P/E',
  'Price To Earnings',
  'Highest Close 52W',
  'Relative Strength',
  'RS',
  'Delivery Volume',
  'Day Change',
  'Change 1D',
  'Percentage Change',
  'Price Change 1D',
  'Volume Change',
  'Bollinger',
  'MACD',
  'Supertrend',
  'ADX 14D',
  'Close Price 1D Ago',
  'Close Price 5D Ago',
  'Close Price 20D Ago',
  'Close Price 252D Ago',
  'SMA 50D * SMA 50D',
  'Volume SMA 50D * SMA 50D',
];
(async () => {
  const ok = [],
    bad = [];
  for (const c of cands) {
    try {
      const x = await stockscans.runScan(
        {
          ratiosType: 'Ratios',
          timePeriod: 'Latest',
          scan: { ...base, filters: [{ left: 'Close Price', sign: '>', right: c }] },
          watchlistIds: [],
          order: 'desc',
          orderBy: 'Market Capitalization',
          offset: 0,
        },
        ''
      );
      ok.push(c + ':' + x.total);
    } catch (e) {
      bad.push(c);
    }
  }
  console.log('OK', ok.join(' | '));
  console.log('BAD', bad.join(' | '));
})();
