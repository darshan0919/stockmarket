/**
 * Unit tests for the Top Gainers service.
 * @file backend/services/__tests__/topGainers.test.js
 */

const mockGetLiveVariations = jest.fn();
const mockGetSymbolData = jest.fn();
const mockGetPriceVolumeDeliverable = jest.fn();
const mockFetchFundamentals = jest.fn();

jest.mock('../../api/nseIndiaApi', () => ({
  getLiveVariations: (...args) => mockGetLiveVariations(...args),
  getSymbolData: (...args) => mockGetSymbolData(...args),
  getPriceVolumeDeliverable: (...args) => mockGetPriceVolumeDeliverable(...args),
  formatDate: (d) => d.toISOString().slice(0, 10),
}));

jest.mock('../stockscansMetrics', () => ({
  fetchFundamentals: (...args) => mockFetchFundamentals(...args),
}));

const {
  getTopGainers,
  clearTopGainersCache,
  selectRows,
  mapBaseRow,
  mapWithConcurrency,
} = require('../topGainers');

beforeEach(() => {
  jest.clearAllMocks();
  clearTopGainersCache();
  // default: Stockscans returns nulls for all symbols
  mockFetchFundamentals.mockResolvedValue({});
});

describe('mapBaseRow', () => {
  it('maps an NSE variation row and converts turnover (lakhs) to absolute rupees', () => {
    const row = mapBaseRow({
      symbol: 'ABC',
      series: 'EQ',
      ltp: 100.5,
      net_price: 12.3,
      prev_price: 89.5,
      trade_quantity: 1_000_000,
      turnover: 1005,
    });
    expect(row).toMatchObject({
      symbol: 'ABC',
      price: 100.5,
      changePercent: 12.3,
      volume: 1_000_000,
      value: 1005 * 1e5,
      pe: null,
      patGrowthTtm: null,
    });
  });

  it('falls back to volume × price when turnover is missing', () => {
    const row = mapBaseRow({ symbol: 'XYZ', ltp: 50, trade_quantity: 500_000 });
    expect(row.value).toBe(25_000_000);
  });
});

describe('selectRows', () => {
  const variations = {
    allSec: {
      timestamp: '17-Jun-2026 15:30',
      data: [
        { symbol: 'ABC', ltp: 100, net_price: 10 },
        { symbol: 'ABC', ltp: 1 }, // duplicate
        { symbol: 'XYZ', ltp: 50, net_price: 8 },
        { symbol: null, ltp: 5 }, // invalid
      ],
    },
    dateTime: '17-Jun-2026 15:30',
  };

  it('de-duplicates by symbol, skips invalid rows, and respects count', () => {
    const { rows } = selectRows(variations, 'allSec', 10);
    expect(rows.map((r) => r.symbol)).toEqual(['ABC', 'XYZ']);
  });

  it('honours the count limit', () => {
    const { rows } = selectRows(variations, 'allSec', 1);
    expect(rows).toHaveLength(1);
  });

  it('falls back to the first available bucket when requested bucket is empty', () => {
    const { bucket } = selectRows(variations, 'NIFTY', 10);
    expect(bucket).toBe('allSec');
  });
});

describe('mapWithConcurrency', () => {
  it('runs all tasks and preserves order', async () => {
    const tasks = [1, 2, 3, 4, 5].map((n) => async () => n * 2);
    const results = await mapWithConcurrency(tasks, 2);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });
});

describe('getTopGainers', () => {
  it('enriches rows with fundamentals from Stockscans and delivery/history from NSE', async () => {
    mockGetLiveVariations.mockResolvedValue({
      allSec: {
        timestamp: 't',
        data: [{ symbol: 'ABC', ltp: 110, net_price: 5, trade_quantity: 100 }],
      },
    });
    mockFetchFundamentals.mockResolvedValue({
      ABC: { pe: 24.5, marketCapCr: 11000, patGrowthTtm: 18.3, retailHoldingsPercent: 38.5 },
    });
    mockGetSymbolData.mockResolvedValue({
      metaData: { pChange: 5 },
      tradeInfo: {
        lastPrice: 110,
        totalTradedVolume: 100,
        totalTradedValue: 91300,
        totalMarketCap: 110000000000, // 11000 Cr in rupees
        deliveryToTradedQuantity: 65,
      },
    });
    mockGetPriceVolumeDeliverable.mockResolvedValue([
      { CH_TIMESTAMP: '2026-06-10', CH_CLOSING_PRICE: 100, COP_DELIV_PERC: 40 },
      { CH_TIMESTAMP: '2026-06-11', CH_CLOSING_PRICE: 101, COP_DELIV_PERC: 41 },
      { CH_TIMESTAMP: '2026-06-12', CH_CLOSING_PRICE: 102, COP_DELIV_PERC: 42 },
      { CH_TIMESTAMP: '2026-06-13', CH_CLOSING_PRICE: 103, COP_DELIV_PERC: 43 },
      { CH_TIMESTAMP: '2026-06-16', CH_CLOSING_PRICE: 104, COP_DELIV_PERC: 44 },
      { CH_TIMESTAMP: '2026-06-17', CH_CLOSING_PRICE: 110, COP_DELIV_PERC: 55 },
    ]);

    const { rows, count } = await getTopGainers({ count: 5 });
    expect(count).toBe(1);
    expect(rows[0].pe).toBe(24.5);
    expect(rows[0].marketCapCr).toBeCloseTo(11000, 0);
    expect(rows[0].patGrowthTtm).toBe(18.3);
    expect(rows[0].retailHoldingPercent).toBe(38.5);
    // today's delivery % from quote-equity takes priority over T-1 history
    expect(rows[0].deliveryPercent).toBe(65);
    // 30d avg: average of all 6 mock rows → (40+41+42+43+44+55)/6 ≈ 44.17
    expect(rows[0].avgDeliveryPercent30d).toBeCloseTo(44.17, 1);
    expect(rows[0].weekChangePercent).toBe(10);
  });

  it('falls back to T-1 delivery % from history when quote-equity has no tradeInfo', async () => {
    mockGetLiveVariations.mockResolvedValue({
      allSec: { data: [{ symbol: 'ABC', ltp: 110, net_price: 5 }] },
    });
    mockFetchFundamentals.mockResolvedValue({ ABC: { pe: 20, marketCapCr: null, patGrowthTtm: null, retailHoldingsPercent: null } });
    mockGetSymbolData.mockResolvedValue(null); // no data → all fields null
    mockGetPriceVolumeDeliverable.mockResolvedValue([
      { CH_TIMESTAMP: '2026-06-16', CH_CLOSING_PRICE: 100, COP_DELIV_PERC: 44 },
      { CH_TIMESTAMP: '2026-06-17', CH_CLOSING_PRICE: 110, COP_DELIV_PERC: 55 },
    ]);

    const { rows } = await getTopGainers({ count: 5 });
    expect(rows[0].deliveryPercent).toBe(55); // T-1 fallback
    expect(rows[0].avgDeliveryPercent30d).toBeCloseTo((44 + 55) / 2, 1);
  });

  it('tolerates per-symbol enrichment failures (nulls, no throw)', async () => {
    mockGetLiveVariations.mockResolvedValue({
      allSec: { data: [{ symbol: 'ABC', ltp: 110, net_price: 5 }] },
    });
    mockFetchFundamentals.mockRejectedValue(new Error('stockscans down'));
    mockGetSymbolData.mockRejectedValue(new Error('blocked'));
    mockGetPriceVolumeDeliverable.mockRejectedValue(new Error('blocked'));

    const { rows } = await getTopGainers({ count: 5 });
    expect(rows[0]).toMatchObject({
      pe: null,
      marketCapCr: null,
      deliveryPercent: null,
      avgDeliveryPercent30d: null,
      weekChangePercent: null,
      retailHoldingPercent: null,
      patGrowthTtm: null,
    });
  });

  it('serves cached payload without re-calling NSE', async () => {
    mockGetLiveVariations.mockResolvedValue({ allSec: { data: [] } });
    await getTopGainers({ count: 5, enrich: false });
    await getTopGainers({ count: 5, enrich: false });
    expect(mockGetLiveVariations).toHaveBeenCalledTimes(1);
  });
});
