/**
 * Unit tests for twitterController (X GraphQL proxy).
 * @file backend/controllers/__tests__/twitterController.test.js
 * @see docs/API_REFERENCE.md#x-twitter-apis
 */

const {
  normalizeHandle,
  twitterErrorMessage,
  fetchTweetsForDownload,
} = require('../twitterController');

jest.mock('../../utils/twitterGraphql', () => ({
  getTwitterGraphqlAuthFromEnv: jest.fn(),
  fetchUserByScreenName: jest.fn(),
  fetchAllUserTweetsGraphql: jest.fn(),
  graphqlErrorMessage: jest.fn((data, status) => `X GraphQL error (${status})`),
}));

const {
  getTwitterGraphqlAuthFromEnv,
  fetchUserByScreenName,
  fetchAllUserTweetsGraphql,
} = require('../../utils/twitterGraphql');

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
  const mockAuth = {
    bearer: 'bearer',
    cookie: 'cookie',
    csrf: 'csrf',
    userAgent: 'ua',
    userTweetsQueryId: 'q1',
    userByScreenNameQueryId: 'q2',
  };

  beforeEach(() => {
    mockReq = { body: {} };
    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
    getTwitterGraphqlAuthFromEnv.mockReturnValue(mockAuth);
  });

  it('returns 503 when session auth missing', async () => {
    getTwitterGraphqlAuthFromEnv.mockReturnValue(null);

    await fetchTweetsForDownload(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('TWITTER_AUTH_TOKEN'),
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
    fetchUserByScreenName.mockResolvedValue({ id: 'u1', username: 'demo', name: 'Demo' });
    fetchAllUserTweetsGraphql.mockResolvedValue({
      tweets: [{ id: 't1', text: 'hello' }],
      pagesFetched: 1,
    });

    await fetchTweetsForDownload(mockReq, mockRes, mockNext);

    expect(fetchUserByScreenName).toHaveBeenCalledWith('demo', mockAuth);
    expect(fetchAllUserTweetsGraphql).toHaveBeenCalledWith(
      'u1',
      expect.any(Date),
      expect.any(Date),
      mockAuth,
      'https://x.com/demo',
      25
    );
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          user: { id: 'u1', username: 'demo', name: 'Demo' },
          tweets: [{ id: 't1', text: 'hello' }],
          meta: expect.objectContaining({ tweetCount: 1, pagesFetched: 1 }),
          query: expect.objectContaining({
            handle: 'demo',
            intervalDays: 7,
            source: 'x-graphql',
          }),
        }),
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('skips user lookup when userId provided', async () => {
    mockReq.body = { handle: 'demo', userId: 'u99', intervalDays: 7 };
    fetchAllUserTweetsGraphql.mockResolvedValue({ tweets: [], pagesFetched: 0 });

    await fetchTweetsForDownload(mockReq, mockRes, mockNext);

    expect(fetchUserByScreenName).not.toHaveBeenCalled();
    expect(fetchAllUserTweetsGraphql).toHaveBeenCalledWith(
      'u99',
      expect.any(Date),
      expect.any(Date),
      mockAuth,
      'https://x.com/demo',
      25
    );
  });

  it('calls next with error when GraphQL layer throws', async () => {
    mockReq.body = { handle: 'gone', intervalDays: 7 };
    const gqlErr = new Error('not found');
    gqlErr.statusCode = 404;
    fetchUserByScreenName.mockRejectedValue(gqlErr);

    await fetchTweetsForDownload(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith(gqlErr);
    expect(mockRes.json).not.toHaveBeenCalled();
  });
});
