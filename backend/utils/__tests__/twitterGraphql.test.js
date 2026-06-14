/**
 * Unit tests for twitterGraphql helpers.
 * @file backend/utils/__tests__/twitterGraphql.test.js
 * @see docs/API_REFERENCE.md#x-twitter-apis
 */

const axios = require('axios');
const {
  buildCookieHeader,
  parseUserByScreenName,
  parseTimelineInstructions,
  normalizeGraphqlTweet,
  getTwitterGraphqlAuthFromEnv,
  fetchUserByScreenName,
} = require('../twitterGraphql');

jest.mock('axios');

describe('twitterGraphql helpers', () => {
  it('buildCookieHeader uses TWITTER_COOKIES when set', () => {
    process.env.TWITTER_COOKIES = 'auth_token=abc; ct0=xyz';
    expect(buildCookieHeader('ignored', 'ignored')).toBe('auth_token=abc; ct0=xyz');
    delete process.env.TWITTER_COOKIES;
  });

  it('buildCookieHeader builds from auth_token and ct0', () => {
    delete process.env.TWITTER_COOKIES;
    expect(buildCookieHeader('tok', 'csrf-val')).toBe('auth_token=tok; ct0=csrf-val');
  });

  it('parseUserByScreenName extracts user fields', () => {
    const user = parseUserByScreenName({
      data: {
        user: {
          result: {
            rest_id: '123',
            is_blue_verified: true,
            legacy: {
              screen_name: 'demo',
              name: 'Demo User',
              description: 'bio',
              created_at: 'Mon Jan 01 00:00:00 +0000 2020',
            },
            avatar: { image_url: 'https://example.com/a.jpg' },
          },
        },
      },
    });
    expect(user).toMatchObject({
      id: '123',
      username: 'demo',
      name: 'Demo User',
      verified: true,
      profile_image_url: 'https://example.com/a.jpg',
    });
  });

  it('normalizeGraphqlTweet maps legacy fields', () => {
    const tweet = normalizeGraphqlTweet({
      rest_id: '99',
      legacy: {
        full_text: 'hello',
        created_at: 'Wed Jun 05 10:00:00 +0000 2024',
        user_id_str: '1',
        conversation_id_str: '99',
        lang: 'en',
        retweet_count: 1,
        reply_count: 2,
        favorite_count: 3,
        quote_count: 0,
      },
    });
    expect(tweet).toMatchObject({
      id: '99',
      text: 'hello',
      public_metrics: { retweet_count: 1, reply_count: 2, like_count: 3, quote_count: 0 },
    });
  });

  it('parseTimelineInstructions extracts tweets and cursor', () => {
    const { tweets, cursor } = parseTimelineInstructions([
      {
        type: 'TimelineAddEntries',
        entries: [
          {
            entryId: 'tweet-1',
            content: {
              itemContent: {
                tweet_results: {
                  result: {
                    __typename: 'Tweet',
                    rest_id: '1',
                    legacy: { full_text: 'a', id_str: '1' },
                  },
                },
              },
            },
          },
          {
            entryId: 'cursor-bottom-0',
            content: { value: 'next-cursor' },
          },
        ],
      },
    ]);
    expect(tweets).toHaveLength(1);
    expect(tweets[0].id).toBe('1');
    expect(cursor).toBe('next-cursor');
  });

  it('getTwitterGraphqlAuthFromEnv returns null without session tokens', () => {
    const savedAuth = process.env.TWITTER_AUTH_TOKEN;
    const savedCsrf = process.env.TWITTER_CSRF_TOKEN;
    delete process.env.TWITTER_AUTH_TOKEN;
    delete process.env.TWITTER_CSRF_TOKEN;
    expect(getTwitterGraphqlAuthFromEnv()).toBeNull();
    process.env.TWITTER_AUTH_TOKEN = savedAuth;
    process.env.TWITTER_CSRF_TOKEN = savedCsrf;
  });

  it('fetchUserByScreenName throws 503 when query id missing', async () => {
    await expect(
      fetchUserByScreenName('demo', {
        bearer: 'b',
        cookie: 'c',
        csrf: 'x',
        userAgent: 'ua',
        userByScreenNameQueryId: '',
      })
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
