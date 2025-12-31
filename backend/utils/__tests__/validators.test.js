/**
 * Unit tests for Validators utility
 * @file backend/utils/__tests__/validators.test.js
 * @see docs/backend/utils/validators.md for documentation
 */

const { screenerFiltersSchema, stockSymbolSchema, searchQuerySchema } = require('../validators');

describe('Validators', () => {
  describe('screenerFiltersSchema', () => {
    it('should validate empty filters', () => {
      const { error } = screenerFiltersSchema.validate({});

      expect(error).toBeUndefined();
    });

    it('should validate valid market cap filters', () => {
      const filters = {
        market_cap_min: 1000000000,
        market_cap_max: 10000000000,
      };
      const { error, value } = screenerFiltersSchema.validate(filters);

      expect(error).toBeUndefined();
      expect(value.market_cap_min).toBe(1000000000);
      expect(value.market_cap_max).toBe(10000000000);
    });

    it('should reject negative market cap', () => {
      const filters = {
        market_cap_min: -1000,
      };
      const { error } = screenerFiltersSchema.validate(filters);

      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('must be greater than or equal to 0');
    });

    it('should validate sectors array', () => {
      const filters = {
        sectors: ['Technology', 'Finance', 'Healthcare'],
      };
      const { error, value } = screenerFiltersSchema.validate(filters);

      expect(error).toBeUndefined();
      expect(value.sectors).toHaveLength(3);
    });

    it('should validate industries array', () => {
      const filters = {
        industries: ['IT Services', 'Banking'],
      };
      const { error, value } = screenerFiltersSchema.validate(filters);

      expect(error).toBeUndefined();
      expect(value.industries).toHaveLength(2);
    });

    it('should validate PE ratio range', () => {
      const filters = {
        pe_min: 0,
        pe_max: 50,
      };
      const { error, value } = screenerFiltersSchema.validate(filters);

      expect(error).toBeUndefined();
      expect(value.pe_min).toBe(0);
      expect(value.pe_max).toBe(50);
    });

    it('should allow negative PE (for loss-making companies)', () => {
      const filters = {
        pe_min: -10,
      };
      const { error } = screenerFiltersSchema.validate(filters);

      expect(error).toBeUndefined();
    });

    it('should validate PB ratio range', () => {
      const filters = {
        pb_min: 0.5,
        pb_max: 10,
      };
      const { error, value } = screenerFiltersSchema.validate(filters);

      expect(error).toBeUndefined();
      expect(value.pb_min).toBe(0.5);
      expect(value.pb_max).toBe(10);
    });

    it('should validate ROE range', () => {
      const filters = {
        roe_min: 15,
        roe_max: 50,
      };
      const { error, value } = screenerFiltersSchema.validate(filters);

      expect(error).toBeUndefined();
    });

    it('should validate ROCE range', () => {
      const filters = {
        roce_min: 12,
        roce_max: 40,
      };
      const { error, value } = screenerFiltersSchema.validate(filters);

      expect(error).toBeUndefined();
    });

    it('should validate debt to equity max', () => {
      const filters = {
        debt_to_equity_max: 1.5,
      };
      const { error, value } = screenerFiltersSchema.validate(filters);

      expect(error).toBeUndefined();
      expect(value.debt_to_equity_max).toBe(1.5);
    });

    it('should reject negative debt to equity', () => {
      const filters = {
        debt_to_equity_max: -0.5,
      };
      const { error } = screenerFiltersSchema.validate(filters);

      expect(error).toBeDefined();
    });

    it('should validate growth metrics', () => {
      const filters = {
        revenue_growth_3y_min: 10,
        profit_growth_3y_min: 15,
      };
      const { error, value } = screenerFiltersSchema.validate(filters);

      expect(error).toBeUndefined();
    });

    it('should validate dividend yield range', () => {
      const filters = {
        dividend_yield_min: 1,
        dividend_yield_max: 10,
      };
      const { error, value } = screenerFiltersSchema.validate(filters);

      expect(error).toBeUndefined();
    });

    it('should reject negative dividend yield min', () => {
      const filters = {
        dividend_yield_min: -1,
      };
      const { error } = screenerFiltersSchema.validate(filters);

      expect(error).toBeDefined();
    });

    it('should validate current ratio min', () => {
      const filters = {
        current_ratio_min: 1.5,
      };
      const { error, value } = screenerFiltersSchema.validate(filters);

      expect(error).toBeUndefined();
      expect(value.current_ratio_min).toBe(1.5);
    });

    it('should reject negative current ratio', () => {
      const filters = {
        current_ratio_min: -1,
      };
      const { error } = screenerFiltersSchema.validate(filters);

      expect(error).toBeDefined();
    });

    it('should validate sort_by field', () => {
      const validSortFields = ['market_cap', 'pe_ratio', 'pb_ratio', 'roe', 'roce'];

      validSortFields.forEach((field) => {
        const { error } = screenerFiltersSchema.validate({ sort_by: field });
        expect(error).toBeUndefined();
      });
    });

    it('should reject invalid sort_by field', () => {
      const { error } = screenerFiltersSchema.validate({ sort_by: 'invalid_field' });

      expect(error).toBeDefined();
    });

    it('should validate sort_order field', () => {
      const { error: ascError } = screenerFiltersSchema.validate({ sort_order: 'asc' });
      const { error: descError } = screenerFiltersSchema.validate({ sort_order: 'desc' });

      expect(ascError).toBeUndefined();
      expect(descError).toBeUndefined();
    });

    it('should reject invalid sort_order', () => {
      const { error } = screenerFiltersSchema.validate({ sort_order: 'random' });

      expect(error).toBeDefined();
    });

    it('should validate limit within bounds', () => {
      const { error: minError } = screenerFiltersSchema.validate({ limit: 1 });
      const { error: maxError } = screenerFiltersSchema.validate({ limit: 1000 });

      expect(minError).toBeUndefined();
      expect(maxError).toBeUndefined();
    });

    it('should reject limit below 1', () => {
      const { error } = screenerFiltersSchema.validate({ limit: 0 });

      expect(error).toBeDefined();
    });

    it('should reject limit above 1000', () => {
      const { error } = screenerFiltersSchema.validate({ limit: 1001 });

      expect(error).toBeDefined();
    });

    it('should validate complex filter combination', () => {
      const filters = {
        market_cap_min: 1000000000,
        market_cap_max: 100000000000,
        sectors: ['Technology', 'Healthcare'],
        pe_min: 10,
        pe_max: 30,
        roe_min: 15,
        debt_to_equity_max: 1,
        sort_by: 'market_cap',
        sort_order: 'desc',
        limit: 50,
      };
      const { error, value } = screenerFiltersSchema.validate(filters);

      expect(error).toBeUndefined();
      expect(value).toMatchObject(filters);
    });
  });

  describe('stockSymbolSchema', () => {
    it('should validate valid stock symbol', () => {
      const { error, value } = stockSymbolSchema.validate('RELIANCE');

      expect(error).toBeUndefined();
      expect(value).toBe('RELIANCE');
    });

    it('should convert symbol to uppercase', () => {
      const { error, value } = stockSymbolSchema.validate('reliance');

      expect(error).toBeUndefined();
      expect(value).toBe('RELIANCE');
    });

    it('should reject empty symbol', () => {
      const { error } = stockSymbolSchema.validate('');

      expect(error).toBeDefined();
    });

    it('should reject symbol longer than 20 characters', () => {
      const { error } = stockSymbolSchema.validate('ABCDEFGHIJKLMNOPQRSTUVWXYZ');

      expect(error).toBeDefined();
    });

    it('should validate short symbols', () => {
      const { error } = stockSymbolSchema.validate('A');

      expect(error).toBeUndefined();
    });

    it('should validate symbols with numbers', () => {
      const { error, value } = stockSymbolSchema.validate('M&M');

      expect(error).toBeUndefined();
    });
  });

  describe('searchQuerySchema', () => {
    it('should validate valid search query', () => {
      const { error, value } = searchQuerySchema.validate('Reliance Industries');

      expect(error).toBeUndefined();
      expect(value).toBe('Reliance Industries');
    });

    it('should reject empty query', () => {
      const { error } = searchQuerySchema.validate('');

      expect(error).toBeDefined();
    });

    it('should reject query longer than 100 characters', () => {
      const longQuery = 'A'.repeat(101);
      const { error } = searchQuerySchema.validate(longQuery);

      expect(error).toBeDefined();
    });

    it('should validate single character query', () => {
      const { error } = searchQuerySchema.validate('R');

      expect(error).toBeUndefined();
    });

    it('should validate query with special characters', () => {
      const { error } = searchQuerySchema.validate('M&M Financial');

      expect(error).toBeUndefined();
    });
  });
});
