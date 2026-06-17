/**
 * Unit tests for the Top Gainers service.
 * @file backend/services/__tests__/topGainers.test.js
 * @see {@link docs/API_REFERENCE.md#market-apis}
 */

const mockGetLiveVariations = jest.fn();
const mockGetQuoteEquity = jest.fn();
const mockGetPriceVolumeDeliverable = jest.fn();
const mockNseGet = jest.fn();
const mockGetStockScripCode = jest.fn();
const mockGetCompanyInfo = jest.fn();

jest.mock('../../api/nseIndiaApi', () => ({
  getLiveVariations: (...args) => mockGetLiveVariations(...args),
  getQuoteEquity: (...args) => mockGetQuoteEquity(...args),
  getPriceVolumeDeliverable: (...args) => mockGetPriceVolumeDeliverable(...args),
  nseGet: (...args) => mockNseGet(...args),
  NSE_HOME_URL: 'https://www.nseindia.com/',
  formatDate: (d) => d.toISOString().slice(0, 10),
}));

jest.mock('../../api/bseIndiaApi', () => ({
  getStockScripCode: (...args) => mockGetStockScripCode(...args),
  getCompanyInfo: (...args) => mockGetCompanyInfo(...args),
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
  // default: shareholding returns empty array (no retail data)
  mockNseGet.mockResolvedValue({ data: [] });
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
  it('enriches rows with P/E, market cap, retail holding, delivery and 1-week change', async () => {
    mockGetLiveVariations.mockResolvedValue({
      allSec: {
        timestamp: 't',
        data: [{ symbol: 'ABC', ltp: 110, net_price: 5, trade_quantity: 100 }],
      },
    });
    mockGetQuoteEquity.mockResolvedValue({
      metadata: { pdSymbolPe: 24.5 },
      securityInfo: { issuedSize: 1_000_000_000 }, // 100 Cr shares
      priceInfo: { lastPrice: 110 },
      tradeInfo: { deliveryToTradedQuantity: 65 }, // today's live delivery %
    });
    mockGetPriceVolumeDeliverable.mockResolvedValue([
      { CH_TIMESTAMP: '2026-06-10', CH_CLOSING_PRICE: 100, COP_DELIV_PERC: 40 },
      { CH_TIMESTAMP: '2026-06-11', CH_CLOSING_PRICE: 101, COP_DELIV_PERC: 41 },
      { CH_TIMESTAMP: '2026-06-12', CH_CLOSING_PRICE: 102, COP_DELIV_PERC: 42 },
      { CH_TIMESTAMP: '2026-06-13', CH_CLOSING_PRICE: 103, COP_DELIV_PERC: 43 },
      { CH_TIMESTAMP: '2026-06-16', CH_CLOSING_PRICE: 104, COP_DELIV_PERC: 44 },
      { CH_TIMESTAMP: '2026-06-17', CH_CLOSING_PRICE: 110, COP_DELIV_PERC: 55 }, // T-1 fallback
    ]);
    // shareholding endpoint returns retail data
    mockNseGet.mockResolvedValue({
      data: [
        { date: '2026-03-31', public_val: '38.5' },
        { date: '2025-12-31', public_val: '37.2' },
      ],
    });

    const { rows, count } = await getTopGainers({ count: 5 });
    expect(count).toBe(1);
    // P/E and market cap from quote-equity
    expect(rows[0].pe).toBe(24.5);
    expect(rows[0].marketCapCr).toBeCloseTo((1_000_000_000 * 110) / 1e7, 1); // 11000 Cr
    // today's delivery % from quote-equity takes priority over T-1 history
    expect(rows[0].deliveryPercent).toBe(65);
    // 30d avg: average of all 6 mock rows → (40+41+42+43+44+55)/6 ≈ 44.17
    expect(rows[0].avgDeliveryPercent30d).toBeCloseTo(44.17, 1);
    expect(rows[0].weekChangePercent).toBe(10);
    // retail from shareholding (latest date wins)
    expect(rows[0].retailHoldingPercent).toBe(38.5);
  });

  it('falls back to T-1 delivery % from history when quote-equity has no tradeInfo', async () => {
    mockGetLiveVariations.mockResolvedValue({
      allSec: { data: [{ symbol: 'ABC', ltp: 110, net_price: 5 }] },
    });
    mockGetQuoteEquity.mockResolvedValue({
      metadata: { pdSymbolPe: 20 },
      priceInfo: { lastPrice: 110 },
      // no tradeInfo → deliveryToTradedQuantity is undefined
    });
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
    mockGetQuoteEquity.mockRejectedValue(new Error('blocked'));
    mockGetPriceVolumeDeliverable.mockRejectedValue(new Error('blocked'));
    mockGetStockScripCode.mockRejectedValue(new Error('blocked'));
    mockNseGet.mockRejectedValue(new Error('blocked'));

    const { rows } = await getTopGainers({ count: 5 });
    expect(rows[0]).toMatchObject({
      pe: null,
      marketCapCr: null,
      deliveryPercent: null,
      avgDeliveryPercent30d: null,
      weekChangePercent: null,
      retailHoldingPercent: null,
    });
  });

  it('falls back to BSE company info for P/E when NSE quote-equity fails', async () => {
    mockGetLiveVariations.mockResolvedValue({
      allSec: { data: [{ symbol: 'ABC', ltp: 110, net_price: 5 }] },
    });
    mockGetQuoteEquity.mockRejectedValue(new Error('403'));
    mockGetPriceVolumeDeliverable.mockResolvedValue([]);
    mockGetStockScripCode.mockResolvedValue('500001');
    mockGetCompanyInfo.mockResolvedValue({ PE: '18.7' });

    const { rows } = await getTopGainers({ count: 5 });
    expect(rows[0].pe).toBe(18.7);
  });

  it('serves cached payload without re-calling NSE', async () => {
    mockGetLiveVariations.mockResolvedValue({ allSec: { data: [] } });
    await getTopGainers({ count: 5, enrich: false });
    await getTopGainers({ count: 5, enrich: false });
    expect(mockGetLiveVariations).toHaveBeenCalledTimes(1);
  });
});
