/**
 * Unit tests for announcementsController (provider query + StockScans vs NSE)
 * @file backend/controllers/__tests__/announcementsController.test.js
 * @see docs/API_REFERENCE.md#announcements-apis
 */

const axios = require('axios');
const { getAnnouncements } = require('../announcementsController');
const { searchCompanyAnnouncements } = require('../../services/stockscansAnnouncements');

jest.mock('axios');
jest.mock('../../services/stockscansAnnouncements', () => ({
  searchCompanyAnnouncements: jest.fn(),
}));

describe('announcementsController.getAnnouncements', () => {
  let mockReq;
  let mockRes;
  let mockNext;
  const savedToken = process.env.STOCKSCANS_AUTH_TOKEN;

  beforeEach(() => {
    mockReq = { params: { symbol: 'RELIANCE' }, query: {} };
    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
    process.env.STOCKSCANS_AUTH_TOKEN = 'test-jwt-token';
  });

  afterAll(() => {
    process.env.STOCKSCANS_AUTH_TOKEN = savedToken;
  });

  it('provider=nse uses NSE only and does not call StockScans', async () => {
    mockReq.query = { provider: 'nse' };
    axios.get.mockResolvedValue({ data: [{ subject: 'A', attchmntFile: 'x' }] });

    await getAnnouncements(mockReq, mockRes, mockNext);

    expect(searchCompanyAnnouncements).not.toHaveBeenCalled();
    expect(axios.get).toHaveBeenCalledWith(
      'https://www.nseindia.com/api/corporate-announcements',
      expect.objectContaining({
        params: { index: 'equities', symbol: 'RELIANCE' },
      })
    );
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        meta: expect.objectContaining({ provider: 'nse' }),
      })
    );
  });

  it('provider=stockscans returns error JSON when StockScans fails and does not call NSE', async () => {
    mockReq.query = { provider: 'stockscans' };
    const apiErr = new Error('upstream');
    apiErr.code = 'STOCKSCANS_API_ERROR';
    searchCompanyAnnouncements.mockRejectedValue(apiErr);

    await getAnnouncements(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(502);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        meta: expect.objectContaining({ provider: 'stockscans' }),
      })
    );
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('provider=stockscans returns 503 when auth token missing in service', async () => {
    mockReq.query = { provider: 'stockscans' };
    const authErr = new Error('token required');
    authErr.code = 'STOCKSCANS_AUTH_REQUIRED';
    searchCompanyAnnouncements.mockRejectedValue(authErr);

    await getAnnouncements(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('provider=auto falls back to NSE when StockScans fails', async () => {
    mockReq.query = {};
    searchCompanyAnnouncements.mockRejectedValue(new Error('StockScans down'));
    axios.get.mockResolvedValue({ data: [{ subject: 'NSE only' }] });

    await getAnnouncements(mockReq, mockRes, mockNext);

    expect(searchCompanyAnnouncements).toHaveBeenCalled();
    expect(axios.get).toHaveBeenCalled();
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        meta: expect.objectContaining({ provider: 'nse' }),
      })
    );
  });

  it('provider=stockscans returns data when StockScans succeeds', async () => {
    mockReq.query = { provider: 'stockscans', offset: '0' };
    searchCompanyAnnouncements.mockResolvedValue({
      data: [{ subject: 'Q', an_dt: '1-Jan-2026 00:00:00' }],
      meta: { offset: 0, limit: 30, search: 'report', companyId: 'NSE:RELIANCE' },
    });

    await getAnnouncements(mockReq, mockRes, mockNext);

    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        meta: expect.objectContaining({ provider: 'stockscans', limit: 30 }),
      })
    );
    expect(axios.get).not.toHaveBeenCalled();
  });
});
