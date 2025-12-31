/**
 * Unit tests for BSE India API module
 * @file backend/api/__tests__/bseIndiaApi.test.js
 * @see docs/backend/api/bseIndiaApi.md for documentation
 */

const axios = require('axios');
const {
  getStockScripCode,
  getResultAnnoucement,
  upcomingResults,
  getCompanyInfo,
} = require('../bseIndiaApi');

jest.mock('axios');

describe('BSE India API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getStockScripCode', () => {
    it('should extract scrip code from search response', async () => {
      const mockResponse = {
        data: '<strong>RELIANCE</strong> RELIANCE IND 500325 EQ',
      };

      axios.get.mockResolvedValue(mockResponse);

      const result = await getStockScripCode('RELIANCE');

      expect(result).toBe('500325');
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('PeerSmartSearch'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Referer: 'https://www.bseindia.com/',
          }),
        })
      );
    });

    it('should return null when symbol not found', async () => {
      const mockResponse = {
        data: 'No results found',
      };

      axios.get.mockResolvedValue(mockResponse);

      const result = await getStockScripCode('NONEXISTENT');

      expect(result).toBeNull();
    });

    it('should handle &nbsp; in response', async () => {
      const mockResponse = {
        data: '<strong>INFY</strong>&nbsp;INFOSYS&nbsp;500209',
      };

      axios.get.mockResolvedValue(mockResponse);

      const result = await getStockScripCode('INFY');

      expect(result).toBe('500209');
    });

    it('should trim symbol before search', async () => {
      axios.get.mockResolvedValue({ data: '<strong>TCS</strong> TCS 532540' });

      await getStockScripCode('  TCS  ');

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('text=TCS'),
        expect.any(Object)
      );
    });

    it('should handle API error gracefully', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));

      await expect(getStockScripCode('RELIANCE')).rejects.toThrow('Network error');
    });
  });

  describe('getResultAnnoucement', () => {
    it('should fetch result announcements for a stock', async () => {
      const mockScripResponse = {
        data: '<strong>INFY</strong> INFOSYS 500209',
      };

      const mockAnnouncements = {
        data: {
          Table: [
            {
              HEADLINE: 'Earnings Call Transcript Q1 2024',
              DT_TM: '15-Apr-2024',
              ATTACHNAME: 'transcript.pdf',
            },
          ],
          Table1: [{ ROWCNT: 1 }],
        },
      };

      axios.get.mockResolvedValueOnce(mockScripResponse).mockResolvedValueOnce(mockAnnouncements);

      const result = await getResultAnnoucement('INFY', '01-01-2024', '31-12-2024');

      expect(result).toHaveLength(1);
      expect(result[0].HEADLINE).toContain('Earnings Call');
    });

    it('should return null when scrip code not found', async () => {
      axios.get.mockResolvedValue({ data: 'No results' });

      const result = await getResultAnnoucement('INVALID', '01-01-2024', '31-12-2024');

      expect(result).toBeNull();
    });

    it('should paginate through multiple pages', async () => {
      const mockScripResponse = {
        data: '<strong>RELIANCE</strong> RELIANCE 500325',
      };

      const page1 = {
        data: {
          Table: [{ HEADLINE: 'Transcript 1' }, { HEADLINE: 'Transcript 2' }],
          Table1: [{ ROWCNT: 3 }],
        },
      };

      const page2 = {
        data: {
          Table: [{ HEADLINE: 'Transcript 3' }],
          Table1: [{ ROWCNT: 3 }],
        },
      };

      axios.get
        .mockResolvedValueOnce(mockScripResponse)
        .mockResolvedValueOnce(page1)
        .mockResolvedValueOnce(page2);

      const result = await getResultAnnoucement('RELIANCE', '01-01-2024', '31-12-2024');

      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('should limit pagination to 10 pages', async () => {
      const mockScripResponse = {
        data: '<strong>TEST</strong> TEST 100000',
      };

      // Mock infinite pagination scenario
      const infinitePage = {
        data: {
          Table: [{ HEADLINE: 'Item' }],
          Table1: [{ ROWCNT: 999 }], // Very high count
        },
      };

      axios.get.mockResolvedValueOnce(mockScripResponse);
      for (let i = 0; i < 15; i++) {
        axios.get.mockResolvedValueOnce(infinitePage);
      }

      const result = await getResultAnnoucement('TEST', '01-01-2024', '31-12-2024');

      // Should stop at 10 pages (1 for scrip + 10 for data)
      expect(axios.get).toHaveBeenCalledTimes(11);
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

      axios.get.mockResolvedValue({ data: mockData });

      const result = await upcomingResults();

      expect(result).toEqual(mockData);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('Corpforthresults'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Referer: 'https://www.bseindia.com/',
          }),
        })
      );
    });

    it('should handle API error', async () => {
      axios.get.mockRejectedValue(new Error('API error'));

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

      axios.get.mockResolvedValue({ data: mockData });

      const result = await getCompanyInfo('500325');

      expect(result).toEqual(mockData);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('scripcode=500325'),
        expect.any(Object)
      );
    });

    it('should include proper headers', async () => {
      axios.get.mockResolvedValue({ data: {} });

      await getCompanyInfo('500325');

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Referer: 'https://www.bseindia.com/',
          }),
        })
      );
    });
  });
});
