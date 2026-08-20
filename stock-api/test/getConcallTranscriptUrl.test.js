'use strict';

const {
  ConcallTranscriptResolver,
  toDocumentUrl,
} = require('../bin/get-concall-transcript-url.js');

/** Minimal fake StockscansClient — only the methods the resolver calls. */
function fakeClient(overrides = {}) {
  const calls = {
    documents: [],
    resultsDocuments: [],
    scanAnnouncements: [],
    createWatchlist: [],
    deleteWatchlist: [],
  };
  return {
    calls,
    async documents(companyId) {
      calls.documents.push(companyId);
      return overrides.documents ? overrides.documents(companyId) : { documents: [] };
    },
    async resultsDocuments(opts) {
      calls.resultsDocuments.push(opts);
      return overrides.resultsDocuments
        ? overrides.resultsDocuments(opts)
        : { documents: [], total: 0, quarterDate: '202606' };
    },
    async scanAnnouncements(payload) {
      calls.scanAnnouncements.push(payload);
      return overrides.scanAnnouncements
        ? overrides.scanAnnouncements(payload)
        : { announcements: [], total: 0 };
    },
    async createWatchlist(name, companyIds) {
      calls.createWatchlist.push({ name, companyIds });
      return { watchlistId: 'wl-123', watchlistName: name, companyIds };
    },
    async deleteWatchlist(watchlistId) {
      calls.deleteWatchlist.push(watchlistId);
      return {};
    },
  };
}

describe('toDocumentUrl', () => {
  test('builds the stockscans document URL from an ssUrl', () => {
    expect(toDocumentUrl('abc123')).toBe('https://www.stockscans.in/document/abc123');
  });

  test('returns null for falsy ssUrl', () => {
    expect(toDocumentUrl(null)).toBeNull();
    expect(toDocumentUrl(undefined)).toBeNull();
    expect(toDocumentUrl('')).toBeNull();
  });
});

describe('ConcallTranscriptResolver.singleCompanyQuarter (scenario 1)', () => {
  test('finds the Transcript document matching the requested quarter', async () => {
    const client = fakeClient({
      documents: () => ({
        documents: [
          { documentType: 'Result', date: '202606', ssUrl: 'result-ss' },
          { documentType: 'Transcript', date: '202603', ssUrl: 'old-transcript-ss' },
          { documentType: 'Transcript', date: '202606', ssUrl: 'transcript-ss' },
        ],
      }),
    });
    const resolver = new ConcallTranscriptResolver({ client });

    const result = await resolver.singleCompanyQuarter('NSE:STLTECH', '202606');

    expect(client.calls.documents).toEqual(['NSE:STLTECH']);
    expect(result).toEqual({
      companyId: 'NSE:STLTECH',
      quarter: '202606',
      ssUrl: 'transcript-ss',
      documentUrl: 'https://www.stockscans.in/document/transcript-ss',
    });
  });

  test('returns an error when no Transcript exists for that quarter', async () => {
    const client = fakeClient({
      documents: () => ({
        documents: [{ documentType: 'Transcript', date: '202603', ssUrl: 'old-ss' }],
      }),
    });
    const resolver = new ConcallTranscriptResolver({ client });

    const result = await resolver.singleCompanyQuarter('NSE:STLTECH', '202606');

    expect(result).toEqual({
      companyId: 'NSE:STLTECH',
      quarter: '202606',
      error: 'no Transcript document found for this quarter',
    });
  });

  test('with no quarter given, matches any Transcript document (first hit)', async () => {
    const client = fakeClient({
      documents: () => ({
        documents: [{ documentType: 'Transcript', date: '202606', ssUrl: 'only-ss' }],
      }),
    });
    const resolver = new ConcallTranscriptResolver({ client });

    const result = await resolver.singleCompanyQuarter('NSE:STLTECH');

    expect(result.ssUrl).toBe('only-ss');
  });
});

describe('ConcallTranscriptResolver.multiCompanyLatestQuarter (scenario 2)', () => {
  test('creates a throwaway watchlist, filters by Transcript, and deletes the watchlist', async () => {
    const client = fakeClient({
      resultsDocuments: () => ({
        documents: [
          { companyId: 'NSE:A', transcriptSsUrl: 'a-ss' },
          { companyId: 'NSE:B', transcriptSsUrl: 'b-ss' },
        ],
        total: 2,
        quarterDate: '202606',
      }),
    });
    const resolver = new ConcallTranscriptResolver({ client });

    const results = await resolver.multiCompanyLatestQuarter(['NSE:A', 'NSE:B', 'NSE:C']);

    // watchlist lifecycle
    expect(client.calls.createWatchlist).toHaveLength(1);
    expect(client.calls.createWatchlist[0].companyIds).toEqual(['NSE:A', 'NSE:B', 'NSE:C']);
    expect(client.calls.deleteWatchlist).toEqual(['wl-123']);

    // request scoping
    expect(client.calls.resultsDocuments[0]).toMatchObject({
      documentType: 'Transcript',
      watchlistIds: ['wl-123'],
    });

    expect(results).toEqual([
      {
        companyId: 'NSE:A',
        quarter: '202606',
        ssUrl: 'a-ss',
        documentUrl: 'https://www.stockscans.in/document/a-ss',
      },
      {
        companyId: 'NSE:B',
        quarter: '202606',
        ssUrl: 'b-ss',
        documentUrl: 'https://www.stockscans.in/document/b-ss',
      },
      { companyId: 'NSE:C', quarter: '202606', error: 'no Transcript filed yet this quarter' },
    ]);
  });

  test('paginates until total is covered', async () => {
    let calls = 0;
    const client = fakeClient({
      resultsDocuments: ({ offset }) => {
        calls += 1;
        if (offset === 0) {
          return {
            documents: [{ companyId: 'NSE:A', transcriptSsUrl: 'a-ss' }],
            total: 2,
            quarterDate: '202606',
          };
        }
        return {
          documents: [{ companyId: 'NSE:B', transcriptSsUrl: 'b-ss' }],
          total: 2,
          quarterDate: '202606',
        };
      },
    });
    const resolver = new ConcallTranscriptResolver({ client });

    const results = await resolver.multiCompanyLatestQuarter(['NSE:A', 'NSE:B']);

    expect(calls).toBe(2);
    expect(results.every((r) => r.ssUrl)).toBe(true);
  });

  test('still deletes the throwaway watchlist if resultsDocuments throws', async () => {
    const client = fakeClient({
      resultsDocuments: () => {
        throw new Error('boom');
      },
    });
    const resolver = new ConcallTranscriptResolver({ client });

    await expect(resolver.multiCompanyLatestQuarter(['NSE:A'])).rejects.toThrow('boom');
    expect(client.calls.deleteWatchlist).toEqual(['wl-123']);
  });
});

describe('ConcallTranscriptResolver.multiCompanyHistoricalQuarter (scenario 3)', () => {
  test('sends the corrected scanAnnouncements payload shape (top-level quarterDate, no documentType)', async () => {
    const client = fakeClient({
      scanAnnouncements: () => ({ announcements: [], total: 0 }),
    });
    const resolver = new ConcallTranscriptResolver({ client });

    await resolver.multiCompanyHistoricalQuarter(['NSE:A'], 'Q1FY27');

    expect(client.calls.scanAnnouncements).toHaveLength(1);
    const payload = client.calls.scanAnnouncements[0];

    // quarterDate is top-level, not nested in `scan`, and derived from the
    // Q1FY27 -> yyyymm conversion (Apr-Jun end month = 06, fiscal year 2027
    // ends calendar 2026 for Q1 => "202606").
    expect(payload.quarterDate).toBe('202606');
    expect(payload.scan.quarterDate).toBeUndefined();

    // must NOT send a documentType filter inside scan (confirmed live: this
    // endpoint has no such field) — filtering happens on the ssUrl in the response.
    expect(payload.scan.documentType).toBeUndefined();
    expect(payload.documentType).toBeUndefined();

    // required scan sub-fields per the confirmed live payload
    expect(payload.scan).toMatchObject({
      filters: [],
      index: [],
      industry: [],
      watchlistIds: ['wl-123'],
      searchFilters: [],
      announcementType: 'Earnings Call',
      alerts: false,
      searchMode: 'full',
      companyIds: [],
      companyFilters: [],
    });
  });

  test('accepts a raw YYYYMM quarter string unchanged', async () => {
    const client = fakeClient({ scanAnnouncements: () => ({ announcements: [], total: 0 }) });
    const resolver = new ConcallTranscriptResolver({ client });

    await resolver.multiCompanyHistoricalQuarter(['NSE:A'], '202609');

    expect(client.calls.scanAnnouncements[0].quarterDate).toBe('202609');
  });

  test('resolves ssUrl per company from the announcements response and reports misses', async () => {
    const client = fakeClient({
      scanAnnouncements: () => ({
        announcements: [
          { companyId: 'NSE:A', ssUrl: 'a-ss' },
          { companyId: 'NSE:B', transcriptSsUrl: 'b-ss' },
        ],
        total: 2,
      }),
    });
    const resolver = new ConcallTranscriptResolver({ client });

    const results = await resolver.multiCompanyHistoricalQuarter(
      ['NSE:A', 'NSE:B', 'NSE:C'],
      '202606'
    );

    expect(results).toEqual([
      {
        companyId: 'NSE:A',
        quarter: '202606',
        ssUrl: 'a-ss',
        documentUrl: 'https://www.stockscans.in/document/a-ss',
      },
      {
        companyId: 'NSE:B',
        quarter: '202606',
        ssUrl: 'b-ss',
        documentUrl: 'https://www.stockscans.in/document/b-ss',
      },
      {
        companyId: 'NSE:C',
        quarter: '202606',
        error: 'no Earnings Call transcript found for this quarter',
      },
    ]);
    expect(client.calls.deleteWatchlist).toEqual(['wl-123']);
  });

  test('paginates scanAnnouncements until total is covered', async () => {
    let calls = 0;
    const client = fakeClient({
      scanAnnouncements: ({ offset }) => {
        calls += 1;
        if (offset === 0) {
          return { announcements: [{ companyId: 'NSE:A', ssUrl: 'a-ss' }], total: 2 };
        }
        return { announcements: [{ companyId: 'NSE:B', ssUrl: 'b-ss' }], total: 2 };
      },
    });
    const resolver = new ConcallTranscriptResolver({ client });

    const results = await resolver.multiCompanyHistoricalQuarter(['NSE:A', 'NSE:B'], '202606');

    expect(calls).toBe(2);
    expect(results.every((r) => r.ssUrl)).toBe(true);
  });
});
