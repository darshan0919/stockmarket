/**
 * Unit tests for standalone StockScans announcement-scans page helpers.
 */

const mockScan = jest.fn();
const mockStats = jest.fn();

// Service now delegates HTTP to @stock/api (optionalAuth for the public page endpoints).
jest.mock('@stock/api', () => ({
  stockscans: {
    scanAnnouncements: (...args) => mockScan(...args),
    announcementStatistics: (...args) => mockStats(...args),
  },
  // Public endpoints don't call this; auth-required ones gate on it (no token in tests).
  StockscansAuth: class {
    getToken() {
      throw new Error('STOCKSCANS_AUTH_TOKEN not set');
    }
  },
}));

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
    mockScan.mockResolvedValue({
      announcements: [{ companyId: 'NSE:LT', title: 'Order win', ssUrl: 'x.pdf' }],
      start: 1,
      end: 1,
      total: 1,
      quarterDate: '202606',
    });

    const out = await runAnnouncementScan({
      scan: { searchFilters: ['Order Book'], searchMode: 'full' },
      offset: 0,
      quarterDate: '202606',
    });

    expect(mockScan).toHaveBeenCalledWith(
      expect.objectContaining({
        quarterDate: '202606',
        offset: 0,
        scan: expect.objectContaining({
          searchFilters: ['Order Book'],
          announcementType: 'All',
          searchMode: 'full',
        }),
      }),
      expect.objectContaining({ optionalAuth: true })
    );
    expect(out.announcements).toHaveLength(1);
  });

  it('paginates over StockScans rows until it fills the filtered response page', async () => {
    mockScan.mockImplementation((payload) => {
      if (payload.offset === 0) {
        return Promise.resolve({
          announcements: [
            { companyId: 'NSE:IGNORED', title: 'Board Meeting', ssUrl: 'ignored.pdf' },
            { companyId: 'NSE:KEEP1', title: 'Order win', ssUrl: 'keep1.pdf' },
          ],
          start: 1,
          end: 2,
          total: 4,
          quarterDate: '202606',
        });
      }
      return Promise.resolve({
        announcements: [
          { companyId: 'NSE:KEEP2', title: 'Order win', ssUrl: 'keep2.pdf' },
          { companyId: 'NSE:KEEP3', title: 'Order win', ssUrl: 'keep3.pdf' },
        ],
        start: 3,
        end: 4,
        total: 4,
        quarterDate: '202606',
      });
    });

    const out = await runAnnouncementScan({
      scan: { searchFilters: ['Order'], titleKeywordsToIgnore: ['Board Meeting'] },
      offset: 0,
      quarterDate: '202606',
    });

    expect(mockScan).toHaveBeenCalledTimes(2);
    expect(mockScan.mock.calls.map((call) => call[0].offset)).toEqual([0, 2]);
    expect(mockScan.mock.calls[0][0].scan.titleKeywordsToIgnore).toBeUndefined();
    expect(out.announcements.map((row) => row.companyId)).toEqual([
      'NSE:KEEP1',
      'NSE:KEEP2',
      'NSE:KEEP3',
    ]);
    expect(out.total).toBe(3);
    expect(out.meta.filteringApplied).toBe(true);
  });

  it('recomputes statistics from filtered announcement rows when ignore keywords are present', async () => {
    mockStats.mockResolvedValue({
      keywords: ['Order Book'],
      totalMatches: 3,
      totalCompanies: 2,
      companyData: [
        ['101', 'Keep Ltd', 'NSE:KEEP', [2]],
        ['102', 'Ignored Ltd', 'NSE:IGNORED', [1]],
      ],
    });
    mockScan.mockResolvedValue({
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
    });

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
