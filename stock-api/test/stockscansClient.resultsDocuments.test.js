'use strict';

const { StockscansClient } = require('../src/clients/StockscansClient');

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

describe('StockscansClient.resultsDocuments', () => {
  beforeEach(() => {
    process.env.STOCKSCANS_AUTH_TOKEN = 'tok';
  });

  test('defaults to an empty watchlistIds array (unscoped, current behavior preserved)', async () => {
    const http = fakeHttp({ documents: [], total: 0, quarterDate: '202606' });
    const client = new StockscansClient({ http });

    await client.resultsDocuments({ documentType: 'Transcript' });

    expect(http.calls).toHaveLength(1);
    expect(http.calls[0].payload).toEqual({
      scan: { filters: [], index: [], industry: [], watchlistIds: [] },
      offset: 0,
      searchCompany: '',
      documentType: 'Transcript',
    });
  });

  test('passes watchlistIds through to scan.watchlistIds when provided', async () => {
    const http = fakeHttp({ documents: [], total: 0, quarterDate: '202606' });
    const client = new StockscansClient({ http });

    await client.resultsDocuments({ documentType: 'Transcript', watchlistIds: ['wl-123'] });

    expect(http.calls[0].payload.scan.watchlistIds).toEqual(['wl-123']);
  });

  test('hits the correct endpoint with the result-scans referer', async () => {
    const http = fakeHttp({ documents: [], total: 0, quarterDate: '202606' });
    const client = new StockscansClient({ http });

    await client.resultsDocuments({});

    expect(http.calls[0].url).toBe('https://www.stockscans.in/api/company/results/documents');
    expect(http.calls[0].opts.headers.referer).toBe('https://www.stockscans.in/result-scans');
  });
});
