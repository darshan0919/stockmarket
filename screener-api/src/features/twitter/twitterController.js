/**
 * Handlers for X (Twitter) GraphQL user tweets export (dashboard JSON download).
 * @module controllers/twitterController
 * @see {@link docs/API_REFERENCE.md#x-twitter-apis} for API docs
 */

const {
  getTwitterGraphqlAuthFromEnv,
  fetchUserByScreenName,
  fetchAllUserTweetsGraphql,
} = require('../../core/utils/twitterGraphql');

/** Cap pagination to avoid runaway requests */
const MAX_PAGES = 25;
const MIN_INTERVAL_DAYS = 1;
const MAX_INTERVAL_DAYS = 365;

/**
 * Strip leading @ and whitespace from a handle.
 * @param {string} raw
 * @returns {string}
 */
function normalizeHandle(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/^@+/, '');
}

/**
 * POST /api/twitter/fetch-tweets — resolve handle and return tweets in window for JSON download.
 * Body: { handle: string, intervalDays: number, userId?: string }
 *
 * Uses x.com internal GraphQL (UserByScreenName + UserTweets) with session cookies from .env.
 *
 * @route POST /api/twitter/fetch-tweets
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function fetchTweetsForDownload(req, res, next) {
  try {
    const auth = getTwitterGraphqlAuthFromEnv();
    if (!auth) {
      res.status(503).json({
        success: false,
        error:
          'X GraphQL is not configured. Set TWITTER_AUTH_TOKEN and TWITTER_CSRF_TOKEN in .env (see # TWEETER section).',
      });
      return;
    }

    const handle = normalizeHandle(req.body?.handle);
    const intervalDaysRaw = req.body?.intervalDays ?? req.body?.interval;
    const intervalDays = parseInt(String(intervalDaysRaw), 10);
    const bodyUserId =
      typeof req.body?.userId === 'string' && req.body.userId.trim()
        ? req.body.userId.trim()
        : null;

    if (!handle && !bodyUserId) {
      res.status(400).json({ success: false, error: 'Twitter handle is required.' });
      return;
    }
    if (
      Number.isNaN(intervalDays) ||
      intervalDays < MIN_INTERVAL_DAYS ||
      intervalDays > MAX_INTERVAL_DAYS
    ) {
      res.status(400).json({
        success: false,
        error: `intervalDays must be between ${MIN_INTERVAL_DAYS} and ${MAX_INTERVAL_DAYS}.`,
      });
      return;
    }

    const end = new Date();
    const start = new Date(end.getTime() - intervalDays * 86400000);
    const startIso = start.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const endIso = end.toISOString().replace(/\.\d{3}Z$/, 'Z');

    const screenName = handle || 'i';
    const referer = handle ? `https://x.com/${encodeURIComponent(handle)}` : 'https://x.com/';

    /** @type {Record<string, unknown>} */
    let userData;
    let userId = bodyUserId;

    if (!userId) {
      userData = await fetchUserByScreenName(screenName, auth);
      userId = typeof userData.id === 'string' ? userData.id : null;
    } else {
      userData = { id: userId, username: handle || undefined };
    }

    if (!userId) {
      res.status(502).json({ success: false, error: 'Could not resolve X user id.' });
      return;
    }

    const { tweets, pagesFetched } = await fetchAllUserTweetsGraphql(
      userId,
      start,
      end,
      auth,
      referer,
      MAX_PAGES
    );

    res.json({
      success: true,
      data: {
        user: userData,
        tweets,
        includes: null,
        query: {
          handle: handle || null,
          userId,
          intervalDays,
          start_time: startIso,
          end_time: endIso,
          source: 'x-graphql',
        },
        meta: {
          tweetCount: tweets.length,
          pagesFetched,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  fetchTweetsForDownload,
};
