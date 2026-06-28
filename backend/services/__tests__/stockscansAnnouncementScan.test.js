/**
 * Unit tests for StockScans announcement scan helpers
 * @file backend/services/__tests__/stockscansAnnouncementScan.test.js
 * @see docs/API_REFERENCE.md#download-latest-concall-transcripts-zip
 */

const {
  MAX_ANNOUNCEMENT_SCAN_COMPANY_FILTERS,
  currentQuarterDate,
  previousQuarterDate,
  parseCompanyIdInput,
  chunkCompanyIds,
  mapScanAnnouncement,
  scanEarningsCalls,
  resolveLatestEarningsCalls,
} = require('../stockscansAnnouncementScan');

const mockScan = jest.fn();

// Service now delegates the HTTP to @stock/api; auth stays mocked to a valid token.
jest.mock('@stock/api', () => ({
  stockscans: { scanAnnouncements: (...args) => mockScan(...args) },
}));
jest.mock('../stockscansAuth', () => ({
  getAuthToken: jest.fn(() => 'test-token'),
}));

describe('stockscansAnnouncementScan', () => {
  describe('parseCompanyIdInput', () => {
    it('splits comma, space, and newline separated ids', () => {
      expect(parseCompanyIdInput('NSE:RELIANCE, TCS\nINFY')).toEqual([
        'NSE:RELIANCE',
        'NSE:TCS',
        'NSE:INFY',
      ]);
    });

    it('dedupes while preserving order', () => {
      expect(parseCompanyIdInput('RELIANCE RELIANCE, reliance')).toEqual(['NSE:RELIANCE']);
    });
  });

  describe('previousQuarterDate', () => {
    it('steps back from March to December prior year', () => {
      expect(previousQuarterDate('202603')).toBe('202512');
    });

    it('steps back within same year', () => {
      expect(previousQuarterDate('202609')).toBe('202606');
    });
  });

  describe('mapScanAnnouncement', () => {
    it('builds S3 download URL from ssUrl', () => {
      const out = mapScanAnnouncement({
        companyId: 'NSE:AZAD',
        name: 'Azad Engineering Ltd',
        title: 'Earnings Call Transcript',
        date: '2026-02-20',
        ssUrl: 'abc.pdf',
      });
      expect(out.symbol).toBe('AZAD');
      expect(out.attchmntFile).toContain('abc.pdf');
      expect(out.an_dt).toContain('Feb-2026');
    });
  });

  describe('scanEarningsCalls', () => {
    beforeEach(() => {
      mockScan.mockReset();
    });

    it('posts companyFilters to scan API', async () => {
      mockScan.mockResolvedValue({
        announcements: [
          {
            companyId: 'NSE:RELIANCE',
            name: 'Reliance',
            title: 'Transcript',
            date: '2026-01-18',
            ssUrl: 'x.pdf',
          },
        ],
        total: 1,
        quarterDate: '202603',
      });

      const { announcements, meta } = await scanEarningsCalls({
        companyIds: ['NSE:RELIANCE'],
        quarterDate: '202603',
      });

      expect(mockScan).toHaveBeenCalledWith(
        expect.objectContaining({
          quarterDate: '202603',
          scan: expect.objectContaining({
            announcementType: 'Earnings Call',
            companyFilters: [{ companyId: 'NSE:RELIANCE' }],
          }),
        }),
        expect.objectContaining({ referer: expect.any(String) })
      );
      expect(announcements).toHaveLength(1);
      expect(meta.total).toBe(1);
    });

    it('throws when no company ids', async () => {
      await expect(
        scanEarningsCalls({ companyIds: [], quarterDate: '202603' })
      ).rejects.toMatchObject({ code: 'COMPANY_IDS_REQUIRED' });
    });

    it('batches companyFilters when more than 10 companies', async () => {
      const ids = Array.from({ length: 12 }, (_, i) => `NSE:CO${i}`);
      mockScan.mockResolvedValue({ announcements: [], total: 0, quarterDate: '202603' });

      await scanEarningsCalls({ companyIds: ids, quarterDate: '202603' });

      expect(mockScan).toHaveBeenCalledTimes(2);
      const firstFilters = mockScan.mock.calls[0][0].scan.companyFilters;
      const secondFilters = mockScan.mock.calls[1][0].scan.companyFilters;
      expect(firstFilters).toHaveLength(MAX_ANNOUNCEMENT_SCAN_COMPANY_FILTERS);
      expect(secondFilters).toHaveLength(2);
    });
  });

  describe('chunkCompanyIds', () => {
    it('splits into chunks of 10', () => {
      const ids = Array.from({ length: 12 }, (_, i) => `NSE:C${i}`);
      expect(chunkCompanyIds(ids)).toEqual([ids.slice(0, 10), ids.slice(10)]);
    });
  });

  describe('resolveLatestEarningsCalls', () => {
    beforeEach(() => {
      mockScan.mockReset();
    });

    it('walks back a quarter for companies missing in the first scan', async () => {
      mockScan
        .mockResolvedValueOnce({ announcements: [], total: 0, quarterDate: '202603' })
        .mockResolvedValueOnce({
          announcements: [
            {
              companyId: 'NSE:TCS',
              name: 'TCS',
              title: 'Transcript',
              date: '2025-10-15',
              ssUrl: 'tcs.pdf',
            },
          ],
          total: 1,
          quarterDate: '202512',
        });

      const { announcements, missing, meta } = await resolveLatestEarningsCalls({
        companyIds: ['NSE:TCS'],
        quarterDate: '202603',
        maxQuarterLookback: 2,
      });

      expect(mockScan).toHaveBeenCalledTimes(2);
      expect(announcements).toHaveLength(1);
      expect(missing).toEqual([]);
      expect(meta.found).toBe(1);
    });
  });

  describe('currentQuarterDate', () => {
    it('returns YYYYMM with a quarter-end month', () => {
      const qd = currentQuarterDate();
      expect(qd).toMatch(/^\d{6}$/);
      expect([3, 6, 9, 12]).toContain(parseInt(qd.slice(4, 6), 10));
    });
  });
});
