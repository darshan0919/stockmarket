/**
 * Unit tests for standalone StockScans announcement-scans page helpers.
 */

jest.mock('axios', () => ({
  create: jest.fn(),
}));

jest.mock('../stockscansAuth', () => ({
  createAuthenticatedClient: jest.fn(),
}));

const axios = require('axios');
const {
  DEFAULT_ANNOUNCEMENT_SCAN,
  normalizeScan,
  stripLocalScanFields,
  mapAnnouncement,
  mapAnnouncementScanResponse,
  filterIgnoredAnnouncements,
  runAnnouncementScan,
  fetchAnnouncementStatistics,
} = require('../stockscansAnnouncementScansPage');

describe('stockscansAnnouncementScansPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.STOCKSCANS_AUTH_TOKEN;
  });

  it('normalizes scan shape to the StockScans announcement scan payload', () => {
    const scan = normalizeScan({
      searchFilters: ['Order Book', '', 'Capex'],
      titleKeywordsToIgnore: ['Board Meeting', '', 'board meeting', 'Trading Window'],
      descriptionKeywordsToIgnore: ['Investor Grievance'],
      companyFilters: ['NSE:RELIANCE', { companyId: 'BSE:TCS' }, {}],
      searchMode: 'quick',
      announcementType: 'Presentation',
    });

    expect(scan).toMatchObject({
      scanName: DEFAULT_ANNOUNCEMENT_SCAN.scanName,
      announcementType: 'Presentation',
      searchMode: 'quick',
      searchFilters: ['Order Book', 'Capex'],
      titleKeywordsToIgnore: ['Board Meeting', 'Trading Window'],
      descriptionKeywordsToIgnore: ['Investor Grievance'],
      companyFilters: [{ companyId: 'NSE:RELIANCE' }, { companyId: 'BSE:TCS' }],
    });
  });

  it('strips app-only ignore fields before proxying to StockScans', () => {
    const scan = stripLocalScanFields(
      normalizeScan({
        searchFilters: ['Order Book'],
        titleKeywordsToIgnore: ['Board Meeting'],
        descriptionKeywordsToIgnore: ['Trading Window'],
      })
    );

    expect(scan.searchFilters).toEqual(['Order Book']);
    expect(scan.titleKeywordsToIgnore).toBeUndefined();
    expect(scan.descriptionKeywordsToIgnore).toBeUndefined();
  });

  it('maps StockScans announcement rows with full asset URLs', () => {
    const out = mapAnnouncement({
      companyId: 'NSE:RITES',
      name: 'Rites Ltd',
      title: 'Credit Rating',
      date: '2026-06-27',
      ssUrl: 'rating.pdf',
      snippet: [{ text: '<mark>order</mark> book', pageNumber: 11 }],
    });

    expect(out.symbol).toBe('RITES');
    expect(out.exchange).toBe('NSE');
    expect(out.attachmentUrl).toContain('/rating.pdf');
    expect(out.snippet).toHaveLength(1);
  });

  it('maps paginated scan response metadata', () => {
    const out = mapAnnouncementScanResponse({
      announcements: [{ companyId: 'NSE:LT', title: 'Order win', ssUrl: 'x.pdf' }],
      start: 1,
      end: 30,
      total: 31,
      quarterDate: '202606',
    });

    expect(out.announcements).toHaveLength(1);
    expect(out.end).toBe(30);
    expect(out.total).toBe(31);
    expect(out.quarterDate).toBe('202606');
  });

  it('filters announcements by ignored title and description keywords', () => {
    const out = filterIgnoredAnnouncements(
      [
        mapAnnouncement({
          companyId: 'NSE:A',
          title: 'Board Meeting Outcome',
          description: 'Order book update',
        }),
        mapAnnouncement({
          companyId: 'NSE:B',
          title: 'Order win',
          description: 'Trading window closure',
        }),
        mapAnnouncement({
          companyId: 'NSE:C',
          title: 'Order win',
          description: 'New EPC order',
        }),
      ],
      normalizeScan({
        titleKeywordsToIgnore: ['board meeting'],
        descriptionKeywordsToIgnore: ['trading window'],
      })
    );

    expect(out.map((row) => row.companyId)).toEqual(['NSE:C']);
  });

  it('posts normalized payload to StockScans run API', async () => {
    const post = jest.fn().mockResolvedValue({
      data: {
        announcements: [{ companyId: 'NSE:LT', title: 'Order win', ssUrl: 'x.pdf' }],
        start: 1,
        end: 1,
        total: 1,
        quarterDate: '202606',
      },
    });
    axios.create.mockReturnValue({ post });

    const out = await runAnnouncementScan({
      scan: { searchFilters: ['Order Book'], searchMode: 'full' },
      offset: 0,
      quarterDate: '202606',
    });

    expect(post).toHaveBeenCalledWith(
      'https://www.stockscans.in/api/company/announcements/scan',
      expect.objectContaining({
        quarterDate: '202606',
        offset: 0,
        scan: expect.objectContaining({
          searchFilters: ['Order Book'],
          announcementType: 'All',
          searchMode: 'full',
        }),
      }),
      expect.any(Object)
    );
    expect(out.announcements).toHaveLength(1);
  });

  it('paginates over StockScans rows until it fills the filtered response page', async () => {
    const post = jest.fn((url, payload) => {
      if (payload.offset === 0) {
        return Promise.resolve({
          data: {
            announcements: [
              { companyId: 'NSE:IGNORED', title: 'Board Meeting', ssUrl: 'ignored.pdf' },
              { companyId: 'NSE:KEEP1', title: 'Order win', ssUrl: 'keep1.pdf' },
            ],
            start: 1,
            end: 2,
            total: 4,
            quarterDate: '202606',
          },
        });
      }
      return Promise.resolve({
        data: {
          announcements: [
            { companyId: 'NSE:KEEP2', title: 'Order win', ssUrl: 'keep2.pdf' },
            { companyId: 'NSE:KEEP3', title: 'Order win', ssUrl: 'keep3.pdf' },
          ],
          start: 3,
          end: 4,
          total: 4,
          quarterDate: '202606',
        },
      });
    });
    axios.create.mockReturnValue({ post });

    const out = await runAnnouncementScan({
      scan: { searchFilters: ['Order'], titleKeywordsToIgnore: ['Board Meeting'] },
      offset: 0,
      quarterDate: '202606',
    });

    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls.map((call) => call[1].offset)).toEqual([0, 2]);
    expect(post.mock.calls[0][1].scan.titleKeywordsToIgnore).toBeUndefined();
    expect(out.announcements.map((row) => row.companyId)).toEqual([
      'NSE:KEEP1',
      'NSE:KEEP2',
      'NSE:KEEP3',
    ]);
    expect(out.total).toBe(3);
    expect(out.meta.filteringApplied).toBe(true);
  });

  it('recomputes statistics from filtered announcement rows when ignore keywords are present', async () => {
    const post = jest.fn((url, payload) => {
      if (url.endsWith('/statistics')) {
        return Promise.resolve({
          data: {
            keywords: ['Order Book'],
            totalMatches: 3,
            totalCompanies: 2,
            companyData: [
              ['101', 'Keep Ltd', 'NSE:KEEP', [2]],
              ['102', 'Ignored Ltd', 'NSE:IGNORED', [1]],
            ],
          },
        });
      }
      return Promise.resolve({
        data: {
          announcements: [
            {
              companyId: 'NSE:KEEP',
              name: 'Keep Ltd',
              title: 'Order Book update',
              ssUrl: 'keep.pdf',
            },
            {
              companyId: 'NSE:IGNORED',
              name: 'Ignored Ltd',
              title: 'Board Meeting',
              snippet: [{ text: '<mark>order</mark> <mark>book</mark>' }],
              ssUrl: 'ignored.pdf',
            },
          ],
          start: 1,
          end: 2,
          total: 2,
          quarterDate: '202606',
        },
      });
    });
    axios.create.mockReturnValue({ post });

    const out = await fetchAnnouncementStatistics({
      scan: { searchFilters: ['Order Book'], titleKeywordsToIgnore: ['Board Meeting'] },
      quarterDate: '202606',
    });

    expect(out.totalMatches).toBe(1);
    expect(out.totalCompanies).toBe(1);
    expect(out.companyData).toEqual([['101', 'Keep Ltd', 'NSE:KEEP', [1]]]);
    expect(out.meta.filteringApplied).toBe(true);
  });
});
