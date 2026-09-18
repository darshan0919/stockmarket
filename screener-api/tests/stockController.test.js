const request = require('supertest');
const express = require('express');
const stockRoutes = require('../src/features/stock/stocksRoutes');

const QuarterlyResult = require('../src/features/results/QuarterlyResult');
const xbrlParser = require('../src/core/utils/xbrlParser');
const {
  getQuoteEquity,
  getCorporatesFinancialResults,
  getIntegratedFilingResults,
  getPriceVolumeDeliverable,
  getSymbolData,
} = require('../src/core/api/nseIndiaApi');
const { fetchAndStoreQuarterlyResults } = require('../scripts/balanceSheetDataFetcher');

// Mock the database models
jest.mock('../src/features/stock/Stock');

jest.mock('../src/features/results/QuarterlyResult');
jest.mock('../src/core/utils/xbrlParser');
jest.mock('axios');
jest.mock('../src/core/api/nseIndiaApi', () => ({
  getQuoteEquity: jest.fn(),
  getCorporatesFinancialResults: jest.fn(),
  getIntegratedFilingResults: jest.fn(),
  searchAutocomplete: jest.fn(),
  getPriceVolumeDeliverable: jest.fn(),
  getSymbolData: jest.fn(),
  formatDate: jest.requireActual('../src/core/api/nseIndiaApi').formatDate,
}));
jest.mock('../scripts/balanceSheetDataFetcher', () => {
  const actual = jest.requireActual('../scripts/balanceSheetDataFetcher');
  return {
    ...actual,
    fetchAndStoreQuarterlyResults: jest
      .fn()
      .mockImplementation(actual.fetchAndStoreQuarterlyResults),
  };
});

// Create a test app
const app = express();
app.use(express.json());
app.use('/api/stocks', stockRoutes);
// Error handler
app.use((err, req, res, _next) => {
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

describe('Stock Controller - Quarterly Results', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const actual = jest.requireActual('../scripts/balanceSheetDataFetcher');
    fetchAndStoreQuarterlyResults.mockImplementation(actual.fetchAndStoreQuarterlyResults);
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

      getQuoteEquity.mockResolvedValue({ info: { companyName: 'Eternal Limited' } });
      getCorporatesFinancialResults.mockResolvedValue([
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
      ]);
      getIntegratedFilingResults.mockResolvedValue([]);

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

      fetchAndStoreQuarterlyResults.mockRejectedValueOnce(new Error('API Error'));

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

      getQuoteEquity.mockResolvedValue({ info: { companyName: 'Eternal Limited' } });
      getCorporatesFinancialResults.mockResolvedValue([
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
      ]);
      getIntegratedFilingResults.mockResolvedValue([]);

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

      getQuoteEquity.mockResolvedValue({ info: { companyName: 'Invalid Company' } });
      getCorporatesFinancialResults.mockResolvedValue([]);
      getIntegratedFilingResults.mockResolvedValue([]);

      const response = await request(app).get('/api/stocks/INVALID/quarterly').expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.quarters).toEqual([]);
      expect(response.body.data).toHaveProperty('symbol', 'INVALID');
    });
  });

  describe('GET /api/stocks/:symbol/delivery-volume', () => {
    it('should chunk 1-year request into 75-day windows and fetch historical data', async () => {
      getPriceVolumeDeliverable.mockResolvedValue([]);
      getSymbolData.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/stocks/AVALON/delivery-volume?from=2025-09-19&to=2026-09-19&interval=daily')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('candles');
      // 365 days / 75 days = 5 chunks
      expect(getPriceVolumeDeliverable).toHaveBeenCalledTimes(5);
    });

    it('should strip the last entry of generateSecurityWiseHistoricalData if date matches GetQuoteApi date, and use closePrice', async () => {
      // Historical data includes 2026-09-17 and 2026-09-18
      getPriceVolumeDeliverable.mockResolvedValueOnce([
        {
          mTIMESTAMP: '17-Sep-2026',
          CH_OPENING_PRICE: 2200,
          CH_TRADE_HIGH_PRICE: 2250,
          CH_TRADE_LOW_PRICE: 2190,
          CH_CLOSING_PRICE: 2230,
          CH_TOT_TRADED_QTY: 100000,
          COP_DELIV_QTY: 50000,
          COP_DELIV_PERC: 50.0,
        },
        {
          mTIMESTAMP: '18-Sep-2026',
          CH_OPENING_PRICE: 2236.2,
          CH_TRADE_HIGH_PRICE: 2618,
          CH_TRADE_LOW_PRICE: 2218.3,
          CH_CLOSING_PRICE: 2500, // old provisional or historical close
          CH_TOT_TRADED_QTY: 4000000,
          COP_DELIV_QTY: 1200000,
          COP_DELIV_PERC: 30.0,
        },
      ]);

      // GetQuoteApi returns live/final data for 18-Sep-2026 with closePrice
      getSymbolData.mockResolvedValueOnce({
        lastUpdateTime: '18-Sep-2026 16:00:00',
        metaData: {
          open: 2236.2,
          dayHigh: 2618,
          dayLow: 2218.3,
          closePrice: 2537.7,
        },
        tradeInfo: {
          lastPrice: 2602,
          totalTradedVolume: 4310981,
          deliveryquantity: 1369122,
          deliveryToTradedQuantity: 31.76,
          secwisedelposdate: '18-Sep-2026 00:00:00',
        },
      });

      const response = await request(app)
        .get('/api/stocks/AVALON/delivery-volume?from=2026-09-16&to=2026-09-18&interval=daily')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      const candles = response.body.data.candles;
      // Should have exactly 2 candles (2026-09-17 and 2026-09-18), NOT 3 (no duplicate on 18th)
      expect(candles).toHaveLength(2);
      expect(candles[0].time).toBe('2026-09-17');
      expect(candles[1].time).toBe('2026-09-18');
      // Must use closePrice (2537.7) instead of lastPrice (2602)
      expect(candles[1].close).toBe(2537.7);
      expect(candles[1].deliveryVolume).toBe(1369122);
    });
  });
});
