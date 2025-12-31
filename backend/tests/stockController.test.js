const request = require('supertest');
const express = require('express');
const stockRoutes = require('../routes/stocks');
const Stock = require('../models/Stock');
const FinancialStatement = require('../models/FinancialStatement');
const QuarterlyResult = require('../models/QuarterlyResult');
const xbrlParser = require('../utils/xbrlParser');
const axios = require('axios');

// Mock the database models
jest.mock('../models/Stock');
jest.mock('../models/FinancialStatement');
jest.mock('../models/QuarterlyResult');
jest.mock('../utils/xbrlParser');
jest.mock('axios');

// Create a test app
const app = express();
app.use(express.json());
app.use('/api/stocks', stockRoutes);
// Error handler
app.use((err, req, res, next) => {
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

describe('Stock Controller - Quarterly Results', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/stocks/:symbol/quarterly', () => {
    it('should return cached quarterly results when available', async () => {
      // Mock cached results from database
      const mockCachedData = [
        {
          symbol: 'ETERNAL',
          period: 'Q1 2024',
          to_date: new Date('2024-03-31'),
          from_date: new Date('2024-01-01'),
          revenue: 3562,
          net_profit: 175,
          eps_basic: 0.2,
          audited: true,
          last_updated: new Date(),
        },
        {
          symbol: 'ETERNAL',
          period: 'Q2 2024',
          to_date: new Date('2024-06-30'),
          from_date: new Date('2024-04-01'),
          revenue: 4206,
          net_profit: 253,
          eps_basic: 0.29,
          audited: false,
          last_updated: new Date(),
        },
      ];

      QuarterlyResult.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockCachedData),
      });

      const response = await request(app)
        .get('/api/stocks/ETERNAL/quarterly')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('symbol', 'ETERNAL');
      expect(response.body.data).toHaveProperty('cached', true);
      expect(response.body.data).toHaveProperty('source', 'Database Cache (NSE India)');
      expect(response.body.data.quarters.length).toBeGreaterThanOrEqual(1);
      expect(QuarterlyResult.find).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: 'ETERNAL' })
      );
    });

    it('should fetch and parse XBRL when cache is empty', async () => {
      // Mock empty cache
      QuarterlyResult.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      const mockSavedResult = {
        _id: 'mock-id',
        symbol: 'ETERNAL',
        period: 'Q1 2024',
        to_date: new Date('2024-03-31'),
        from_date: new Date('2024-01-01'),
        revenue: 3562,
        net_profit: 175,
        eps_basic: 0.2,
        operating_profit: 161,
        opm_percent: 4.52,
        audited: true,
      };

      QuarterlyResult.findOne = jest.fn().mockResolvedValue(null);
      QuarterlyResult.findOneAndUpdate = jest.fn().mockResolvedValue(mockSavedResult);

      // Mock NSE API responses
      axios.get = jest
        .fn()
        .mockResolvedValueOnce({
          data: { info: { companyName: 'Eternal Limited' } },
        })
        .mockResolvedValueOnce({
          data: [
            {
              xbrl: 'https://example.com/xbrl1.xml',
              companyName: 'Eternal Limited',
              consolidated: 'Consolidated',
              audited: 'Audited',
              fromDate: '01-Jan-2024',
              toDate: '31-Mar-2024',
              filingDate: '15-May-2024',
              seqNumber: 'SEQ001',
            },
          ],
        });

      // Mock XBRL parser
      xbrlParser.parseXBRL = jest.fn().mockResolvedValue({
        revenue: 3562,
        net_profit: 175,
        eps_basic: 0.2,
        operating_profit: 161,
        opm_percent: 4.52,
      });

      const response = await request(app).get('/api/stocks/ETERNAL/quarterly').expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('symbol', 'ETERNAL');
      // Should have fetched and parsed data (might be cached or fresh depending on timing)
      expect(response.body.data).toHaveProperty('quarters');
      expect(Array.isArray(response.body.data.quarters)).toBe(true);
    });

    it('should return correct quarter structure', async () => {
      const mockCachedData = [
        {
          symbol: 'ETERNAL',
          period: 'Q1 2024',
          to_date: new Date('2024-03-31'),
          from_date: new Date('2024-01-01'),
          revenue: 3562,
          other_income: 235,
          total_expenses: 3636,
          operating_profit: 161,
          opm_percent: 4.52,
          finance_costs: 20,
          depreciation: 140,
          profit_before_tax: 161,
          tax_percent: -8.7,
          net_profit: 175,
          eps_basic: 0.2,
          audited: true,
          last_updated: new Date(),
        },
      ];

      QuarterlyResult.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockCachedData),
      });

      const response = await request(app).get('/api/stocks/ETERNAL/quarterly').expect(200);

      const quarter = response.body.data.quarters[0];

      // Check required fields exist
      expect(quarter).toHaveProperty('period', 'Q1 2024');
      expect(quarter).toHaveProperty('sales', 3562);
      expect(quarter).toHaveProperty('operating_profit', 161);
      expect(quarter).toHaveProperty('opm_percent', 4.52);
      expect(quarter).toHaveProperty('other_income', 235);
      expect(quarter).toHaveProperty('interest', 20);
      expect(quarter).toHaveProperty('depreciation', 140);
      expect(quarter).toHaveProperty('pbt', 161);
      expect(quarter).toHaveProperty('net_profit', 175);
      expect(quarter).toHaveProperty('eps', 0.2);
      expect(quarter).toHaveProperty('audited', true);
    });

    it('should fallback to database on API error', async () => {
      // Mock cache miss
      QuarterlyResult.find = jest
        .fn()
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([
            {
              symbol: 'ETERNAL',
              period: 'Q1 2024',
              to_date: new Date('2024-03-31'),
              from_date: new Date('2024-01-01'),
              revenue: 3562,
              net_profit: 175,
              eps_basic: 0.2,
              audited: true,
            },
          ]),
        });

      // Mock API failure
      axios.get = jest.fn().mockRejectedValue(new Error('API Error'));

      const response = await request(app).get('/api/stocks/ETERNAL/quarterly').expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('cached', true);
      expect(response.body.data).toHaveProperty('source', 'Database Cache (Fallback)');
      expect(response.body.data).toHaveProperty('warning', 'Using cached data due to API error');
    });

    it('should handle force_refresh query parameter', async () => {
      const mockSavedResult = {
        _id: 'mock-id',
        symbol: 'ETERNAL',
        period: 'Q1 2024',
        to_date: new Date('2024-03-31'),
        from_date: new Date('2024-01-01'),
        revenue: 3562,
        net_profit: 175,
        audited: true,
      };

      QuarterlyResult.findOne = jest.fn().mockResolvedValue(null);
      QuarterlyResult.findOneAndUpdate = jest.fn().mockResolvedValue(mockSavedResult);

      axios.get = jest
        .fn()
        .mockResolvedValueOnce({
          data: { info: { companyName: 'Eternal Limited' } },
        })
        .mockResolvedValueOnce({
          data: [
            {
              xbrl: 'https://example.com/xbrl1.xml',
              companyName: 'Eternal Limited',
              consolidated: 'Consolidated',
              audited: 'Audited',
              fromDate: '01-Jan-2024',
              toDate: '31-Mar-2024',
              filingDate: '15-May-2024',
              seqNumber: 'SEQ001',
            },
          ],
        });

      xbrlParser.parseXBRL = jest.fn().mockResolvedValue({
        revenue: 3562,
        net_profit: 175,
      });

      const response = await request(app)
        .get('/api/stocks/ETERNAL/quarterly?force_refresh=true')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('symbol', 'ETERNAL');
      expect(response.body.data).toHaveProperty('quarters');
    });

    it('should return empty quarters when no data available', async () => {
      QuarterlyResult.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      axios.get = jest
        .fn()
        .mockResolvedValueOnce({
          data: { info: { companyName: 'Invalid Company' } },
        })
        .mockResolvedValueOnce({
          data: [],
        });

      const response = await request(app).get('/api/stocks/INVALID/quarterly').expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.quarters).toEqual([]);
      expect(response.body.data).toHaveProperty('message', 'No quarterly results available');
    });
  });

  describe('GET /api/stocks/:symbol/financials', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return financial statements for a valid stock', async () => {
      const mockStock = {
        symbol: 'RELIANCE',
        name: 'Reliance Industries Ltd',
      };

      const mockFinancials = [
        {
          symbol: 'RELIANCE',
          period: 'FY2023',
          type: 'annual',
          revenue: 800000,
          net_profit: 70000,
          total_assets: 1500000,
          total_liabilities: 800000,
        },
      ];

      Stock.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockStock),
      });

      FinancialStatement.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockFinancials),
      });

      const response = await request(app).get('/api/stocks/RELIANCE/financials').expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('p_and_l');
      expect(response.body.data).toHaveProperty('balance_sheet');
    });

    it('should return empty financials if stock not found', async () => {
      Stock.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const response = await request(app).get('/api/stocks/NONEXISTENT/financials').expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('p_and_l', []);
      expect(response.body.data).toHaveProperty('balance_sheet', []);
      expect(response.body.data).toHaveProperty(
        'message',
        'Historical financial data not available in database'
      );
    });

    it('should handle database errors gracefully', async () => {
      Stock.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockRejectedValue(new Error('Database error')),
      });

      const response = await request(app).get('/api/stocks/ERROR/financials').expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });
  });
});
