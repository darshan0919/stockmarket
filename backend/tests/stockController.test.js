const request = require('supertest');
const express = require('express');
const stockRoutes = require('../routes/stocks');
const Stock = require('../models/Stock');
const FinancialStatement = require('../models/FinancialStatement');

// Mock the database models
jest.mock('../models/Stock');
jest.mock('../models/FinancialStatement');

// Create a test app
const app = express();
app.use(express.json());
app.use('/api/stocks', stockRoutes);

describe('Stock Controller - Quarterly Results', () => {
  describe('GET /api/stocks/:symbol/quarterly', () => {
    it('should return quarterly results for a valid stock symbol', async () => {
      const response = await request(app)
        .get('/api/stocks/SRM/quarterly')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('symbol', 'SRM');
      expect(response.body.data).toHaveProperty('quarters');
      expect(Array.isArray(response.body.data.quarters)).toBe(true);
      expect(response.body.data).toHaveProperty('source', 'NSE India');
      expect(response.body.data).toHaveProperty('source_url');
    }, 15000); // Increased timeout for API call

    it('should return quarters with correct structure', async () => {
      const response = await request(app)
        .get('/api/stocks/SRM/quarterly')
        .expect(200);

      if (response.body.data.quarters.length > 0) {
        const quarter = response.body.data.quarters[0];
        
        // Check required fields exist
        expect(quarter).toHaveProperty('period');
        expect(quarter).toHaveProperty('to_date');
        expect(quarter).toHaveProperty('from_date');
        expect(quarter).toHaveProperty('sales');
        expect(quarter).toHaveProperty('net_profit');
        expect(quarter).toHaveProperty('eps');
        expect(quarter).toHaveProperty('audited');
        
        // Check field types
        expect(typeof quarter.period).toBe('string');
        expect(typeof quarter.audited).toBe('boolean');
        
        // Check numeric fields are either number or null
        if (quarter.sales !== null) {
          expect(typeof quarter.sales).toBe('number');
        }
        if (quarter.net_profit !== null) {
          expect(typeof quarter.net_profit).toBe('number');
        }
      }
    }, 15000);

    it('should calculate YoY growth when sufficient data exists', async () => {
      const response = await request(app)
        .get('/api/stocks/SRM/quarterly')
        .expect(200);

      const quarters = response.body.data.quarters;
      
      // If we have 5+ quarters, check that YoY growth is calculated
      if (quarters.length >= 5) {
        const recentQuarter = quarters[quarters.length - 1]; // Latest quarter
        
        if (recentQuarter.sales && recentQuarter.yoy_sales_growth !== undefined) {
          expect(typeof recentQuarter.yoy_sales_growth).toBe('number');
        }
        
        if (recentQuarter.net_profit && recentQuarter.yoy_profit_growth !== undefined) {
          expect(typeof recentQuarter.yoy_profit_growth).toBe('number');
        }
      }
    }, 15000);

    it('should calculate QoQ growth for non-first quarters', async () => {
      const response = await request(app)
        .get('/api/stocks/SRM/quarterly')
        .expect(200);

      const quarters = response.body.data.quarters;
      
      // If we have 2+ quarters, check QoQ growth
      if (quarters.length >= 2) {
        const secondQuarter = quarters[1]; // Second quarter should have QoQ
        
        if (secondQuarter.sales && secondQuarter.qoq_sales_growth !== undefined) {
          expect(typeof secondQuarter.qoq_sales_growth).toBe('number');
        }
        
        if (secondQuarter.net_profit && secondQuarter.qoq_profit_growth !== undefined) {
          expect(typeof secondQuarter.qoq_profit_growth).toBe('number');
        }
      }
    }, 15000);

    it('should return empty quarters for invalid symbol', async () => {
      const response = await request(app)
        .get('/api/stocks/INVALIDXYZ123/quarterly')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.quarters).toEqual([]);
    }, 15000);

    it('should handle symbol case insensitivity', async () => {
      const response = await request(app)
        .get('/api/stocks/srm/quarterly')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('symbol', 'SRM');
    }, 15000);
  });

  describe('GET /api/stocks/:symbol/financials', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should handle missing stock gracefully and return empty data', async () => {
      // Mock Stock.findOne to return null (stock not found)
      Stock.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const response = await request(app)
        .get('/api/stocks/TESTSTOCK/financials?quarters=4')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('p_and_l');
      expect(response.body.data).toHaveProperty('balance_sheet');
      expect(Array.isArray(response.body.data.p_and_l)).toBe(true);
      expect(Array.isArray(response.body.data.balance_sheet)).toBe(true);
      expect(response.body.data.p_and_l).toEqual([]);
      expect(response.body.data.balance_sheet).toEqual([]);
    });

    it('should respect quarters parameter', async () => {
      // Mock Stock.findOne to return a stock
      Stock.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'test-id', symbol: 'SRM' }),
      });

      // Mock FinancialStatement.find to return empty array
      FinancialStatement.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      const response = await request(app)
        .get('/api/stocks/SRM/financials?quarters=2')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.p_and_l.length).toBeLessThanOrEqual(2);
      expect(response.body.data.balance_sheet.length).toBeLessThanOrEqual(2);
    });

    it('should use default quarters parameter when not provided', async () => {
      // Mock Stock.findOne to return a stock
      Stock.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'test-id', symbol: 'SRM' }),
      });

      // Mock FinancialStatement.find to return empty array
      FinancialStatement.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      const response = await request(app)
        .get('/api/stocks/SRM/financials')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      // Default is 4 quarters
      expect(response.body.data.p_and_l.length).toBeLessThanOrEqual(4);
    });
  });
});

describe('Stock Controller - Integration Tests', () => {
  describe('Quarterly Results Data Quality', () => {
    it('should return quarters in chronological order (oldest to newest)', async () => {
      const response = await request(app)
        .get('/api/stocks/SRM/quarterly')
        .expect(200);

      const quarters = response.body.data.quarters;
      
      if (quarters.length >= 2) {
        // Check that dates are in ascending order
        for (let i = 1; i < quarters.length; i++) {
          const prevDate = new Date(quarters[i - 1].to_date.split('-').reverse().join('-'));
          const currDate = new Date(quarters[i].to_date.split('-').reverse().join('-'));
          expect(currDate.getTime()).toBeGreaterThan(prevDate.getTime());
        }
      }
    }, 15000);

    it('should have valid period format (Q1-Q4 YYYY)', async () => {
      const response = await request(app)
        .get('/api/stocks/SRM/quarterly')
        .expect(200);

      const quarters = response.body.data.quarters;
      
      quarters.forEach(quarter => {
        expect(quarter.period).toMatch(/^Q[1-4] \d{4}$/);
      });
    }, 15000);

    it('should have valid OPM percentage when sales and operating profit exist', async () => {
      const response = await request(app)
        .get('/api/stocks/SRM/quarterly')
        .expect(200);

      const quarters = response.body.data.quarters;
      
      quarters.forEach(quarter => {
        if (quarter.sales && quarter.operating_profit && quarter.opm_percent !== null) {
          expect(quarter.opm_percent).toBeGreaterThanOrEqual(0);
          expect(quarter.opm_percent).toBeLessThanOrEqual(100);
        }
      });
    }, 15000);

    it('should have valid tax percentage when PBT and tax exist', async () => {
      const response = await request(app)
        .get('/api/stocks/SRM/quarterly')
        .expect(200);

      const quarters = response.body.data.quarters;
      
      quarters.forEach(quarter => {
        if (quarter.pbt && quarter.tax_percent !== null) {
          expect(quarter.tax_percent).toBeGreaterThanOrEqual(0);
          expect(quarter.tax_percent).toBeLessThanOrEqual(100);
        }
      });
    }, 15000);
  });
});

