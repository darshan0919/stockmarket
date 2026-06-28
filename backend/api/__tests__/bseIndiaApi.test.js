/**
 * Unit tests for the BSE India API adapter.
 *
 * Since the cutover to `@stock/api`, this module is a thin adapter:
 *   • price-action methods delegate to the centralized `bse` client;
 *   • fundamental methods run over the shared `bseHttp` transport.
 * These tests mock that package seam. The HTML-parsing / scrip-code resolution
 * logic itself is unit-tested in packages/stock-api (bseClient.test.js).
 *
 * @file backend/api/__tests__/bseIndiaApi.test.js
 */

jest.mock('@stock/api', () => {
  const actual = jest.requireActual('@stock/api');
  return {
    ...actual,
    bse: {
      getScripCode: jest.fn(),
      getSecurityPosition: jest.fn(),
      getQuoteHeader: jest.fn(),
      smartSearch: jest.fn(),
    },
    bseHttp: {
      ...actual.bseHttp,
      bseGetText: jest.fn(),
      bseGetJson: jest.fn(),
    },
  };
});

const { bse, bseHttp } = require('@stock/api');
const {
  getStockScripCode,
  getResultAnnoucement,
  upcomingResults,
  getCompanyInfo,
  parseBseSmartSearchHtml,
} = require('../bseIndiaApi');

describe('BSE India API adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getStockScripCode (delegates to bse client)', () => {
    it('returns the scrip code resolved by the centralized client', async () => {
      bse.getScripCode.mockResolvedValue('500325');
      const result = await getStockScripCode('RELIANCE');
      expect(result).toBe('500325');
      expect(bse.getScripCode).toHaveBeenCalledWith('RELIANCE');
    });

    it('propagates null when the client cannot resolve', async () => {
      bse.getScripCode.mockResolvedValue(null);
      expect(await getStockScripCode('NONEXISTENT')).toBeNull();
    });
  });

  describe('getResultAnnoucement', () => {
    it('fetches result announcements for a stock', async () => {
      bse.getScripCode.mockResolvedValue('500209');
      bseHttp.bseGetJson.mockResolvedValue({
        Table: [{ HEADLINE: 'Earnings Call Transcript Q1 2024' }],
        Table1: [{ ROWCNT: 1 }],
      });
      const result = await getResultAnnoucement('INFY', '01-01-2024', '31-12-2024');
      expect(result).toHaveLength(1);
      expect(result[0].HEADLINE).toContain('Earnings Call');
    });

    it('returns null when scrip code not found', async () => {
      bse.getScripCode.mockResolvedValue(null);
      const result = await getResultAnnoucement('INVALID', '01-01-2024', '31-12-2024');
      expect(result).toBeNull();
    });

    it('paginates through multiple pages', async () => {
      bse.getScripCode.mockResolvedValue('500325');
      bseHttp.bseGetJson
        .mockResolvedValueOnce({
          Table: [{ HEADLINE: 'Transcript 1' }, { HEADLINE: 'Transcript 2' }],
          Table1: [{ ROWCNT: 3 }],
        })
        .mockResolvedValueOnce({
          Table: [{ HEADLINE: 'Transcript 3' }],
          Table1: [{ ROWCNT: 3 }],
        });
      const result = await getResultAnnoucement('RELIANCE', '01-01-2024', '31-12-2024');
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('limits pagination to 10 pages', async () => {
      bse.getScripCode.mockResolvedValue('100000');
      bseHttp.bseGetJson.mockResolvedValue({
        Table: [{ HEADLINE: 'Item' }],
        Table1: [{ ROWCNT: 999 }],
      });
      await getResultAnnoucement('TEST', '01-01-2024', '31-12-2024');
      expect(bseHttp.bseGetJson).toHaveBeenCalledTimes(11);
    });
  });

  describe('upcomingResults', () => {
    it('fetches upcoming results from the BSE API', async () => {
      const mockData = [{ SCRIP_CD: '500325', SLONGNAME: 'Reliance Industries Limited' }];
      bseHttp.bseGetJson.mockResolvedValue(mockData);
      const result = await upcomingResults();
      expect(result).toEqual(mockData);
      expect(bseHttp.bseGetJson).toHaveBeenCalledWith('Corpforthresults/w');
    });

    it('propagates API errors', async () => {
      bseHttp.bseGetJson.mockRejectedValue(new Error('API error'));
      await expect(upcomingResults()).rejects.toThrow('API error');
    });
  });

  describe('getCompanyInfo', () => {
    it('fetches company info by scrip code', async () => {
      const mockData = { SCRIP_CD: '500325', SLONGNAME: 'Reliance Industries Limited' };
      bseHttp.bseGetJson.mockResolvedValue(mockData);
      const result = await getCompanyInfo('500325');
      expect(result).toEqual(mockData);
      expect(bseHttp.bseGetJson).toHaveBeenCalledWith(
        'ComHeadernew/w',
        expect.objectContaining({ params: { quotetype: 'EQ', scripcode: '500325' } })
      );
    });
  });

  describe('parseBseSmartSearchHtml (re-exported from package)', () => {
    it('extracts NSE-shaped symbols from BSE HTML', () => {
      const html =
        "<li ng-click=\"liclick('500325','RELIANCE INDUSTRIES LTD')\"><a><strong>REL</strong>" +
        'IANCE INDUSTRIES LTD<br /><span><strong>REL</strong>IANCE&nbsp;&nbsp;&nbsp;' +
        'INE002A01018&nbsp;&nbsp;&nbsp;500325</span></a></li>';
      const symbols = parseBseSmartSearchHtml(html);
      expect(symbols[0].symbol).toBe('RELIANCE');
      expect(symbols[0].bse_scrip_code).toBe('500325');
    });
  });
});
