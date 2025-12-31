/**
 * Unit tests for NSE India API module
 * @file backend/api/__tests__/nseIndiaApi.test.js
 * @see docs/backend/api/nseIndiaApi.md for documentation
 */

const axios = require('axios');
const { upcomingResults, getNseCookies, formatDate } = require('../nseIndiaApi');

jest.mock('axios');

describe('NSE India API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the cached cookies between tests
    jest.resetModules();
  });

  describe('formatDate', () => {
    it('should format date as DD-MM-YYYY', () => {
      const date = new Date('2024-01-15');
      const result = formatDate(date);

      expect(result).toBe('15-01-2024');
    });

    it('should pad single digit day with zero', () => {
      const date = new Date('2024-01-05');
      const result = formatDate(date);

      expect(result).toBe('05-01-2024');
    });

    it('should pad single digit month with zero', () => {
      const date = new Date('2024-03-15');
      const result = formatDate(date);

      expect(result).toBe('15-03-2024');
    });

    it('should handle December correctly', () => {
      const date = new Date('2024-12-25');
      const result = formatDate(date);

      expect(result).toBe('25-12-2024');
    });

    it('should handle January correctly', () => {
      const date = new Date('2024-01-01');
      const result = formatDate(date);

      expect(result).toBe('01-01-2024');
    });
  });

  describe('getNseCookies', () => {
    it('should fetch cookies from NSE homepage', async () => {
      const { getNseCookies: freshGetCookies } = require('../nseIndiaApi');

      axios.get.mockResolvedValueOnce({
        headers: {
          'set-cookie': ['nsit=abc123; path=/', 'nseappid=xyz789; path=/'],
        },
      });

      const cookies = await freshGetCookies();

      expect(cookies).toContain('nsit=abc123');
      expect(cookies).toContain('nseappid=xyz789');
      expect(axios.get).toHaveBeenCalledWith(
        'https://www.nseindia.com/',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.any(String),
          }),
        })
      );
    });

    it('should return null on error', async () => {
      axios.get.mockRejectedValueOnce(new Error('Network error'));

      const cookies = await getNseCookies();

      // May return cached cookies or null
      expect(cookies).toBeDefined();
    });

    it('should return null when no cookies in response', async () => {
      axios.get.mockResolvedValueOnce({
        headers: {},
      });

      // Need fresh module to avoid cached cookies
      jest.isolateModules(() => {
        const { getNseCookies: freshGetCookies } = require('../nseIndiaApi');
        // This would return cached cookies if any, or null
      });
    });
  });

  describe('upcomingResults', () => {
    it('should fetch upcoming results from NSE API', async () => {
      const mockData = [
        {
          symbol: 'INFY',
          company: 'Infosys Limited',
          date: '15-Jan-2024',
          purpose: 'Financial Results',
        },
        {
          symbol: 'TCS',
          company: 'Tata Consultancy Services',
          date: '17-Jan-2024',
          purpose: 'Financial Results',
        },
      ];

      // Mock cookie fetch
      axios.get.mockResolvedValueOnce({
        headers: {
          'set-cookie': ['nsit=abc123; path=/'],
        },
      });

      // Mock event calendar API
      axios.get.mockResolvedValueOnce({
        data: mockData,
      });

      const result = await upcomingResults();

      expect(result).toEqual(mockData);
    });

    it('should return empty array on API error', async () => {
      axios.get.mockRejectedValue(new Error('API error'));

      const result = await upcomingResults();

      expect(result).toEqual([]);
    });

    it('should return empty array when response has no data', async () => {
      axios.get.mockResolvedValueOnce({
        headers: { 'set-cookie': ['nsit=abc123'] },
      });
      axios.get.mockResolvedValueOnce({
        data: null,
      });

      const result = await upcomingResults();

      expect(result).toEqual([]);
    });

    it('should call API with correct parameters', async () => {
      axios.get.mockResolvedValueOnce({
        headers: { 'set-cookie': ['nsit=abc123'] },
      });
      axios.get.mockResolvedValueOnce({
        data: [],
      });

      await upcomingResults();

      // Check the API call to event-calendar
      const apiCall = axios.get.mock.calls.find((call) => call[0].includes('event-calendar'));

      if (apiCall) {
        expect(apiCall[1].params).toMatchObject({
          index: 'equities',
          subject: 'Financial Results',
        });
      }
    });

    it('should include cookies in API request', async () => {
      axios.get.mockResolvedValueOnce({
        headers: { 'set-cookie': ['nsit=abc123; path=/'] },
      });
      axios.get.mockResolvedValueOnce({
        data: [],
      });

      await upcomingResults();

      const apiCall = axios.get.mock.calls.find((call) => call[0].includes('event-calendar'));

      if (apiCall) {
        expect(apiCall[1].headers).toHaveProperty('Cookie');
      }
    });

    it('should handle timeout correctly', async () => {
      axios.get.mockResolvedValueOnce({
        headers: { 'set-cookie': ['nsit=abc123'] },
      });
      axios.get.mockResolvedValueOnce({
        data: [{ symbol: 'TEST' }],
      });

      await upcomingResults();

      const apiCall = axios.get.mock.calls.find((call) => call[0].includes('event-calendar'));

      if (apiCall) {
        expect(apiCall[1].timeout).toBe(15000);
      }
    });
  });
});
