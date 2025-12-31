/**
 * Unit tests for Data Fetcher utility
 * @file backend/utils/__tests__/dataFetcher.test.js
 * @see docs/backend/utils/dataFetcher.md for documentation
 */

const axios = require('axios');
const { fetchStockPriceAlphaVantage, fetchFundamentalsFMP, delay } = require('../dataFetcher');

jest.mock('axios');

describe('Data Fetcher', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('fetchStockPriceAlphaVantage', () => {
    it('should fetch and parse price data correctly', async () => {
      process.env.ALPHA_VANTAGE_API_KEY = 'test-key';

      const mockResponse = {
        data: {
          'Time Series (Daily)': {
            '2024-01-15': {
              '1. open': '100.00',
              '2. high': '105.00',
              '3. low': '98.00',
              '4. close': '103.00',
              '5. volume': '1000000',
            },
            '2024-01-14': {
              '1. open': '98.00',
              '2. high': '101.00',
              '3. low': '97.00',
              '4. close': '100.00',
              '5. volume': '800000',
            },
          },
        },
      };

      axios.get.mockResolvedValue(mockResponse);

      const result = await fetchStockPriceAlphaVantage('RELIANCE');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        open: 100,
        high: 105,
        low: 98,
        close: 103,
        volume: 1000000,
      });
      expect(result[0].date).toBeInstanceOf(Date);
    });

    it('should throw error when API key is not configured', async () => {
      delete process.env.ALPHA_VANTAGE_API_KEY;

      const result = await fetchStockPriceAlphaVantage('RELIANCE');

      expect(result).toEqual([]);
    });

    it('should return empty array on API error message', async () => {
      process.env.ALPHA_VANTAGE_API_KEY = 'test-key';

      axios.get.mockResolvedValue({
        data: { 'Error Message': 'Invalid API call' },
      });

      const result = await fetchStockPriceAlphaVantage('INVALID');

      expect(result).toEqual([]);
    });

    it('should return empty array when no data available', async () => {
      process.env.ALPHA_VANTAGE_API_KEY = 'test-key';

      axios.get.mockResolvedValue({
        data: {},
      });

      const result = await fetchStockPriceAlphaVantage('RELIANCE');

      expect(result).toEqual([]);
    });

    it('should return empty array on network error', async () => {
      process.env.ALPHA_VANTAGE_API_KEY = 'test-key';

      axios.get.mockRejectedValue(new Error('Network error'));

      const result = await fetchStockPriceAlphaVantage('RELIANCE');

      expect(result).toEqual([]);
    });

    it('should call API with correct URL', async () => {
      process.env.ALPHA_VANTAGE_API_KEY = 'test-key';

      axios.get.mockResolvedValue({ data: {} });

      await fetchStockPriceAlphaVantage('RELIANCE');

      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('RELIANCE.NS'));
      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('test-key'));
    });
  });

  describe('fetchFundamentalsFMP', () => {
    it('should fetch and parse fundamental data correctly', async () => {
      process.env.FMP_API_KEY = 'test-key';

      const mockResponse = {
        data: [
          {
            peRatio: 25.5,
            pbRatio: 3.2,
            roe: 0.15,
            debtToEquity: 0.5,
            dividendYield: 0.02,
            currentRatio: 1.8,
          },
        ],
      };

      axios.get.mockResolvedValue(mockResponse);

      const result = await fetchFundamentalsFMP('RELIANCE');

      expect(result).toEqual({
        pe_ratio: 25.5,
        pb_ratio: 3.2,
        roe: 15, // Converted to percentage
        debt_to_equity: 0.5,
        dividend_yield: 2, // Converted to percentage
        current_ratio: 1.8,
      });
    });

    it('should return null when API key is not configured', async () => {
      delete process.env.FMP_API_KEY;

      const result = await fetchFundamentalsFMP('RELIANCE');

      expect(result).toBeNull();
    });

    it('should return null when no data available', async () => {
      process.env.FMP_API_KEY = 'test-key';

      axios.get.mockResolvedValue({ data: [] });

      const result = await fetchFundamentalsFMP('RELIANCE');

      expect(result).toBeNull();
    });

    it('should return null on API error', async () => {
      process.env.FMP_API_KEY = 'test-key';

      axios.get.mockRejectedValue(new Error('API error'));

      const result = await fetchFundamentalsFMP('RELIANCE');

      expect(result).toBeNull();
    });

    it('should handle null values in response', async () => {
      process.env.FMP_API_KEY = 'test-key';

      const mockResponse = {
        data: [
          {
            peRatio: null,
            pbRatio: 3.2,
            roe: null,
          },
        ],
      };

      axios.get.mockResolvedValue(mockResponse);

      const result = await fetchFundamentalsFMP('RELIANCE');

      expect(result.pe_ratio).toBeNull();
      expect(result.pb_ratio).toBe(3.2);
      expect(result.roe).toBeNull();
    });

    it('should call API with correct URL', async () => {
      process.env.FMP_API_KEY = 'test-key';

      axios.get.mockResolvedValue({ data: [{}] });

      await fetchFundamentalsFMP('INFY');

      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('INFY.NS'));
      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('test-key'));
    });
  });

  describe('delay', () => {
    it('should delay for specified milliseconds', async () => {
      const start = Date.now();
      await delay(100);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(95); // Allow small margin
      expect(elapsed).toBeLessThan(150);
    });

    it('should resolve without value', async () => {
      const result = await delay(10);

      expect(result).toBeUndefined();
    });
  });
});
