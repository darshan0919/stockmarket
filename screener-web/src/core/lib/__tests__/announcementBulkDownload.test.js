/**
 * Unit tests for announcement bulk download helpers
 * @file frontend/lib/__tests__/announcementBulkDownload.test.js
 * @see docs/API_REFERENCE.md#announcements-apis
 */

import {
  ANNOUNCEMENT_SEARCH,
  announcementMatchesQuery,
  buildCategoryYearPack,
  buildOrderBookPack,
  buildStandardPack,
  dedupeByAttachmentUrl,
  fetchAnnouncementsForSearchQuery,
  filterOnOrAfterDate,
  minDateForTimeSpan,
  parseAnnouncementDate,
  sortByDateDesc,
  takeWithAttachments,
} from '../announcementBulkDownload';

describe('announcementBulkDownload', () => {
  describe('minDateForTimeSpan', () => {
    it('returns null for all time', () => {
      expect(minDateForTimeSpan('all')).toBeNull();
    });

    it('shifts calendar year for y1/y3/y5', () => {
      const refY = new Date().getFullYear();
      expect(minDateForTimeSpan('y1')?.getFullYear()).toBe(refY - 1);
      expect(minDateForTimeSpan('y3')?.getFullYear()).toBe(refY - 3);
      expect(minDateForTimeSpan('y5')?.getFullYear()).toBe(refY - 5);
    });
  });

  describe('parseAnnouncementDate', () => {
    it('parses NSE-style dates', () => {
      const d = parseAnnouncementDate('31-Dec-2025 10:30:00');
      expect(d?.getFullYear()).toBe(2025);
      expect(d?.getMonth()).toBe(11);
      expect(d?.getDate()).toBe(31);
    });
  });

  describe('announcementMatchesQuery', () => {
    it('matches annual report tokens', () => {
      expect(
        announcementMatchesQuery(
          { subject: 'Annual_Report', desc: 'FY report' },
          ANNOUNCEMENT_SEARCH.ANNUAL_REPORT
        )
      ).toBe(true);
      expect(
        announcementMatchesQuery(
          { subject: 'Other', desc: 'news' },
          ANNOUNCEMENT_SEARCH.ANNUAL_REPORT
        )
      ).toBe(false);
    });

    it('matches order-related phrasing', () => {
      expect(
        announcementMatchesQuery(
          { subject: 'Award_of_Order', desc: '' },
          ANNOUNCEMENT_SEARCH.ORDERS
        )
      ).toBe(true);
    });
  });

  describe('dedupeByAttachmentUrl', () => {
    it('removes duplicate URLs', () => {
      const a = { attchmntFile: 'https://x/a.pdf', subject: 'A' };
      const b = { attchmntFile: 'https://x/a.pdf', subject: 'B' };
      expect(dedupeByAttachmentUrl([a, b])).toHaveLength(1);
    });
  });

  describe('sortByDateDesc', () => {
    it('orders newest first', () => {
      const older = { an_dt: '01-Jan-2024 00:00:00' };
      const newer = { an_dt: '01-Jan-2026 00:00:00' };
      expect(sortByDateDesc([older, newer])[0]).toBe(newer);
    });
  });

  describe('filterOnOrAfterDate', () => {
    it('drops older rows', () => {
      const min = new Date(2025, 0, 1);
      const rows = [
        { an_dt: '01-Jun-2024 00:00:00', attchmntFile: 'u1' },
        { an_dt: '01-Jun-2025 00:00:00', attchmntFile: 'u2' },
      ];
      expect(filterOnOrAfterDate(rows, min)).toHaveLength(1);
    });
  });

  describe('takeWithAttachments', () => {
    it('respects count and skips missing files', () => {
      const rows = [
        { attchmntFile: null },
        { attchmntFile: 'u1', subject: 'a' },
        { attchmntFile: 'u2', subject: 'b' },
      ];
      expect(takeWithAttachments(rows, 1)).toHaveLength(1);
      expect(takeWithAttachments(rows, 2)[1].attchmntFile).toBe('u2');
    });
  });

  describe('buildStandardPack', () => {
    it('merges four categories with time filter (NSE)', async () => {
      const api = {
        getBySymbol: jest.fn().mockResolvedValue({
          data: {
            success: true,
            data: [
              {
                subject: 'Annual_Report',
                desc: 'annual report pdf',
                an_dt: '10-Jan-2026 00:00:00',
                attchmntFile: 'https://x/ar.pdf',
              },
              {
                subject: 'Transcript',
                desc: 'transcript',
                an_dt: '09-Jan-2026 00:00:00',
                attchmntFile: 'https://x/t1.pdf',
              },
              {
                subject: 'Transcript',
                desc: 'transcript',
                an_dt: '08-Jan-2026 00:00:00',
                attchmntFile: 'https://x/t2.pdf',
              },
              {
                subject: 'Investor_Presentation',
                desc: 'investor presentation',
                an_dt: '07-Jan-2026 00:00:00',
                attchmntFile: 'https://x/i1.pdf',
              },
              {
                subject: 'Award_of_Order',
                desc: 'receipt of order',
                an_dt: '06-Jan-2026 00:00:00',
                attchmntFile: 'https://x/o1.pdf',
              },
            ],
          },
        }),
      };

      const out = await buildStandardPack('TEST', 'nse', api, 'all');
      expect(api.getBySymbol).toHaveBeenCalledWith('TEST', { provider: 'nse' });
      expect(api.getBySymbol).toHaveBeenCalledTimes(1);
      expect(out.some((a) => a.attchmntFile === 'https://x/ar.pdf')).toBe(true);
      expect(out.filter((a) => a.subject === 'Transcript').length).toBe(2);
    });
  });

  describe('buildCategoryYearPack', () => {
    it('returns only annual PDFs in range (NSE)', async () => {
      const api = {
        getBySymbol: jest.fn().mockResolvedValue({
          data: {
            success: true,
            data: [
              {
                subject: 'Annual_Report',
                desc: 'annual report',
                an_dt: '01-Jan-2026 00:00:00',
                attchmntFile: 'https://x/a.pdf',
              },
              {
                subject: 'Other',
                desc: 'noise',
                an_dt: '02-Jan-2026 00:00:00',
                attchmntFile: 'https://x/x.pdf',
              },
            ],
          },
        }),
      };

      const out = await buildCategoryYearPack(
        'TEST',
        'nse',
        api,
        ANNOUNCEMENT_SEARCH.ANNUAL_REPORT,
        'all'
      );
      expect(out).toHaveLength(1);
      expect(out[0].attchmntFile).toBe('https://x/a.pdf');
    });
  });

  describe('fetchAnnouncementsForSearchQuery (StockScans)', () => {
    it('passes provider=stockscans on paginated getBySymbol calls', async () => {
      const api = {
        getBySymbol: jest
          .fn()
          .mockResolvedValueOnce({
            data: {
              success: true,
              data: [
                {
                  subject: 'Annual report',
                  an_dt: '10-Jan-2026 00:00:00',
                  attchmntFile: 'https://x/1.pdf',
                },
              ],
              meta: { offset: 0, limit: 1, provider: 'stockscans' },
            },
          })
          .mockResolvedValueOnce({
            data: {
              success: true,
              data: [],
              meta: { offset: 1, limit: 1 },
            },
          }),
      };

      const rows = await fetchAnnouncementsForSearchQuery(
        'TEST',
        ANNOUNCEMENT_SEARCH.ANNUAL_REPORT,
        'stockscans',
        api,
        null
      );

      expect(api.getBySymbol).toHaveBeenCalledTimes(2);
      expect(api.getBySymbol).toHaveBeenNthCalledWith(1, 'TEST', {
        search: ANNOUNCEMENT_SEARCH.ANNUAL_REPORT,
        offset: 0,
        provider: 'stockscans',
      });
      expect(api.getBySymbol).toHaveBeenNthCalledWith(2, 'TEST', {
        search: ANNOUNCEMENT_SEARCH.ANNUAL_REPORT,
        offset: 1,
        provider: 'stockscans',
      });
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    it('advances offset by batch length when API returns meta.offset 0 on every page', async () => {
      const api = {
        getBySymbol: jest
          .fn()
          .mockResolvedValueOnce({
            data: {
              success: true,
              data: [
                {
                  subject: 'Annual report',
                  an_dt: '10-Jan-2026 00:00:00',
                  attchmntFile: 'https://x/1.pdf',
                },
              ],
              meta: { offset: 0, limit: 1, provider: 'stockscans' },
            },
          })
          .mockResolvedValueOnce({
            data: {
              success: true,
              data: [
                {
                  subject: 'Annual report',
                  an_dt: '09-Jan-2026 00:00:00',
                  attchmntFile: 'https://x/2.pdf',
                },
              ],
              meta: { offset: 0, limit: 1 },
            },
          })
          .mockResolvedValueOnce({
            data: {
              success: true,
              data: [],
              meta: { offset: 0, limit: 1 },
            },
          }),
      };

      const rows = await fetchAnnouncementsForSearchQuery(
        'TEST',
        ANNOUNCEMENT_SEARCH.ANNUAL_REPORT,
        'stockscans',
        api,
        null
      );

      expect(api.getBySymbol).toHaveBeenCalledTimes(3);
      expect(api.getBySymbol).toHaveBeenNthCalledWith(1, 'TEST', {
        search: ANNOUNCEMENT_SEARCH.ANNUAL_REPORT,
        offset: 0,
        provider: 'stockscans',
      });
      expect(api.getBySymbol).toHaveBeenNthCalledWith(2, 'TEST', {
        search: ANNOUNCEMENT_SEARCH.ANNUAL_REPORT,
        offset: 1,
        provider: 'stockscans',
      });
      expect(api.getBySymbol).toHaveBeenNthCalledWith(3, 'TEST', {
        search: ANNOUNCEMENT_SEARCH.ANNUAL_REPORT,
        offset: 2,
        provider: 'stockscans',
      });
      expect(rows).toHaveLength(2);
    });
  });

  describe('buildOrderBookPack', () => {
    it('filters by time span (NSE)', async () => {
      const api = {
        getBySymbol: jest.fn().mockResolvedValue({
          data: {
            success: true,
            data: [
              {
                subject: 'Award',
                desc: 'order receipt',
                an_dt: '01-Jan-2020 00:00:00',
                attchmntFile: 'https://x/old.pdf',
              },
              {
                subject: 'Award',
                desc: 'order receipt',
                an_dt: '01-Jan-2026 00:00:00',
                attchmntFile: 'https://x/new.pdf',
              },
            ],
          },
        }),
      };

      const out = await buildOrderBookPack('TEST', 'nse', api, 'y1');
      expect(out.every((a) => a.attchmntFile === 'https://x/new.pdf')).toBe(true);
    });
  });
});
