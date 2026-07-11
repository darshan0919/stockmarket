'use strict';

const { StockscansClient } = require('../src/clients/StockscansClient');

describe('StockscansClient.ohlcv', () => {
  function fakeHttp(responseData) {
    const calls = [];
    return {
      calls,
      userAgent: 'test-agent',
      async get(url, opts) {
        calls.push({ url, opts });
        return { data: responseData };
      },
    };
  }

  test('requests the ohlcv endpoint with tf param and encoded ticker', async () => {
    const http = fakeHttp({ companyId: 'NSE:ELECON', prices: [], hasMore: false });
    process.env.STOCKSCANS_AUTH_TOKEN = 'tok';
    const client = new StockscansClient({ http });

    const data = await client.ohlcv('NSE:ELECON');

    expect(http.calls).toHaveLength(1);
    expect(http.calls[0].url).toBe('https://www.stockscans.in/api/company/ohlcv/NSE%3AELECON');
    expect(http.calls[0].opts.params).toEqual({ tf: '1m' });
    expect(http.calls[0].opts.headers.cookie).toBe('authtoken=tok');
    expect(http.calls[0].opts.headers.referer).toBe('https://www.stockscans.in/charts/NSE%3AELECON');
    expect(data.companyId).toBe('NSE:ELECON');
  });

  test('passes through tf and before for pagination', async () => {
    const http = fakeHttp({ prices: [], hasMore: true });
    process.env.STOCKSCANS_AUTH_TOKEN = 'tok';
    const client = new StockscansClient({ http });

    await client.ohlcv('NSE:ELECON', { tf: '5m', before: '2026-07-03T10:23:00' });

    expect(http.calls[0].opts.params).toEqual({ tf: '5m', before: '2026-07-03T10:23:00' });
  });
});
