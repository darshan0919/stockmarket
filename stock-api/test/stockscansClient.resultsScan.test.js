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

describe('StockscansClient.resultsScan', () => {
  beforeEach(() => {
    process.env.STOCKSCANS_AUTH_TOKEN = 'tok';
  });

  test('hits the migrated scans/result/run path (old company/results/scan 404s)', async () => {
    const http = fakeHttp({ resultTables: [], total: 0 });
    const client = new StockscansClient({ http });

    const payload = {
      scan: { filters: [], index: [], industry: [], watchlistIds: [] },
      order: 'desc',
      orderBy: 'Last Result Date',
      offset: 0,
      resultDate: '2026-09-15',
      searchCompany: '',
      documentType: '',
    };
    await client.resultsScan(payload);

    expect(http.calls).toHaveLength(1);
    expect(http.calls[0].url).toBe('https://www.stockscans.in/api/scans/result/run');
    expect(http.calls[0].payload).toEqual(payload);
    expect(http.calls[0].opts.headers.referer).toBe('https://www.stockscans.in/result-scans');
  });

  test('returns the post-migration resultTables envelope, not the old data.results shape', async () => {
    const FIXTURE = {
      resultTables: [
        {
          companyId: 'NSE:SIRCA',
          metaRatios: { Name: 'Sirca Paints India Ltd', 'Last Result Date': '2026-09-15' },
          resultTable: { C: [], S: null },
          documents: [
            { ssUrl: 'result-abc.pdf', documentType: 'Result', hasNotes: false },
            { ssUrl: 'ppt-def.pdf', documentType: 'PPT', hasNotes: false },
            { ssUrl: 'transcript-ghi.pdf', documentType: 'Transcript', hasNotes: true },
          ],
        },
      ],
      total: 1,
      quarterDate: '202609',
    };
    const http = fakeHttp(FIXTURE);
    const client = new StockscansClient({ http });

    const result = await client.resultsScan({ scan: { filters: [] }, offset: 0 });

    // Confirms the breaking DTO change: no `result.data.results` anymore —
    // the raw client passthrough must expose `resultTables` at the top level.
    expect(result.resultTables).toHaveLength(1);
    expect(result.data).toBeUndefined();
    expect(result.resultTables[0].companyId).toBe('NSE:SIRCA');
    expect(result.resultTables[0].documents.find((d) => d.documentType === 'Transcript').ssUrl).toBe(
      'transcript-ghi.pdf'
    );
  });
});
