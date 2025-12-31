/**
 * Unit tests for Technical Indicators utility
 * @file backend/utils/__tests__/technicalIndicators.test.js
 * @see docs/backend/utils/technicalIndicators.md for documentation
 */

const {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateAllIndicators,
} = require('../technicalIndicators');

describe('Technical Indicators', () => {
  describe('calculateSMA', () => {
    it('should calculate SMA correctly for valid input', () => {
      const prices = [10, 20, 30, 40, 50];
      const result = calculateSMA(prices, 3);

      expect(result).toHaveLength(3);
      expect(result[0]).toBe(20); // (10+20+30)/3
      expect(result[1]).toBe(30); // (20+30+40)/3
      expect(result[2]).toBe(40); // (30+40+50)/3
    });

    it('should return empty array for insufficient data', () => {
      const prices = [10, 20];
      const result = calculateSMA(prices, 5);

      expect(result).toEqual([]);
    });

    it('should return empty array for null input', () => {
      const result = calculateSMA(null, 5);

      expect(result).toEqual([]);
    });

    it('should return empty array for undefined input', () => {
      const result = calculateSMA(undefined, 5);

      expect(result).toEqual([]);
    });

    it('should return empty array for empty array', () => {
      const result = calculateSMA([], 3);

      expect(result).toEqual([]);
    });

    it('should handle period of 1', () => {
      const prices = [10, 20, 30];
      const result = calculateSMA(prices, 1);

      expect(result).toEqual([10, 20, 30]);
    });

    it('should handle period equal to array length', () => {
      const prices = [10, 20, 30];
      const result = calculateSMA(prices, 3);

      expect(result).toEqual([20]);
    });

    it('should calculate correctly with decimal values', () => {
      const prices = [10.5, 20.5, 30.5];
      const result = calculateSMA(prices, 2);

      expect(result[0]).toBeCloseTo(15.5, 5);
      expect(result[1]).toBeCloseTo(25.5, 5);
    });
  });

  describe('calculateEMA', () => {
    it('should calculate EMA correctly', () => {
      const prices = [10, 20, 30, 40, 50];
      const result = calculateEMA(prices, 3);

      expect(result).toHaveLength(5);
      expect(result[0]).toBe(10); // First value is same as first price
      expect(result[1]).toBeGreaterThan(result[0]);
    });

    it('should return empty array for null input', () => {
      const result = calculateEMA(null, 3);

      expect(result).toEqual([]);
    });

    it('should return empty array for undefined input', () => {
      const result = calculateEMA(undefined, 3);

      expect(result).toEqual([]);
    });

    it('should return empty array for empty array', () => {
      const result = calculateEMA([], 3);

      expect(result).toEqual([]);
    });

    it('should give more weight to recent prices', () => {
      const prices = [100, 100, 100, 100, 150]; // Big jump at end
      const result = calculateEMA(prices, 3);

      // EMA should react to the jump
      expect(result[result.length - 1]).toBeGreaterThan(100);
      expect(result[result.length - 1]).toBeLessThan(150);
    });

    it('should handle single value array', () => {
      const result = calculateEMA([100], 3);

      expect(result).toEqual([100]);
    });
  });

  describe('calculateRSI', () => {
    it('should return null for insufficient data', () => {
      const prices = [10, 20, 30, 40, 50];
      const result = calculateRSI(prices, 14);

      expect(result).toBeNull();
    });

    it('should return null for null input', () => {
      const result = calculateRSI(null, 14);

      expect(result).toBeNull();
    });

    it('should return null for undefined input', () => {
      const result = calculateRSI(undefined, 14);

      expect(result).toBeNull();
    });

    it('should calculate RSI correctly with enough data', () => {
      // Generate sample data with upward trend
      const prices = [];
      for (let i = 0; i < 20; i++) {
        prices.push(100 + i * 2 + (Math.random() - 0.5) * 2);
      }

      const result = calculateRSI(prices, 14);

      expect(result).not.toBeNull();
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(100);
    });

    it('should return 100 for pure upward trend', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
      const result = calculateRSI(prices, 14);

      expect(result).toBe(100);
    });

    it('should use default period of 14', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
      const result = calculateRSI(prices);

      expect(result).not.toBeNull();
    });

    it('should handle custom period', () => {
      const prices = Array.from({ length: 15 }, (_, i) => 100 + i);
      const result = calculateRSI(prices, 7);

      expect(result).not.toBeNull();
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(100);
    });
  });

  describe('calculateMACD', () => {
    it('should return null values for insufficient data', () => {
      const prices = [10, 20, 30];
      const result = calculateMACD(prices);

      expect(result).toEqual({ macd: null, signal: null, histogram: null });
    });

    it('should return null values for null input', () => {
      const result = calculateMACD(null);

      expect(result).toEqual({ macd: null, signal: null, histogram: null });
    });

    it('should return null values for undefined input', () => {
      const result = calculateMACD(undefined);

      expect(result).toEqual({ macd: null, signal: null, histogram: null });
    });

    it('should calculate MACD correctly with sufficient data', () => {
      // Generate 30 data points
      const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
      const result = calculateMACD(prices);

      expect(result.macd).not.toBeNull();
      expect(result.signal).not.toBeNull();
      expect(result.histogram).not.toBeNull();
    });

    it('should have histogram = macd - signal', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);
      const result = calculateMACD(prices);

      if (result.macd !== null && result.signal !== null) {
        expect(result.histogram).toBeCloseTo(result.macd - result.signal, 5);
      }
    });

    it('should return positive MACD for upward trend', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + i * 2);
      const result = calculateMACD(prices);

      expect(result.macd).toBeGreaterThan(0);
    });
  });

  describe('calculateAllIndicators', () => {
    it('should return null values for empty price history', () => {
      const result = calculateAllIndicators([]);

      expect(result).toEqual({
        sma_50: null,
        sma_200: null,
        rsi_14: null,
        macd: { macd: null, signal: null, histogram: null },
      });
    });

    it('should return null values for null input', () => {
      const result = calculateAllIndicators(null);

      expect(result).toEqual({
        sma_50: null,
        sma_200: null,
        rsi_14: null,
        macd: { macd: null, signal: null, histogram: null },
      });
    });

    it('should calculate indicators for sufficient data', () => {
      const priceHistory = Array.from({ length: 250 }, (_, i) => ({
        date: new Date(2024, 0, i + 1),
        close: 100 + i + Math.sin(i / 10) * 10,
      }));

      const result = calculateAllIndicators(priceHistory);

      expect(result.sma_50).not.toBeNull();
      expect(result.sma_200).not.toBeNull();
      expect(result.rsi_14).not.toBeNull();
      expect(result.macd.macd).not.toBeNull();
    });

    it('should return null for SMA_200 with less than 200 data points', () => {
      const priceHistory = Array.from({ length: 100 }, (_, i) => ({
        date: new Date(2024, 0, i + 1),
        close: 100 + i,
      }));

      const result = calculateAllIndicators(priceHistory);

      expect(result.sma_50).not.toBeNull();
      expect(result.sma_200).toBeNull();
    });

    it('should handle price history with missing close values', () => {
      const priceHistory = [
        { date: new Date(), close: 100 },
        { date: new Date() },
        { date: new Date(), close: 110 },
      ];

      // Should not throw
      expect(() => calculateAllIndicators(priceHistory)).not.toThrow();
    });
  });
});
