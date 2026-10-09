'use strict';

const { fetchDailyCandles } = require('../src/fetchers/dailyCandlesFetcher');

describe('fetchDailyCandles', () => {
  let mockNse;
  let mockStockscans;

  beforeEach(() => {
    mockNse = {
      getHistoricalOhlcv: jest.fn(),
    };
    mockStockscans = {
      ohlcv: jest.fn(),
    };
  });

  test('uses NSE MCP as primary source for NSE symbols', async () => {
    mockNse.getHistoricalOhlcv.mockResolvedValue([
      {
        date: '2026-10-09',
        open: 100,
        high: 110,
        low: 95,
        close: 108,
        volume: 50000,
        prevClose: 102,
        totalTradedValue: 5000000,
        series: 'EQ',
      },
    ]);

    const res = await fetchDailyCandles('NSE:TCS', {
      months: 1,
      nseClient: mockNse,
      stockscansClient: mockStockscans,
    });

    expect(mockNse.getHistoricalOhlcv).toHaveBeenCalledWith('TCS', {
      months: 1,
      endDate: 'today',
    });
    expect(mockStockscans.ohlcv).not.toHaveBeenCalled();
    expect(res.source).toBe('nse');
    expect(res.candles).toHaveLength(1);
    expect(res.candles[0].close).toBe(108);
  });

  test('falls back to Stockscans when NSE MCP throws or fails', async () => {
    mockNse.getHistoricalOhlcv.mockRejectedValue(new Error('Connection timeout'));
    mockStockscans.ohlcv.mockResolvedValue({
      companyId: 'NSE:TCS',
      prices: [['2026-10-09', 100, 110, 95, 108, 50000]],
    });

    const res = await fetchDailyCandles('NSE:TCS', {
      months: 1,
      nseClient: mockNse,
      stockscansClient: mockStockscans,
    });

    expect(mockNse.getHistoricalOhlcv).toHaveBeenCalled();
    expect(mockStockscans.ohlcv).toHaveBeenCalledWith('NSE:TCS', { tf: '1D' });
    expect(res.source).toBe('stockscans');
    expect(res.candles).toHaveLength(1);
    expect(res.candles[0].close).toBe(108);
  });

  test('routes BSE symbols directly to Stockscans without calling NSE', async () => {
    mockStockscans.ohlcv.mockResolvedValue({
      companyId: 'BSE:500325',
      prices: [['2026-10-09', 200, 210, 195, 205, 30000]],
    });

    const res = await fetchDailyCandles('BSE:500325', {
      nseClient: mockNse,
      stockscansClient: mockStockscans,
    });

    expect(mockNse.getHistoricalOhlcv).not.toHaveBeenCalled();
    expect(mockStockscans.ohlcv).toHaveBeenCalledWith('BSE:500325', { tf: '1D' });
    expect(res.source).toBe('stockscans');
    expect(res.candles[0].close).toBe(205);
  });
});
