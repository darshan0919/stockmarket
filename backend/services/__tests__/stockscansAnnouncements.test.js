/**
 * Unit tests for StockScans announcements mapper
 * @file backend/services/__tests__/stockscansAnnouncements.test.js
 * @see {@link docs/API_REFERENCE.md#announcements-apis}
 */

const mockPost = jest.fn();

jest.mock('../stockscansAuth', () => ({
  getAuthToken: () => 'test-token',
  createAuthenticatedClient: () => ({
    post: (...args) => mockPost(...args),
  }),
}));

const {
  mapStockScansAnnouncement,
  stripHtml,
  ymdToNseDisplay,
  DEFAULT_ANNOUNCEMENT_SEARCH,
  MIN_SEARCH_LENGTH,
  searchCompanyAnnouncements,
} = require('../stockscansAnnouncements');

describe('stockscansAnnouncements', () => {
  describe('stripHtml', () => {
    it('strips tags and collapses whitespace', () => {
      expect(stripHtml('<a href="#">Click</a> here')).toBe('Click here');
      expect(stripHtml('')).toBe('');
    });
  });

  describe('ymdToNseDisplay', () => {
    it('formats YYYY-MM-DD to NSE-style date string', () => {
      expect(ymdToNseDisplay('2025-01-31')).toBe('31-Jan-2025 00:00:00');
    });
  });

  describe('mapStockScansAnnouncement', () => {
    it('maps API row to UI shape with S3 PDF URL', () => {
      const row = {
        title: 'Board Meeting',
        description: '<p>Notice</p>',
        date: '2025-03-01',
        ssUrl: 'abc.pdf',
        companyId: 'NSE:TEST',
        createdAt: '2025-03-01T00:00:00',
      };
      const out = mapStockScansAnnouncement(row);
      expect(out.subject).toBe('Board Meeting');
      expect(out.desc).toBe('Notice');
      expect(out.an_dt).toBe('1-Mar-2025 00:00:00');
      expect(out.attchmntFile).toContain('stockscans-assets.s3.ap-south-1.amazonaws.com');
      expect(out.attchmntFile).toContain('abc.pdf');
      expect(out.source).toBe('stockscans');
    });

    it('handles missing attachment', () => {
      const out = mapStockScansAnnouncement({
        title: 'X',
        description: 'Y',
        date: '2024-06-15',
        ssUrl: null,
        companyId: 'NSE:TEST',
      });
      expect(out.attchmntFile).toBeNull();
    });

    it('returns null for invalid rows (filtered out upstream)', () => {
      expect(mapStockScansAnnouncement(null)).toBeNull();
      expect(mapStockScansAnnouncement(undefined)).toBeNull();
    });
  });

  it('exports constants', () => {
    expect(DEFAULT_ANNOUNCEMENT_SEARCH.length).toBeGreaterThanOrEqual(MIN_SEARCH_LENGTH);
  });

  describe('searchCompanyAnnouncements', () => {
    beforeEach(() => {
      mockPost.mockReset();
    });

    it('maps HTTP 500 Internal error to STOCKSCANS_BAD_COMPANY', async () => {
      mockPost.mockRejectedValue({
        response: { status: 500, data: { message: 'Internal error occurred' } },
      });
      await expect(
        searchCompanyAnnouncements({ companyId: 'NSE:NOTREAL', search: 'x', offset: 0 })
      ).rejects.toMatchObject({
        code: 'STOCKSCANS_BAD_COMPANY',
        status: 500,
      });
    });

    it('keeps STOCKSCANS_HTTP_ERROR when upstream returns a specific 500 message', async () => {
      mockPost.mockRejectedValue({
        response: { status: 500, data: { message: 'Scheduled maintenance' } },
      });
      await expect(
        searchCompanyAnnouncements({ companyId: 'NSE:RELIANCE', search: 'rep', offset: 0 })
      ).rejects.toMatchObject({
        code: 'STOCKSCANS_HTTP_ERROR',
        status: 500,
      });
    });
  });
});
