/**
 * Handlers for proxying X (Twitter) API v2 user tweets for dashboard export.
 * @module controllers/twitterController
 * @see {@link docs/API_REFERENCE.md#x-twitter-apis} for API docs
 */

const axios = require('axios');

const TWITTER_API_BASE = 'https://api.twitter.com/2';
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
 * Parse Twitter/X error payload into a message string.
 * @param {unknown} data
 * @param {number} status
 * @returns {string}
 */
function twitterErrorMessage(data, status) {
  if (!data || typeof data !== 'object') {
    return `Twitter API error (${status})`;
  }
  const d = /** @type {Record<string, unknown>} */ (data);
  if (typeof d.detail === 'string' && d.detail) return d.detail;
  const errors = d.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0];
    if (
      first &&
      typeof first === 'object' &&
      typeof (/** @type {{detail?:string}} */ (first).detail) === 'string'
    ) {
      return /** @type {{detail:string}} */ (first).detail;
    }
  }
  if (typeof d.title === 'string' && d.title) return d.title;
  return `Twitter API error (${status})`;
}

/**
 * GET helper against Twitter API v2; throws Error with statusCode for HTTP errors.
 * @param {string} path - Path under TWITTER_API_BASE (e.g. "/users/by/username/elonmusk")
 * @param {string} bearerToken
 * @param {Record<string, string|number|undefined>} [params]
 * @returns {Promise<Record<string, unknown>>}
 */
async function twitterGet(path, bearerToken, params = {}) {
  const url = `${TWITTER_API_BASE}${path}`;
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${bearerToken}` },
    params,
    validateStatus: () => true,
    timeout: 60000,
  });
  if (res.status >= 200 && res.status < 300) {
    return /** @type {Record<string, unknown>} */ (res.data);
  }
  const msg = twitterErrorMessage(res.data, res.status);
  const err = new Error(msg);
  if (res.status === 404) err.statusCode = 404;
  else if (res.status === 429) err.statusCode = 429;
  else err.statusCode = 502;
  throw err;
}

/**
 * Fetch all tweets for a user in [now - intervalDays, now], paginated.
 * @param {string} userId
 * @param {string} startIso - RFC3339 UTC
 * @param {string} endIso - RFC3339 UTC
 * @param {string} bearerToken
 * @returns {Promise<{ tweets: Array<Record<string, unknown>>, includes: Record<string, unknown> | null, pagesFetched: number }>}
 */
async function fetchAllUserTweets(userId, startIso, endIso, bearerToken) {
  const tweetFields = [
    'id',
    'text',
    'created_at',
    'author_id',
    'conversation_id',
    'public_metrics',
    'lang',
  ].join(',');

  /** @type {Array<Record<string, unknown>>} */
  const tweets = [];
  /** @type {Record<string, unknown> | null} */
  let mergedIncludes = null;
  let paginationToken;
  let pagesFetched = 0;

  for (;;) {
    if (pagesFetched >= MAX_PAGES) break;

    /** @type {Record<string, string|number|undefined>} */
    const params = {
      max_results: 100,
      start_time: startIso,
      end_time: endIso,
      tweet_fields: tweetFields,
      expansions: 'author_id',
      'user.fields': 'id,name,username,verified,profile_image_url',
    };
    if (paginationToken) params.pagination_token = paginationToken;

    const page = await twitterGet(`/users/${userId}/tweets`, bearerToken, params);
    pagesFetched += 1;

    const data = page.data;
    if (Array.isArray(data)) {
      tweets.push(.../** @type {Array<Record<string, unknown>>} */ (data));
    }
    const inc = page.includes;
    if (inc && typeof inc === 'object') {
      mergedIncludes = mergedIncludes || {};
      for (const key of Object.keys(inc)) {
        const val = /** @type {Record<string, unknown>} */ (inc)[key];
        if (Array.isArray(val)) {
          const existing = mergedIncludes[key];
          if (Array.isArray(existing)) {
            mergedIncludes[key] = [...existing, ...val];
          } else {
            mergedIncludes[key] = [...val];
          }
        }
      }
    }

    const meta = page.meta;
    const next =
      meta &&
      typeof meta === 'object' &&
      typeof (/** @type {{next_token?:string}} */ (meta).next_token) === 'string'
        ? /** @type {{next_token:string}} */ (meta).next_token
        : undefined;
    if (!next) break;
    paginationToken = next;
  }

  return { tweets, includes: mergedIncludes, pagesFetched };
}

/**
 * POST /api/twitter/fetch-tweets — resolve handle and return tweets in window for JSON download.
 * Body: { handle: string, intervalDays: number }
 *
 * @route POST /api/twitter/fetch-tweets
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function fetchTweetsForDownload(req, res, next) {
  try {
    const bearer = process.env.TWITTER_BEARER_TOKEN || process.env.X_BEARER_TOKEN;
    if (!bearer || !String(bearer).trim()) {
      res.status(503).json({
        success: false,
        error:
          'X API is not configured. Set TWITTER_BEARER_TOKEN (or X_BEARER_TOKEN) in backend/.env.',
      });
      return;
    }

    const handle = normalizeHandle(req.body?.handle);
    const intervalDaysRaw = req.body?.intervalDays ?? req.body?.interval;
    const intervalDays = parseInt(String(intervalDaysRaw), 10);

    if (!handle) {
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

    const userPayload = await twitterGet(
      `/users/by/username/${encodeURIComponent(handle)}`,
      bearer.trim(),
      { user_fields: 'id,name,username,verified,profile_image_url,created_at,description' }
    );

    const userData = userPayload.data;
    if (
      !userData ||
      typeof userData !== 'object' ||
      typeof (/** @type {{id?:string}} */ (userData).id) !== 'string'
    ) {
      res
        .status(502)
        .json({ success: false, error: 'Unexpected user lookup response from X API.' });
      return;
    }
    const userId = /** @type {{id:string}} */ (userData).id;

    const { tweets, includes, pagesFetched } = await fetchAllUserTweets(
      userId,
      startIso,
      endIso,
      bearer.trim()
    );

    res.json({
      success: true,
      data: {
        user: userData,
        tweets,
        includes,
        query: {
          handle,
          intervalDays,
          start_time: startIso,
          end_time: endIso,
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
  normalizeHandle,
  fetchTweetsForDownload,
  twitterErrorMessage,
};
