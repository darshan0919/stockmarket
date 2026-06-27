/**
 * Unit tests for the liveQuotes service
 */

const mockGetSymbolData = jest.fn();

jest.mock('../../api/nseIndiaApi', () => ({
  getSymbolData: (...args) => mockGetSymbolData(...args),
}));

const { fetchLiveQuotes, clearLiveQuotesCache, countOrderLevels, sumOrderQty } = require('../liveQuotes');

beforeEach(() => {
  mockGetSymbolData.mockReset();
  clearLiveQuotesCache();
});

describe('countOrderLevels', () => {
  it('counts levels with a non-zero price', () => {
    expect(countOrderLevels([
      { price: 100, quantity: 500 },
      { price: 101, quantity: 200 },
      { price: 0, quantity: 0 },
    ])).toBe(2);
  });
  it('returns 0 for non-array', () => {
    expect(countOrderLevels(undefined)).toBe(0);
    expect(countOrderLevels(null)).toBe(0);
  });
});

describe('sumOrderQty', () => {
  it('sums quantities', () => {
    expect(sumOrderQty([
      { price: 100, quantity: 500 },
      { price: 101, quantity: 300 },
    ])).toBe(800);
  });
  it('returns null for empty array', () => {
    expect(sumOrderQty([])).toBeNull();
  });
});

describe('fetchLiveQuotes', () => {
  const SYMBOL_DATA = {
    tradeInfo: {
      lastPrice: 1500,
      totalTradedVolume: 100000,
      totalTradedValue: 150000000,
      deliveryToTradedQuantity: 45.2,
    },
    metaData: { pChange: 2.35 },
    marketDeptOrderBook: {
      totalBuyQuantity: 5000,
      totalSellQuantity: 3000,
      buy: [
        { price: 1499, quantity: 2000, numberOfOrders: 10 },
        { price: 1498, quantity: 3000, numberOfOrders: 8 },
      ],
      sell: [
        { price: 1501, quantity: 1500, numberOfOrders: 5 },
        { price: 0, quantity: 0, numberOfOrders: 0 },
      ],
    },
  };

  it('fetches and maps all fields for a single symbol', async () => {
    mockGetSymbolData.mockResolvedValue(SYMBOL_DATA);

    const result = await fetchLiveQuotes(['RELIANCE']);
    expect(result['RELIANCE']).toMatchObject({
      price: 1500,
      changePercent: 2.35,
      volume: 100000,
      deliveryPercent: 45.2,
      bidLevels: 2,
      offerLevels: 1, // second sell level has price 0
      totalBidQty: 5000,
      totalOfferQty: 3000,
    });
  });

  it('returns nulls when getSymbolData returns null', async () => {
    mockGetSymbolData.mockResolvedValue(null);
    const result = await fetchLiveQuotes(['UNKNOWN']);
    expect(result['UNKNOWN'].price).toBeNull();
    expect(result['UNKNOWN'].bidLevels).toBeNull();
  });

  it('uses cached values within TTL and does not re-fetch', async () => {
    mockGetSymbolData.mockResolvedValue(SYMBOL_DATA);

    await fetchLiveQuotes(['INFY']);
    await fetchLiveQuotes(['INFY']);

    expect(mockGetSymbolData).toHaveBeenCalledTimes(1);
  });

  it('handles batch of multiple symbols with bounded concurrency', async () => {
    mockGetSymbolData.mockResolvedValue(SYMBOL_DATA);

    const symbols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const result = await fetchLiveQuotes(symbols);
    expect(Object.keys(result)).toHaveLength(symbols.length);
    expect(mockGetSymbolData).toHaveBeenCalledTimes(symbols.length);
  });

  it('returns empty object for empty input', async () => {
    expect(await fetchLiveQuotes([])).toEqual({});
    expect(mockGetSymbolData).not.toHaveBeenCalled();
  });
});
