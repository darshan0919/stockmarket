'use strict';

const { StockscansClient } = require('../src/clients/StockscansClient');

function fakeHttp(responseData = {}) {
  const calls = [];
  return {
    calls,
    userAgent: 'test-agent',
    async get(url, opts) {
      calls.push({ method: 'get', url, opts });
      return { data: responseData };
    },
    async post(url, payload, opts) {
      calls.push({ method: 'post', url, payload, opts });
      return { data: responseData };
    },
  };
}

describe('StockscansClient companyId sanitization', () => {
  beforeEach(() => {
    process.env.STOCKSCANS_AUTH_TOKEN = 'tok';
  });

  test('documents() strips a series suffix before building the URL', async () => {
    const http = fakeHttp({ documents: [] });
    const client = new StockscansClient({ http });

    await client.documents('NSE:SOMECO-BE');

    expect(http.calls[0].url).toBe('https://www.stockscans.in/api/company/documents/NSE:SOMECO');
  });

  test('growthCatalysts() and businessOverview() strip the suffix', async () => {
    const http = fakeHttp({});
    const client = new StockscansClient({ http });

    await client.growthCatalysts('NSE:SOMECO-SM');
    await client.businessOverview('NSE:SOMECO-BZ');

    expect(http.calls[0].url).toContain('NSE%3ASOMECO');
    expect(http.calls[0].url).not.toContain('BE');
    expect(http.calls[1].url).toContain('NSE%3ASOMECO');
  });

  test('createWatchlist() sanitizes every companyId in the array', async () => {
    const http = fakeHttp({ watchlistId: 'wl1', watchlistName: 'x', companyIds: [] });
    const client = new StockscansClient({ http });

    await client.createWatchlist('test', ['NSE:A-BE', 'NSE:B', 'NSE:C-SM']);

    expect(http.calls[0].payload.companyIds).toEqual(['NSE:A', 'NSE:B', 'NSE:C']);
  });

  test('cardDetails() sanitizes a single companyId or an array', async () => {
    const http = fakeHttp({});
    const client = new StockscansClient({ http });

    await client.cardDetails('NSE:A-BE');
    expect(http.calls[0].payload.companyIds).toEqual(['NSE:A']);

    await client.cardDetails(['NSE:A-BE', 'NSE:B-ST']);
    expect(http.calls[1].payload.companyIds).toEqual(['NSE:A', 'NSE:B']);
  });

  test('prices() and ohlcv() strip the suffix from the ticker', async () => {
    const http = fakeHttp({});
    const client = new StockscansClient({ http });

    await client.prices('NSE:SOMECO-BE');
    expect(http.calls[0].url).toContain('NSE%3ASOMECO');
    expect(http.calls[0].url).not.toMatch(/BE$/);

    await client.ohlcv('NSE:SOMECO-SM');
    expect(http.calls[1].url).toContain('NSE%3ASOMECO');
  });
});
