'use strict';

const { NseClient } = require('../src/clients/NseClient');
const { NseMcpSession } = require('../src/http/nseMcpSession');

describe('NseClient MCP-backed methods', () => {
  let mcpSession;
  let client;

  beforeEach(() => {
    mcpSession = {
      callTool: jest.fn(),
    };
    client = new NseClient({ mcpSession });
  });

  describe('getHistoricalOhlcv', () => {
    test('normalizes raw bhavcopy rows into ascending candles', async () => {
      mcpSession.callTool.mockResolvedValue({
        symbol: 'INFY',
        trading_days: 2,
        data: [
          {
            date: '2026-10-09',
            open: 1010,
            high: 1030,
            low: 1005,
            close: 1023.4,
            prevClose: 997,
            volume: 14094234,
            totalTradedValue: 14350000000,
            series: 'EQ',
          },
          {
            date: '2026-10-08',
            open: 995,
            high: 1002,
            low: 990,
            close: 997,
            prevClose: 992,
            volume: 14847874,
            totalTradedValue: 14800000000,
            series: 'EQ',
          },
        ],
      });

      const candles = await client.getHistoricalOhlcv('NSE:INFY', { months: 1 });

      expect(mcpSession.callTool).toHaveBeenCalledWith(
        NseMcpSession.BHAVCOPY_URL,
        'get_stock_history',
        {
          symbol: 'INFY',
          months: 1,
          endDate: 'today',
        }
      );

      // Verify sorted ascending by date
      expect(candles).toHaveLength(2);
      expect(candles[0].date).toBe('2026-10-08');
      expect(candles[0].close).toBe(997);
      expect(candles[1].date).toBe('2026-10-09');
      expect(candles[1].close).toBe(1023.4);
    });

    test('handles empty data payload gracefully', async () => {
      mcpSession.callTool.mockResolvedValue({});
      const candles = await client.getHistoricalOhlcv('TCS');
      expect(candles).toEqual([]);
    });
  });

  describe('searchSymbols and lookupSymbol', () => {
    test('searchSymbols passes query to search_symbols tool', async () => {
      const mockResult = {
        query: 'ZOMATO',
        count: 1,
        results: [
          { symbol: 'ZOMATO', last_close: 215.19, pct_change: 2.65, last_date: '2025-04-08' },
        ],
      };
      mcpSession.callTool.mockResolvedValue(mockResult);

      const res = await client.searchSymbols('ZOMATO');
      expect(mcpSession.callTool).toHaveBeenCalledWith(
        NseMcpSession.BHAVCOPY_URL,
        'search_symbols',
        { query: 'ZOMATO' }
      );
      expect(res).toEqual(mockResult);
    });

    test('lookupSymbol passes query to nse_lookup_symbol tool', async () => {
      mcpSession.callTool.mockResolvedValue({
        symbols: ['SWARAJ', 'SWARAJENG'],
        query: 'SWARAJ',
        count: 2,
      });
      const res = await client.lookupSymbol('SWARAJ');
      expect(mcpSession.callTool).toHaveBeenCalledWith(
        NseMcpSession.BHAVCOPY_URL,
        'nse_lookup_symbol',
        { query: 'SWARAJ' }
      );
      expect(res.symbols).toEqual(['SWARAJ', 'SWARAJENG']);
    });
  });

  describe('getMarketMood and getIndexValuation', () => {
    test('getMarketMood delegates to get_market_mood', async () => {
      const mockMood = {
        date: '2026-10-09',
        benchmarks: { 'Nifty 50': { close: 22520.45, change_pct: 1.3 } },
        india_vix: { level: 14.38, change_1d_pct: -5.89 },
      };
      mcpSession.callTool.mockResolvedValue(mockMood);

      const res = await client.getMarketMood('2026-10-09');
      expect(mcpSession.callTool).toHaveBeenCalledWith(
        NseMcpSession.BHAVCOPY_URL,
        'get_market_mood',
        { date: '2026-10-09' }
      );
      expect(res.india_vix.level).toBe(14.38);
    });

    test('getIndexValuation queries index valuation with options', async () => {
      const mockVal = { index: 'Nifty 50', pe: { current: 19.27, median: 20.94 } };
      mcpSession.callTool.mockResolvedValue(mockVal);

      const res = await client.getIndexValuation('Nifty 50', { months: 12 });
      expect(mcpSession.callTool).toHaveBeenCalledWith(
        NseMcpSession.BHAVCOPY_URL,
        'get_index_valuation',
        {
          indexName: 'Nifty 50',
          months: 12,
          date: 'today',
        }
      );
      expect(res.pe.current).toBe(19.27);
    });
  });

  describe('getStockVsIndex and getLiveStockQuote', () => {
    test('getStockVsIndex compares stock with benchmark', async () => {
      const mockComp = {
        stock: { symbol: 'INFY', return_pct: -32.19 },
        index: { index: 'Nifty 50', return_pct: -10.57 },
        outperformance_pct_points: -21.63,
        beta: 0.663,
      };
      mcpSession.callTool.mockResolvedValue(mockComp);

      const res = await client.getStockVsIndex('INFY', { indexName: 'Nifty 50' });
      expect(mcpSession.callTool).toHaveBeenCalledWith(
        NseMcpSession.BHAVCOPY_URL,
        'get_stock_vs_index',
        {
          symbol: 'INFY',
          indexName: 'Nifty 50',
          months: 12,
          date: 'today',
        }
      );
      expect(res.beta).toBe(0.663);
    });

    test('getLiveStockQuote queries cm-market live quote', async () => {
      const mockQuote = {
        updatedAt: '2026-10-09T16:00:00Z',
        stock: { symbol: 'RELIANCE', lastTradedPrice: 1170.3, change: -7.7 },
      };
      mcpSession.callTool.mockResolvedValue(mockQuote);

      const res = await client.getLiveStockQuote('NSE:RELIANCE');
      expect(mcpSession.callTool).toHaveBeenCalledWith(
        NseMcpSession.CMMKT_URL,
        'cm_get_stock_quote',
        { symbol: 'RELIANCE' }
      );
      expect(res.stock.lastTradedPrice).toBe(1170.3);
    });
  });
});
