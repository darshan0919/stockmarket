/**
 * Unit tests for NSE India API module
 * @file backend/api/__tests__/nseIndiaApi.test.js
 * @see docs/backend/api/nseIndiaApi.md for documentation
 */

const axios = require('axios');

jest.mock('axios');
jest.mock('../bseIndiaApi', () => ({
  bseSmartSearch: jest.fn(),
}));

const { bseSmartSearch } = require('../bseIndiaApi');

describe('NSE India API', () => {
  let api;

  const mockHomepage = () => {
    axios.get.mockResolvedValueOnce({
      headers: { 'set-cookie': ['nsit=abc123; path=/'] },
      data: '<html></html>',
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    api = require('../nseIndiaApi');
    api.clearNseCookieCache();
    bseSmartSearch.mockReset();
  });

  describe('formatDate', () => {
    it('should format date as DD-MM-YYYY', () => {
      expect(api.formatDate(new Date('2024-01-15'))).toBe('15-01-2024');
    });
  });

  describe('getNseCookies', () => {
    it('should fetch cookies from NSE homepage', async () => {
      mockHomepage();
      const cookies = await api.getNseCookies();
      expect(cookies).toContain('nsit=abc123');
      expect(axios.get).toHaveBeenCalledWith(
        'https://www.nseindia.com/',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.any(String),
            'sec-ch-ua': expect.any(String),
          }),
        })
      );
    });
  });

  describe('clearNseCookieCache', () => {
    it('forces a fresh cookie fetch on next request', async () => {
      mockHomepage();
      axios.get.mockResolvedValueOnce({ data: { symbols: [] } });
      mockHomepage();
      axios.get.mockResolvedValueOnce({ data: { symbols: [] } });
      bseSmartSearch.mockResolvedValue({ symbols: [{ symbol: 'TCS' }] });

      await api.searchAutocomplete('rel');
      api.clearNseCookieCache();
      await api.searchAutocomplete('tcs');

      const homeCalls = axios.get.mock.calls.filter((c) => c[0] === 'https://www.nseindia.com/');
      expect(homeCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('searchAutocomplete', () => {
    it('returns NSE symbols when autocomplete succeeds', async () => {
      mockHomepage();
      axios.get.mockResolvedValueOnce({
        data: { symbols: [{ symbol: 'RELIANCE', result_sub_type: 'equity' }] },
      });

      const data = await api.searchAutocomplete('rel');

      expect(data.symbols).toHaveLength(1);
      expect(bseSmartSearch).not.toHaveBeenCalled();
    });

    it('falls back to BSE when NSE returns 404', async () => {
      mockHomepage();
      const err404 = new Error('Not found');
      err404.response = { status: 404 };
      axios.get.mockRejectedValueOnce(err404);
      bseSmartSearch.mockResolvedValue({
        symbols: [{ symbol: 'RELIANCE', symbol_info: 'Reliance Industries Ltd' }],
      });

      const data = await api.searchAutocomplete('rel');

      expect(bseSmartSearch).toHaveBeenCalledWith('rel');
      expect(data.symbols[0].symbol).toBe('RELIANCE');
    });
  });

  describe('getQuoteEquity', () => {
    it('warms up equity page and requests quote-equity', async () => {
      mockHomepage();
      axios.get.mockResolvedValueOnce({
        headers: { 'set-cookie': ['eq=1; path=/'] },
        data: '<html></html>',
      });
      axios.get.mockResolvedValueOnce({
        data: { info: { companyName: 'Reliance Industries Limited' } },
      });

      const data = await api.getQuoteEquity('reliance');

      expect(data.info.companyName).toContain('Reliance');
      const quoteCall = axios.get.mock.calls.find((c) => String(c[0]).includes('/quote-equity'));
      expect(quoteCall[1].params).toEqual({ symbol: 'RELIANCE' });
    });
  });

  describe('nseGet', () => {
    it('retries once after 403', async () => {
      const err403 = new Error('Forbidden');
      err403.response = { status: 403 };

      mockHomepage();
      axios.get.mockRejectedValueOnce(err403);
      mockHomepage();
      axios.get.mockResolvedValueOnce({ data: { ok: true } });

      const response = await api.nseGet('/test-endpoint');

      expect(response.data).toEqual({ ok: true });
    });
  });

  describe('upcomingResults', () => {
    it('should fetch upcoming results from NSE API', async () => {
      const mockData = [{ symbol: 'INFY', company: 'Infosys Limited', date: '15-Jan-2024' }];

      mockHomepage();
      axios.get.mockResolvedValueOnce({ data: mockData });

      const result = await api.upcomingResults();
      expect(result).toEqual(mockData);
    });

    it('should return empty array on API error', async () => {
      axios.get.mockRejectedValue(new Error('API error'));
      const result = await api.upcomingResults();
      expect(result).toEqual([]);
    });
  });
});
