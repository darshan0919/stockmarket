'use strict';

const { parseFiiDii } = require('../src/clients/NseClient');
const {
  parseScannerResponse,
  MACRO_TICKERS,
  TradingViewClient,
} = require('../src/clients/TradingViewClient');

describe('parseFiiDii', () => {
  const rows = [
    {
      buyValue: '15626.53',
      category: 'DII',
      date: '09-Oct-2026',
      netValue: '4743.26',
      sellValue: '10883.27',
    },
    {
      buyValue: '10373.99',
      category: 'FII/FPI',
      date: '09-Oct-2026',
      netValue: '-3568.9',
      sellValue: '13942.89',
    },
  ];
  test('normalises strings to numbers and ISO date', () => {
    expect(parseFiiDii(rows)).toEqual({
      date: '2026-10-09',
      fii: { buy: 10373.99, sell: 13942.89, net: -3568.9 },
      dii: { buy: 15626.53, sell: 10883.27, net: 4743.26 },
    });
  });
  test('returns null for malformed / incomplete payloads', () => {
    expect(parseFiiDii(null)).toBeNull();
    expect(parseFiiDii([rows[0]])).toBeNull();
  });
});

describe('TradingView parser + client', () => {
  const payload = {
    totalCount: 2,
    data: [
      { s: 'TVC:US10Y', d: ['US10Y', 5.253, 0.34, 'United States 10 Year Government Bonds Yield'] },
      { s: 'BAD:X', d: ['X', null, null, 'no price'] },
    ],
  };
  test('parseScannerResponse skips rows without a numeric price', () => {
    const q = parseScannerResponse(payload);
    expect(Object.keys(q)).toEqual(['TVC:US10Y']);
    expect(q['TVC:US10Y'].price).toBe(5.253);
  });
  test('getMacroSnapshot maps names and returns null for missing tickers', async () => {
    const http = { post: jest.fn().mockResolvedValue({ data: payload }) };
    const snap = await new TradingViewClient({ http }).getMacroSnapshot();
    expect(snap.us10y.price).toBe(5.253);
    expect(snap.brent).toBeNull();
    expect(Object.keys(snap)).toEqual(Object.keys(MACRO_TICKERS));
  });
});
