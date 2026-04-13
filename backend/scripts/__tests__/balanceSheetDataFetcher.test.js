/**
 * Unit tests for getCurrentMetrics allowFetch option
 * @file backend/scripts/__tests__/balanceSheetDataFetcher.test.js
 * @see docs/API_REFERENCE.md for Stock APIs
 */

jest.mock('../../models/QuarterlyResult', () => ({
  find: jest.fn(),
}));

const axios = require('axios');
jest.mock('axios');

const QuarterlyResult = require('../../models/QuarterlyResult');
const { getCurrentMetrics } = require('../balanceSheetDataFetcher');

describe('getCurrentMetrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    QuarterlyResult.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
  });

  it('does not call NSE (axios) when allowFetch is false and DB has no rows', async () => {
    const metrics = await getCurrentMetrics('WAAREERTL', { allowFetch: false });

    expect(metrics).toEqual({});
    expect(axios.get).not.toHaveBeenCalled();
  });
});
