/**
 * Unit tests for BSE India API module
 * @file backend/api/__tests__/bseIndiaApi.test.js
 * @see docs/backend/api/bseIndiaApi.md for documentation
 */

const { bseGetText, bseGetJson } = require('../bseHttp');
const {
  getStockScripCode,
  getResultAnnoucement,
  upcomingResults,
  getCompanyInfo,
  parseBseSmartSearchHtml,
} = require('../bseIndiaApi');

jest.mock('../bseHttp');

describe('BSE India API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getStockScripCode', () => {
    it('should extract scrip code from search response', async () => {
      bseGetText.mockResolvedValue({
        data: "<li ng-click=\"liclick('500325','RELIANCE INDUSTRIES LTD')\"><span><strong>RELIANCE</strong>&nbsp;&nbsp;&nbsp;INE002A01018&nbsp;&nbsp;&nbsp;500325</span></li>",
      });

      const result = await getStockScripCode('RELIANCE');

      expect(result).toBe('500325');
      expect(bseGetText).toHaveBeenCalledWith(
        'PeerSmartSearch/w',
        expect.objectContaining({
          params: { Type: 'SS', text: 'RELIANCE' },
        })
      );
    });

    it('should match BSE HTML when input symbol is lowercase', async () => {
      bseGetText.mockResolvedValue({
        data: "<li ng-click=\"liclick('534618','WAAREE RENEWABLE TECH LTD')\"><span><strong>WAAREERTL</strong>&nbsp;&nbsp;&nbsp;INE299N01021&nbsp;&nbsp;&nbsp;534618</span></li>",
      });

      const result = await getStockScripCode('waareertl');

      expect(result).toBe('534618');
    });

    it('should return null when symbol not found', async () => {
      bseGetText.mockResolvedValue({ data: 'No results found' });

      const result = await getStockScripCode('NONEXISTENT');

      expect(result).toBeNull();
    });

    it('should handle &nbsp; in response', async () => {
      bseGetText.mockResolvedValue({
        data: '<strong>INFY</strong>&nbsp;INFOSYS&nbsp;500209',
      });

      const result = await getStockScripCode('INFY');

      expect(result).toBe('500209');
    });

    it('should trim symbol before search', async () => {
      bseGetText.mockResolvedValue({ data: '<strong>TCS</strong> TCS 532540' });

      await getStockScripCode('  TCS  ');

      expect(bseGetText).toHaveBeenCalledWith(
        'PeerSmartSearch/w',
        expect.objectContaining({
          params: { Type: 'SS', text: 'TCS' },
        })
      );
    });

    it('should return null on API error instead of throwing', async () => {
      bseGetText.mockRejectedValue(new Error('Network error'));

      const result = await getStockScripCode('RELIANCE');

      expect(result).toBeNull();
    });
  });

  describe('getResultAnnoucement', () => {
    it('should fetch result announcements for a stock', async () => {
      bseGetText.mockResolvedValue({
        data: "<li ng-click=\"liclick('500209','INFOSYS LTD')\"><span><strong>INFY</strong>&nbsp;500209</span></li>",
      });

      bseGetJson.mockResolvedValue({
        Table: [
          {
            HEADLINE: 'Earnings Call Transcript Q1 2024',
            DT_TM: '15-Apr-2024',
            ATTACHNAME: 'transcript.pdf',
          },
        ],
        Table1: [{ ROWCNT: 1 }],
      });

      const result = await getResultAnnoucement('INFY', '01-01-2024', '31-12-2024');

      expect(result).toHaveLength(1);
      expect(result[0].HEADLINE).toContain('Earnings Call');
    });

    it('should return null when scrip code not found', async () => {
      bseGetText.mockResolvedValue({ data: 'No results' });

      const result = await getResultAnnoucement('INVALID', '01-01-2024', '31-12-2024');

      expect(result).toBeNull();
    });

    it('should paginate through multiple pages', async () => {
      bseGetText.mockResolvedValue({
        data: "<li ng-click=\"liclick('500325','RELIANCE INDUSTRIES LTD')\"><span><strong>RELIANCE</strong>&nbsp;500325</span></li>",
      });

      bseGetJson
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

    it('should limit pagination to 10 pages', async () => {
      bseGetText.mockResolvedValue({
        data: "<li ng-click=\"liclick('100000','TEST LTD')\"><span><strong>TEST</strong>&nbsp;100000</span></li>",
      });

      const infinitePage = {
        Table: [{ HEADLINE: 'Item' }],
        Table1: [{ ROWCNT: 999 }],
      };

      bseGetJson.mockResolvedValue(infinitePage);

      await getResultAnnoucement('TEST', '01-01-2024', '31-12-2024');

      expect(bseGetJson).toHaveBeenCalledTimes(11);
    });
  });

  describe('upcomingResults', () => {
    it('should fetch upcoming results from BSE API', async () => {
      const mockData = [
        {
          SCRIP_CD: '500325',
          SLONGNAME: 'Reliance Industries Limited',
          BRDMEET_DT: '15-Jan-2024',
        },
      ];

      bseGetJson.mockResolvedValue(mockData);

      const result = await upcomingResults();

      expect(result).toEqual(mockData);
      expect(bseGetJson).toHaveBeenCalledWith('Corpforthresults/w');
    });

    it('should handle API error', async () => {
      bseGetJson.mockRejectedValue(new Error('API error'));

      await expect(upcomingResults()).rejects.toThrow('API error');
    });
  });

  describe('getCompanyInfo', () => {
    it('should fetch company info by scrip code', async () => {
      const mockData = {
        SCRIP_CD: '500325',
        SLONGNAME: 'Reliance Industries Limited',
        SECTOR: 'Energy',
      };

      bseGetJson.mockResolvedValue(mockData);

      const result = await getCompanyInfo('500325');

      expect(result).toEqual(mockData);
      expect(bseGetJson).toHaveBeenCalledWith(
        'ComHeadernew/w',
        expect.objectContaining({
          params: { quotetype: 'EQ', scripcode: '500325' },
        })
      );
    });
  });

  describe('parseBseSmartSearchHtml', () => {
    it('extracts NSE-shaped symbols from BSE HTML', () => {
      const html = `<li ng-click="liclick('500325','RELIANCE INDUSTRIES LTD')"><a><strong>REL</strong>IANCE INDUSTRIES LTD<br /><span><strong>REL</strong>IANCE&nbsp;&nbsp;&nbsp;INE002A01018&nbsp;&nbsp;&nbsp;500325</span></a></li>`;
      const symbols = parseBseSmartSearchHtml(html);
      expect(symbols[0].symbol).toBe('RELIANCE');
      expect(symbols[0].bse_scrip_code).toBe('500325');
    });
  });
});
