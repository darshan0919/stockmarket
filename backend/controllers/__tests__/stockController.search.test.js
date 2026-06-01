/**
 * Unit tests for stock search (NSE autocomplete + DB fallback)
 * @file backend/controllers/__tests__/stockController.search.test.js
 * @see docs/backend/controllers/stockController.md
 */

const { searchStocks } = require('../stockController');
const { searchAutocomplete } = require('../../api/nseIndiaApi');
const Stock = require('../../models/Stock');

jest.mock('../../api/nseIndiaApi', () => ({
  searchAutocomplete: jest.fn(),
}));

jest.mock('../../models/Stock');

describe('stockController.searchStocks', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = { query: { q: 'REL', page: 1, limit: 10 } };
    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  it('returns 400 when query is missing', async () => {
    mockReq.query = {};
    await searchStocks(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  it('returns NSE autocomplete results on success', async () => {
    searchAutocomplete.mockResolvedValue({
      symbols: [
        {
          symbol: 'RELIANCE',
          symbol_info: 'Reliance Industries Ltd',
          result_sub_type: 'equity',
          activeSeries: ['EQ'],
          listing_date: '1995-11-08',
        },
      ],
    });

    await searchStocks(mockReq, mockRes, mockNext);

    expect(searchAutocomplete).toHaveBeenCalledWith('REL');
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        results: [
          expect.objectContaining({
            symbol: 'RELIANCE',
            name: 'Reliance Industries Ltd',
            exchange: 'NSE',
          }),
        ],
        total: 1,
      })
    );
    expect(mockRes.json.mock.calls[0][0].fallback).toBeUndefined();
  });

  it('falls back to database when NSE fails', async () => {
    searchAutocomplete.mockRejectedValue(new Error('Request failed with status code 404'));

    Stock.find.mockReturnValue({
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest
        .fn()
        .mockResolvedValue([{ name: 'Reliance Industries', symbol: 'RELIANCE', sector: 'Energy' }]),
    });
    Stock.countDocuments.mockResolvedValue(1);

    await searchStocks(mockReq, mockRes, mockNext);

    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        fallback: true,
        results: [expect.objectContaining({ symbol: 'RELIANCE' })],
      })
    );
  });
});
