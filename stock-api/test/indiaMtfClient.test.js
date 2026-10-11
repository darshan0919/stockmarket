'use strict';

const {
  parseScripwiseCsv,
  parseLatestDate,
  parseHumanDate,
  IndiaMtfClient,
} = require('../src/clients/IndiaMtfClient');

const CSV =
  'symbol,isin,name,nse_cr,bse_cr,combined_cr,nse_qty,bse_qty,rank,pct_of_book,src\n' +
  'HDFCBANK,INE040A01034,Hdfc Bank Ltd,3245.2,141.6,3386.8,42372653,1892874,1,2.155,N+B\n' +
  'ZERO,INE000000000,Zero Ltd,0,0,0,0,0,2,0,N\n' +
  'BAD,INE1,"Odd, Name",1,1,2,1,1,3,0.1,N\n';

test('parseScripwiseCsv sums NSE+BSE qty, drops empty and malformed rows', () => {
  const rows = parseScripwiseCsv(CSV);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    symbol: 'HDFCBANK',
    qty: 44265527,
    combinedCr: 3386.8,
    src: 'N+B',
  });
});

test('parseHumanDate / parseLatestDate use the older exchange date', () => {
  expect(parseHumanDate('08 Oct 2026')).toBe('2026-10-08');
  expect(parseLatestDate({ status: { nse_date: '08 Oct 2026', bse_date: '07 Oct 2026' } })).toBe(
    '2026-10-07'
  );
  expect(parseLatestDate({})).toBeNull();
});

test('scripwiseDaily returns null on 404', async () => {
  const http = {
    get: async () => {
      const e = new Error('nf');
      e.response = { status: 404 };
      throw e;
    },
  };
  expect(await new IndiaMtfClient({ http }).scripwiseDaily('2026-01-01')).toBeNull();
});
