/**
 * Unit tests for Formatters utility
 * @file frontend/lib/utils/__tests__/formatters.test.js
 * @see docs/frontend/utils/formatters.md for documentation
 */

import {
  formatCurrency,
  formatPrice,
  formatQuarterDate,
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

    it('should accept custom empty placeholder', () => {
      expect(formatCurrency(null, '-')).toBe('-');
      expect(formatCurrency(undefined, '-')).toBe('-');
    });
  });

  describe('formatPrice', () => {
    it('should format price as simple ₹X.XX', () => {
      expect(formatPrice(1234.56)).toBe('₹1234.56');
    });

    it('should return N/A for null', () => {
      expect(formatPrice(null)).toBe('N/A');
    });

    it('should accept custom empty placeholder', () => {
      expect(formatPrice(null, '-')).toBe('-');
    });

    it('should handle zero', () => {
      expect(formatPrice(0)).toBe('₹0.00');
    });
  });

  describe('formatQuarterDate', () => {
    it('should format YYYYMM to "Mon YYYY"', () => {
      expect(formatQuarterDate('202512')).toBe('Dec 2025');
      expect(formatQuarterDate('202401')).toBe('Jan 2024');
    });

    it('should return original string for invalid input', () => {
      expect(formatQuarterDate('')).toBe('');
      expect(formatQuarterDate('20251')).toBe('20251');
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

    it('should accept custom empty placeholder', () => {
      expect(formatPercent(null, 2, '-')).toBe('-');
      expect(formatPercent('', 2, '-')).toBe('-');
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
    it('should return success class for positive value', () => {
      expect(getChangeColor(10)).toBe('text-success');
    });

    it('should return error class for negative value', () => {
      expect(getChangeColor(-10)).toBe('text-error');
    });

    it('should return base-content/60 class for zero', () => {
      expect(getChangeColor(0)).toBe('text-base-content/60');
    });

    it('should return base-content/60 class for null', () => {
      expect(getChangeColor(null)).toBe('text-base-content/60');
    });

    it('should return base-content/60 class for undefined', () => {
      expect(getChangeColor(undefined)).toBe('text-base-content/60');
    });
  });

  describe('getChangeBgColor', () => {
    it('should return success bg class for positive value', () => {
      expect(getChangeBgColor(10)).toBe('bg-success/10 text-success');
    });

    it('should return error bg class for negative value', () => {
      expect(getChangeBgColor(-10)).toBe('bg-error/10 text-error');
    });

    it('should return base-200 bg class for zero', () => {
      expect(getChangeBgColor(0)).toBe('bg-base-200');
    });

    it('should return base-200 bg class for null', () => {
      expect(getChangeBgColor(null)).toBe('bg-base-200');
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
