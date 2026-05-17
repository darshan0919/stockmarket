/**
 * Unit tests for twitterController (X API v2 proxy).
 * @file backend/controllers/__tests__/twitterController.test.js
 * @see docs/API_REFERENCE.md#x-twitter-apis
 */

const axios = require('axios');
const {
  normalizeHandle,
  twitterErrorMessage,
  fetchTweetsForDownload,
} = require('../twitterController');

jest.mock('axios');

describe('twitterController helpers', () => {
  it('normalizeHandle strips @ and whitespace', () => {
    expect(normalizeHandle('  @FooBar  ')).toBe('FooBar');
    expect(normalizeHandle('baz')).toBe('baz');
  });

  it('twitterErrorMessage prefers detail and errors[0].detail', () => {
    expect(twitterErrorMessage({ detail: 'bad' }, 400)).toBe('bad');
    expect(twitterErrorMessage({ errors: [{ detail: 'nested' }] }, 404)).toBe('nested');
    expect(twitterErrorMessage(null, 500)).toBe('Twitter API error (500)');
  });
});

describe('twitterController.fetchTweetsForDownload', () => {
  let mockReq;
  let mockRes;
  let mockNext;
  const savedBearer = process.env.TWITTER_BEARER_TOKEN;

  beforeEach(() => {
    mockReq = { body: {} };
    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
    process.env.TWITTER_BEARER_TOKEN = 'test-bearer';
  });

  afterEach(() => {
    process.env.TWITTER_BEARER_TOKEN = savedBearer;
  });

  it('returns 503 when bearer token missing', async () => {
    delete process.env.TWITTER_BEARER_TOKEN;
    delete process.env.X_BEARER_TOKEN;

    await fetchTweetsForDownload(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('TWITTER_BEARER_TOKEN'),
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('returns 400 when handle empty', async () => {
    mockReq.body = { handle: '   ', intervalDays: 7 };

    await fetchTweetsForDownload(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('returns 400 when intervalDays out of range', async () => {
    mockReq.body = { handle: 'testuser', intervalDays: 0 };

    await fetchTweetsForDownload(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  it('aggregates tweets and returns success JSON', async () => {
    mockReq.body = { handle: '@demo', intervalDays: 7 };

    axios.get
      .mockResolvedValueOnce({
        status: 200,
        data: {
          data: { id: 'u1', username: 'demo', name: 'Demo' },
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          data: [{ id: 't1', text: 'hello' }],
          meta: {},
          includes: { users: [{ id: 'u1', username: 'demo' }] },
        },
      });

    await fetchTweetsForDownload(mockReq, mockRes, mockNext);

    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          user: { id: 'u1', username: 'demo', name: 'Demo' },
          tweets: [{ id: 't1', text: 'hello' }],
          meta: expect.objectContaining({ tweetCount: 1, pagesFetched: 1 }),
          query: expect.objectContaining({ handle: 'demo', intervalDays: 7 }),
        }),
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/users/by/username/demo'),
      expect.any(Object)
    );
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/users/u1/tweets'),
      expect.any(Object)
    );
  });

  it('calls next with error when Twitter returns failure', async () => {
    mockReq.body = { handle: 'gone', intervalDays: 7 };
    const twErr = new Error('not found');
    twErr.statusCode = 404;
    axios.get.mockRejectedValueOnce(twErr);

    await fetchTweetsForDownload(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith(twErr);
    expect(mockRes.json).not.toHaveBeenCalled();
  });
});
