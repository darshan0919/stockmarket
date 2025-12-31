/**
 * Unit tests for Formatters utility
 * @file frontend/lib/utils/__tests__/formatters.test.js
 * @see docs/frontend/utils/formatters.md for documentation
 */

import {
  formatCurrency,
  formatLargeNumber,
  formatPercent,
  formatPercentage,
  formatNumber,
  formatDate,
  formatChartDate,
  getChangeColor,
  getChangeBgColor,
  formatChange,
} from '../formatters';

describe('Formatters', () => {
  describe('formatCurrency', () => {
    it('should format currency in Indian format', () => {
      const result = formatCurrency(1234.56);
      expect(result).toContain('₹');
      expect(result).toContain('1,234.56');
    });

    it('should return N/A for null', () => {
      expect(formatCurrency(null)).toBe('N/A');
    });

    it('should return N/A for undefined', () => {
      expect(formatCurrency(undefined)).toBe('N/A');
    });

    it('should return N/A for NaN string', () => {
      expect(formatCurrency('not a number')).toBe('N/A');
    });

    it('should handle zero', () => {
      const result = formatCurrency(0);
      expect(result).toContain('₹');
      expect(result).toContain('0');
    });

    it('should handle negative numbers', () => {
      const result = formatCurrency(-1234.56);
      expect(result).toContain('-');
    });

    it('should handle string numbers', () => {
      const result = formatCurrency('1234.56');
      expect(result).toContain('₹');
    });

    it('should limit decimal places to 2', () => {
      const result = formatCurrency(1234.5678);
      expect(result).toMatch(/1,234\.57|1,234\.56/); // Rounded
    });
  });

  describe('formatLargeNumber', () => {
    it('should format billions', () => {
      expect(formatLargeNumber(1500000000)).toBe('₹1.50B');
    });

    it('should format crores', () => {
      expect(formatLargeNumber(15000000)).toBe('₹1.50Cr');
    });

    it('should format lakhs', () => {
      expect(formatLargeNumber(150000)).toBe('₹1.50L');
    });

    it('should format thousands', () => {
      expect(formatLargeNumber(1500)).toBe('₹1.50K');
    });

    it('should format small numbers without suffix', () => {
      expect(formatLargeNumber(150)).toBe('₹150.00');
    });

    it('should return N/A for null', () => {
      expect(formatLargeNumber(null)).toBe('N/A');
    });

    it('should return N/A for undefined', () => {
      expect(formatLargeNumber(undefined)).toBe('N/A');
    });

    it('should return N/A for NaN', () => {
      expect(formatLargeNumber('invalid')).toBe('N/A');
    });

    it('should handle zero', () => {
      expect(formatLargeNumber(0)).toBe('₹0.00');
    });

    it('should handle string numbers', () => {
      expect(formatLargeNumber('1500000000')).toBe('₹1.50B');
    });
  });

  describe('formatPercent', () => {
    it('should format percentage with default decimals', () => {
      expect(formatPercent(12.5)).toBe('12.50%');
    });

    it('should format with custom decimals', () => {
      expect(formatPercent(12.567, 1)).toBe('12.6%');
    });

    it('should return N/A for null', () => {
      expect(formatPercent(null)).toBe('N/A');
    });

    it('should return N/A for undefined', () => {
      expect(formatPercent(undefined)).toBe('N/A');
    });

    it('should handle zero', () => {
      expect(formatPercent(0)).toBe('0.00%');
    });

    it('should handle negative values', () => {
      expect(formatPercent(-5.5)).toBe('-5.50%');
    });

    it('should handle string numbers', () => {
      expect(formatPercent('12.5')).toBe('12.50%');
    });
  });

  describe('formatPercentage', () => {
    it('should add positive sign for positive values', () => {
      expect(formatPercentage(12.5)).toBe('+12.50%');
    });

    it('should show negative sign for negative values', () => {
      expect(formatPercentage(-5.5)).toBe('-5.50%');
    });

    it('should add positive sign for zero', () => {
      expect(formatPercentage(0)).toBe('+0.00%');
    });

    it('should return N/A for null', () => {
      expect(formatPercentage(null)).toBe('N/A');
    });

    it('should return N/A for undefined', () => {
      expect(formatPercentage(undefined)).toBe('N/A');
    });

    it('should handle custom decimals', () => {
      expect(formatPercentage(12.567, 1)).toBe('+12.6%');
    });
  });

  describe('formatNumber', () => {
    it('should format number with default decimals', () => {
      expect(formatNumber(12.5)).toBe('12.50');
    });

    it('should format with custom decimals', () => {
      expect(formatNumber(12.567, 1)).toBe('12.6');
    });

    it('should return N/A for null', () => {
      expect(formatNumber(null)).toBe('N/A');
    });

    it('should return N/A for undefined', () => {
      expect(formatNumber(undefined)).toBe('N/A');
    });

    it('should handle zero', () => {
      expect(formatNumber(0)).toBe('0.00');
    });

    it('should handle negative values', () => {
      expect(formatNumber(-12.5)).toBe('-12.50');
    });
  });

  describe('formatDate', () => {
    it('should format date in Indian format', () => {
      const result = formatDate('2024-01-15');
      expect(result).toContain('Jan');
      expect(result).toContain('15');
      expect(result).toContain('2024');
    });

    it('should return N/A for null', () => {
      expect(formatDate(null)).toBe('N/A');
    });

    it('should return N/A for undefined', () => {
      expect(formatDate(undefined)).toBe('N/A');
    });

    it('should return N/A for invalid date', () => {
      expect(formatDate('invalid')).toBe('N/A');
    });

    it('should handle Date objects', () => {
      const result = formatDate(new Date('2024-01-15'));
      expect(result).toContain('Jan');
    });
  });

  describe('formatChartDate', () => {
    it('should format date in short format', () => {
      const result = formatChartDate('2024-01-15');
      expect(result).toContain('Jan');
      expect(result).toMatch(/24|2024/);
    });

    it('should return empty string for null', () => {
      expect(formatChartDate(null)).toBe('');
    });

    it('should return empty string for invalid date', () => {
      expect(formatChartDate('invalid')).toBe('');
    });
  });

  describe('getChangeColor', () => {
    it('should return positive class for positive value', () => {
      expect(getChangeColor(10)).toBe('text-positive');
    });

    it('should return negative class for negative value', () => {
      expect(getChangeColor(-10)).toBe('text-negative');
    });

    it('should return gray class for zero', () => {
      expect(getChangeColor(0)).toBe('text-gray-600');
    });

    it('should return gray class for null', () => {
      expect(getChangeColor(null)).toBe('text-gray-600');
    });

    it('should return gray class for undefined', () => {
      expect(getChangeColor(undefined)).toBe('text-gray-600');
    });
  });

  describe('getChangeBgColor', () => {
    it('should return positive bg class for positive value', () => {
      expect(getChangeBgColor(10)).toBe('bg-positive');
    });

    it('should return negative bg class for negative value', () => {
      expect(getChangeBgColor(-10)).toBe('bg-negative');
    });

    it('should return gray bg class for zero', () => {
      expect(getChangeBgColor(0)).toBe('bg-gray-100');
    });

    it('should return gray bg class for null', () => {
      expect(getChangeBgColor(null)).toBe('bg-gray-100');
    });
  });

  describe('formatChange', () => {
    it('should add positive sign for positive value', () => {
      expect(formatChange(12.5)).toBe('+12.50');
    });

    it('should show negative sign for negative value', () => {
      expect(formatChange(-5.5)).toBe('-5.50');
    });

    it('should return N/A for null', () => {
      expect(formatChange(null)).toBe('N/A');
    });

    it('should return N/A for undefined', () => {
      expect(formatChange(undefined)).toBe('N/A');
    });

    it('should handle custom decimals', () => {
      expect(formatChange(12.567, 1)).toBe('+12.6');
    });
  });
});
