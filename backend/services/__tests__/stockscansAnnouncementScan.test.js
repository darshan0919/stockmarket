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

jest.mock('../stockscansAuth', () => ({
  getAuthToken: jest.fn(() => 'test-token'),
  createAuthenticatedClient: jest.fn(),
}));

const { createAuthenticatedClient } = require('../stockscansAuth');

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
    let postMock;

    beforeEach(() => {
      postMock = jest.fn();
      createAuthenticatedClient.mockReturnValue({ post: postMock });
    });

    it('posts companyFilters to scan API', async () => {
      postMock.mockResolvedValue({
        data: {
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
        },
      });

      const { announcements, meta } = await scanEarningsCalls({
        companyIds: ['NSE:RELIANCE'],
        quarterDate: '202603',
      });

      expect(postMock).toHaveBeenCalledWith(
        'https://www.stockscans.in/api/company/announcements/scan',
        expect.objectContaining({
          quarterDate: '202603',
          scan: expect.objectContaining({
            announcementType: 'Earnings Call',
            companyFilters: [{ companyId: 'NSE:RELIANCE' }],
          }),
        }),
        expect.any(Object)
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
      postMock.mockResolvedValue({
        data: { announcements: [], total: 0, quarterDate: '202603' },
      });

      await scanEarningsCalls({ companyIds: ids, quarterDate: '202603' });

      expect(postMock).toHaveBeenCalledTimes(2);
      const firstFilters = postMock.mock.calls[0][1].scan.companyFilters;
      const secondFilters = postMock.mock.calls[1][1].scan.companyFilters;
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
    let postMock;

    beforeEach(() => {
      postMock = jest.fn();
      createAuthenticatedClient.mockReturnValue({ post: postMock });
    });

    it('walks back a quarter for companies missing in the first scan', async () => {
      postMock
        .mockResolvedValueOnce({
          data: {
            announcements: [],
            total: 0,
            quarterDate: '202603',
          },
        })
        .mockResolvedValueOnce({
          data: {
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
          },
        });

      const { announcements, missing, meta } = await resolveLatestEarningsCalls({
        companyIds: ['NSE:TCS'],
        quarterDate: '202603',
        maxQuarterLookback: 2,
      });

      expect(postMock).toHaveBeenCalledTimes(2);
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
