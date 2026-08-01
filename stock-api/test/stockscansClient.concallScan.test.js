'use strict';

const { StockscansClient, CONCALL_SCAN_SENTIMENT } = require('../src/clients/StockscansClient');

function fakeHttp(responseData) {
  const calls = [];
  return {
    calls,
    userAgent: 'test-agent',
    async post(url, payload, opts) {
      calls.push({ url, payload, opts });
      return { data: responseData };
    },
  };
}

// Fixture captured from a real `concallScan` call on 2026-08-01 (throwaway
// watchlist of NSE:MUTHOOTFIN / NSE:CLEAN / NSE:TCS / NSE:RELIANCE /
// NSE:BAJFINANCE) — see docs/stockscans-api-schemas.md for the full
// field-by-field decode this fixture is checked against.
const LIVE_FIXTURE = {
  rows: [
    [
      '24769',
      'NSE:MUTHOOTFIN',
      'Muthoot Finance Ltd',
      'Finance & Investments - Gold Loan',
      '2026-08-01T16:00:00+05:30',
      'as-6dfa623c9445593ab0bdab05.pdf',
      1,
      true,
      47.9,
      1,
      ['▼ Yield 20.93% → 17.93%', '▲ Active customers +1.63 lakh', '▲ Belstar Microfinance returns to profit'],
      'l0fyxca960154mtwtev1ok2t.pdf',
    ],
    [
      '3722',
      'NSE:BAJFINANCE',
      'Bajaj Finance Ltd',
      'Conglomerate Backed NBFC',
      '2026-07-30T18:30:00+05:30',
      'as-8ae63089e995515f8a6ad4ec.pdf',
      1,
      true,
      56,
      2,
      ['▲ Gold loan AUM +112%', '● FY27 guidance revision deferred', '▲ Credit costs 1.87% → 1.54%'],
      'qu7ifxpflh34fqrzkr3wlnx9.pdf',
    ],
    [
      '5400',
      'NSE:TCS',
      'Tata Consultancy Services Ltd',
      'IT - Software',
      '2026-07-09T19:00:00+05:30',
      null,
      1,
      true,
      48.9,
      3,
      ['▲ $2.6bn annualized AI revenue', '▲ $800mn SKF mega deal', '▼ Wage hikes → 130bps margin hit'],
      null,
    ],
  ],
  next: null,
  quarter: '202606',
  subscription: 'Premium Plus',
};

describe('StockscansClient.concallScan', () => {
  beforeEach(() => {
    process.env.STOCKSCANS_AUTH_TOKEN = 'tok';
  });

  test('posts to the concall-scan endpoint with the given payload', async () => {
    const http = fakeHttp(LIVE_FIXTURE);
    const client = new StockscansClient({ http });

    const payload = {
      industry: [],
      index: [],
      watchlistIds: ['wl-1'],
      resultTiers: [],
      sentimentTiers: [],
      filters: [],
      q: '',
      offset: 0,
    };
    await client.concallScan(payload);

    expect(http.calls).toHaveLength(1);
    expect(http.calls[0].url).toBe('https://www.stockscans.in/api/company/concall-scan');
    expect(http.calls[0].payload).toEqual(payload);
    expect(http.calls[0].opts.headers.referer).toBe('https://www.stockscans.in/concall-scans');
  });

  test('returns the raw {rows, next, quarter, subscription} envelope untouched', async () => {
    const http = fakeHttp(LIVE_FIXTURE);
    const client = new StockscansClient({ http });

    const result = await client.concallScan({ watchlistIds: ['wl-1'] });

    expect(result).toBe(LIVE_FIXTURE);
    expect(result.rows).toHaveLength(3);
    expect(result.next).toBeNull();
    expect(result.quarter).toBe('202606');
  });

  test('row field positions match the documented schema (companyId, date, score, sentiment, highlights)', async () => {
    const http = fakeHttp(LIVE_FIXTURE);
    const client = new StockscansClient({ http });
    const { rows } = await client.concallScan({ watchlistIds: ['wl-1'] });

    const bajfinance = rows.find((r) => r[1] === 'NSE:BAJFINANCE');
    expect(bajfinance[2]).toBe('Bajaj Finance Ltd');
    expect(bajfinance[4]).toBe('2026-07-30T18:30:00+05:30');
    expect(bajfinance[8]).toBe(56);
    expect(bajfinance[9]).toBe(2);
    expect(CONCALL_SCAN_SENTIMENT[bajfinance[9]]).toBe('Neutral');
    expect(bajfinance[10]).toEqual([
      '▲ Gold loan AUM +112%',
      '● FY27 guidance revision deferred',
      '▲ Credit costs 1.87% → 1.54%',
    ]);

    const tcs = rows.find((r) => r[1] === 'NSE:TCS');
    expect(CONCALL_SCAN_SENTIMENT[tcs[9]]).toBe('Optimistic');
    // index 8 (resultQualityScore) and index 11 (secondary pdf slug) are both
    // legitimately nullable — confirmed live (ABB/Urban Company had null [8],
    // TCS had null [11]).
    expect(tcs[11]).toBeNull();
  });

  test('CONCALL_SCAN_SENTIMENT covers all 5 enum values 0-4', () => {
    expect(CONCALL_SCAN_SENTIMENT).toEqual({
      0: 'Bearish',
      1: 'Cautious',
      2: 'Neutral',
      3: 'Optimistic',
      4: 'Bullish',
    });
  });
});
