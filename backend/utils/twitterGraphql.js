/**
 * X.com internal GraphQL helpers for user timeline export.
 * @module utils/twitterGraphql
 * @see {@link docs/API_REFERENCE.md#x-twitter-apis} for API docs
 */

const axios = require('axios');

const GRAPHQL_BASE = 'https://x.com/i/api/graphql';

/** Default public web bearer (same as x.com web client). */
const DEFAULT_BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

/** @see UserTweets curl from x.com web client */
const USER_TWEETS_FEATURES = {
  rweb_video_screen_enabled: false,
  rweb_cashtags_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: false,
  rweb_tipjar_consumption_enabled: false,
  verified_phone_label_enabled: true,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  rweb_cashtags_composer_attachment_enabled: true,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  rweb_conversational_replies_downvote_enabled: false,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  content_disclosure_indicator_enabled: true,
  content_disclosure_ai_generated_indicator_enabled: true,
  responsive_web_grok_show_grok_translated_post: true,
  responsive_web_grok_analysis_button_from_backend: true,
  post_ctas_fetch_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

const USER_BY_SCREEN_NAME_FEATURES = {
  hidden_profile_subscriptions_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: true,
  subscriptions_verification_info_is_identity_verified_enabled: true,
  subscriptions_verification_info_verified_since_enabled: true,
  highlights_tweets_tab_ui_enabled: true,
  responsive_web_twitter_article_notes_tab_enabled: true,
  subscriptions_feature_can_gift_premium: true,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: false,
  rweb_cashtags_enabled: true,
  articles_preview_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  responsive_web_grok_show_grok_translated_post: true,
  responsive_web_grok_analysis_button_from_backend: true,
  responsive_web_jetfuel_frame: true,
};

/**
 * Build session auth config from process.env.
 * @returns {{ bearer: string, cookie: string, csrf: string, userAgent: string, userTweetsQueryId: string, userByScreenNameQueryId: string } | null}
 */
function getTwitterGraphqlAuthFromEnv() {
  const authToken = process.env.TWITTER_AUTH_TOKEN?.trim();
  const csrf = process.env.TWITTER_CSRF_TOKEN?.trim();
  if (!authToken || !csrf) return null;

  const bearer =
    process.env.TWITTER_BEARER_TOKEN?.trim() ||
    process.env.X_BEARER_TOKEN?.trim() ||
    DEFAULT_BEARER;

  const userTweetsQueryId =
    process.env.TWITTER_USER_TWEETS_QUERY_ID?.trim() || '54_zVtVXJlQtnIBrY2QSXQ';
  const userByScreenNameQueryId = process.env.TWITTER_USER_BY_SCREEN_NAME_QUERY_ID?.trim();

  return {
    bearer,
    cookie: buildCookieHeader(authToken, csrf),
    csrf,
    userAgent:
      process.env.TWITTER_USER_AGENT?.trim() ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    userTweetsQueryId,
    userByScreenNameQueryId,
  };
}

/**
 * Compose Cookie header from auth_token + ct0 or full TWITTER_COOKIES override.
 * @param {string} authToken
 * @param {string} csrf
 * @returns {string}
 */
function buildCookieHeader(authToken, csrf) {
  const override = process.env.TWITTER_COOKIES?.trim();
  if (override) return override;
  return `auth_token=${authToken}; ct0=${encodeURIComponent(csrf)}`;
}

/**
 * Parse GraphQL error payload into a message string.
 * @param {unknown} data
 * @param {number} status
 * @returns {string}
 */
function graphqlErrorMessage(data, status) {
  if (!data || typeof data !== 'object') {
    return `X GraphQL error (${status})`;
  }
  const d = /** @type {Record<string, unknown>} */ (data);
  const errors = d.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0];
    if (first && typeof first === 'object') {
      const msg = /** @type {{message?: string}} */ (first).message;
      if (msg) return msg;
    }
  }
  if (typeof d.detail === 'string' && d.detail) return d.detail;
  return `X GraphQL error (${status})`;
}

/**
 * GET an X GraphQL operation (same shape as x.com web client).
 * @param {string} operationName
 * @param {string} queryId
 * @param {Record<string, unknown>} variables
 * @param {Record<string, unknown>} features
 * @param {Record<string, unknown> | undefined} fieldToggles
 * @param {{ bearer: string, cookie: string, csrf: string, userAgent: string }} auth
 * @param {string} referer
 * @returns {Promise<Record<string, unknown>>}
 */
async function graphqlGet(
  operationName,
  queryId,
  variables,
  features,
  fieldToggles,
  auth,
  referer
) {
  const url = new URL(`${GRAPHQL_BASE}/${queryId}/${operationName}`);
  url.searchParams.set('variables', JSON.stringify(variables));
  url.searchParams.set('features', JSON.stringify(features));
  if (fieldToggles) {
    url.searchParams.set('fieldToggles', JSON.stringify(fieldToggles));
  }

  const res = await axios.get(url.toString(), {
    headers: {
      accept: '*/*',
      authorization: `Bearer ${auth.bearer}`,
      'content-type': 'application/json',
      cookie: auth.cookie,
      referer,
      'user-agent': auth.userAgent,
      'x-csrf-token': auth.csrf,
      'x-twitter-active-user': 'yes',
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-client-language': 'en',
    },
    validateStatus: () => true,
    timeout: 60000,
  });

  if (res.status >= 200 && res.status < 300) {
    return /** @type {Record<string, unknown>} */ (res.data);
  }

  const msg = graphqlErrorMessage(res.data, res.status);
  const err = new Error(msg);
  if (res.status === 404) err.statusCode = 404;
  else if (res.status === 429) err.statusCode = 429;
  else if (res.status === 401 || res.status === 403) err.statusCode = 401;
  else err.statusCode = 502;
  throw err;
}

/**
 * Resolve screen name to user id via UserByScreenName GraphQL.
 * @param {string} screenName
 * @param {{ bearer: string, cookie: string, csrf: string, userAgent: string, userByScreenNameQueryId: string }} auth
 * @returns {Promise<Record<string, unknown>>}
 */
async function fetchUserByScreenName(screenName, auth) {
  if (!auth.userByScreenNameQueryId) {
    const err = new Error(
      'TWITTER_USER_BY_SCREEN_NAME_QUERY_ID is not set. Copy it from x.com Network tab (UserByScreenName request URL).'
    );
    err.statusCode = 503;
    throw err;
  }

  const referer = `https://x.com/${encodeURIComponent(screenName)}`;
  const payload = await graphqlGet(
    'UserByScreenName',
    auth.userByScreenNameQueryId,
    { screen_name: screenName, withSafetyModeUserFields: true },
    USER_BY_SCREEN_NAME_FEATURES,
    { withAuxiliaryUserLabels: false },
    auth,
    referer
  );

  const user = parseUserByScreenName(payload);
  if (!user) {
    const err = new Error(`User @${screenName} not found or unavailable.`);
    err.statusCode = 404;
    throw err;
  }
  return user;
}

/**
 * Parse UserByScreenName GraphQL payload into a v2-like user object.
 * @param {Record<string, unknown>} payload
 * @returns {Record<string, unknown> | null}
 */
function parseUserByScreenName(payload) {
  const data = payload.data;
  if (!data || typeof data !== 'object') return null;
  const user = /** @type {{user?:{result?:Record<string, unknown>}}} */ (data).user;
  const result = user?.result;
  if (!result || typeof result !== 'object') return null;
  if (result.__typename === 'UserUnavailable') return null;

  const legacy =
    result.legacy && typeof result.legacy === 'object'
      ? /** @type {Record<string, unknown>} */ (result.legacy)
      : {};
  const core =
    result.core && typeof result.core === 'object'
      ? /** @type {Record<string, unknown>} */ (result.core)
      : {};
  const avatar =
    result.avatar && typeof result.avatar === 'object'
      ? /** @type {{image_url?: string}} */ (result.avatar)
      : null;

  const id = typeof result.rest_id === 'string' ? result.rest_id : null;
  if (!id) return null;

  return {
    id,
    username:
      (typeof legacy.screen_name === 'string' && legacy.screen_name) ||
      (typeof core.screen_name === 'string' && core.screen_name) ||
      '',
    name:
      (typeof legacy.name === 'string' && legacy.name) ||
      (typeof core.name === 'string' && core.name) ||
      '',
    verified: Boolean(result.is_blue_verified),
    profile_image_url:
      (avatar?.image_url && String(avatar.image_url)) ||
      (typeof legacy.profile_image_url_https === 'string' && legacy.profile_image_url_https) ||
      undefined,
    description:
      (typeof legacy.description === 'string' && legacy.description) ||
      (typeof core.description === 'string' && core.description) ||
      undefined,
    created_at:
      (typeof legacy.created_at === 'string' && legacy.created_at) ||
      (typeof core.created_at === 'string' && core.created_at) ||
      undefined,
  };
}

/**
 * Extract tweet node from a timeline entry.
 * @param {Record<string, unknown> | undefined} entry
 * @returns {Record<string, unknown> | null}
 */
function extractTweetFromEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const content = /** @type {{itemContent?:{tweet_results?:{result?:Record<string, unknown>}}}} */ (
    entry
  ).content;
  let node = content?.itemContent?.tweet_results?.result;
  if (!node || typeof node !== 'object') return null;

  if (node.__typename === 'TweetWithVisibilityResults' && node.tweet) {
    node = /** @type {Record<string, unknown>} */ (node.tweet);
  }
  if (node.__typename !== 'Tweet') return null;
  return node;
}

/**
 * Normalize GraphQL tweet to v2-like shape for JSON export.
 * @param {Record<string, unknown>} tweet
 * @returns {Record<string, unknown> | null}
 */
function normalizeGraphqlTweet(tweet) {
  const legacy =
    tweet.legacy && typeof tweet.legacy === 'object'
      ? /** @type {Record<string, unknown>} */ (tweet.legacy)
      : null;
  if (!legacy) return null;

  const id =
    (typeof tweet.rest_id === 'string' && tweet.rest_id) ||
    (typeof legacy.id_str === 'string' && legacy.id_str);
  if (!id) return null;

  return {
    id,
    text: typeof legacy.full_text === 'string' ? legacy.full_text : '',
    created_at: typeof legacy.created_at === 'string' ? legacy.created_at : undefined,
    author_id: typeof legacy.user_id_str === 'string' ? legacy.user_id_str : undefined,
    conversation_id:
      typeof legacy.conversation_id_str === 'string' ? legacy.conversation_id_str : undefined,
    lang: typeof legacy.lang === 'string' ? legacy.lang : undefined,
    public_metrics: {
      retweet_count: Number(legacy.retweet_count ?? 0),
      reply_count: Number(legacy.reply_count ?? 0),
      like_count: Number(legacy.favorite_count ?? 0),
      quote_count: Number(legacy.quote_count ?? 0),
    },
    graphql: tweet,
  };
}

/**
 * Parse timeline instructions into tweets and bottom cursor.
 * @param {unknown} instructions
 * @returns {{ tweets: Array<Record<string, unknown>>, cursor: string | null }}
 */
function parseTimelineInstructions(instructions) {
  /** @type {Array<Record<string, unknown>>} */
  const tweets = [];
  /** @type {string | null} */
  let cursor = null;

  if (!Array.isArray(instructions)) return { tweets, cursor };

  for (const instruction of instructions) {
    if (!instruction || typeof instruction !== 'object') continue;
    const inst = /** @type {Record<string, unknown>} */ (instruction);

    if (inst.type === 'TimelineAddEntries' && Array.isArray(inst.entries)) {
      for (const entry of inst.entries) {
        if (!entry || typeof entry !== 'object') continue;
        const e = /** @type {Record<string, unknown>} */ (entry);
        const entryId = typeof e.entryId === 'string' ? e.entryId : '';
        if (entryId.startsWith('cursor-bottom-')) {
          const value = /** @type {{value?: string}} */ (e.content)?.value;
          if (typeof value === 'string' && value) cursor = value;
          continue;
        }
        if (entryId.startsWith('profile-conversation-') || entryId.startsWith('tweet-')) {
          const raw = extractTweetFromEntry(e);
          const normalized = raw ? normalizeGraphqlTweet(raw) : null;
          if (normalized) tweets.push(normalized);
        }
      }
    }

    if (inst.type === 'TimelinePinEntry' && inst.entry) {
      const raw = extractTweetFromEntry(/** @type {Record<string, unknown>} */ (inst.entry));
      const normalized = raw ? normalizeGraphqlTweet(raw) : null;
      if (normalized) tweets.push(normalized);
    }
  }

  return { tweets, cursor };
}

/**
 * Fetch one page of UserTweets GraphQL timeline.
 * @param {string} userId
 * @param {string | undefined} cursor
 * @param {{ bearer: string, cookie: string, csrf: string, userAgent: string, userTweetsQueryId: string }} auth
 * @param {string} referer
 * @returns {Promise<{ tweets: Array<Record<string, unknown>>, cursor: string | null }>}
 */
async function fetchUserTweetsPage(userId, cursor, auth, referer) {
  /** @type {Record<string, unknown>} */
  const variables = {
    userId,
    count: 40,
    includePromotedContent: true,
    withQuickPromoteEligibilityTweetFields: true,
    withVoice: true,
  };
  if (cursor) variables.cursor = cursor;

  const payload = await graphqlGet(
    'UserTweets',
    auth.userTweetsQueryId,
    variables,
    USER_TWEETS_FEATURES,
    { withArticlePlainText: false },
    auth,
    referer
  );

  const timeline =
    /** @type {{user?:{result?:{timeline?:{timeline?:{instructions?:unknown}}}}}} */ (payload.data)
      ?.user?.result?.timeline?.timeline;
  const instructions = timeline?.instructions;
  return parseTimelineInstructions(instructions);
}

/**
 * Fetch tweets for a user within [startDate, endDate], paginating UserTweets GraphQL.
 * @param {string} userId
 * @param {Date} startDate
 * @param {Date} endDate
 * @param {{ bearer: string, cookie: string, csrf: string, userAgent: string, userTweetsQueryId: string }} auth
 * @param {string} referer
 * @param {number} maxPages
 * @returns {Promise<{ tweets: Array<Record<string, unknown>>, pagesFetched: number }>}
 */
async function fetchAllUserTweetsGraphql(userId, startDate, endDate, auth, referer, maxPages) {
  /** @type {Array<Record<string, unknown>>} */
  const tweets = [];
  /** @type {Set<string>} */
  const seenIds = new Set();
  let cursor;
  let pagesFetched = 0;
  let stop = false;

  for (;;) {
    if (pagesFetched >= maxPages || stop) break;

    const page = await fetchUserTweetsPage(userId, cursor, auth, referer);
    pagesFetched += 1;

    for (const tweet of page.tweets) {
      const id = typeof tweet.id === 'string' ? tweet.id : '';
      if (id && seenIds.has(id)) continue;
      if (id) seenIds.add(id);

      const createdAt = tweet.created_at ? new Date(String(tweet.created_at)) : null;
      if (createdAt && !Number.isNaN(createdAt.getTime())) {
        if (createdAt < startDate) {
          stop = true;
          continue;
        }
        if (createdAt > endDate) continue;
      }

      tweets.push(tweet);
    }

    if (!page.cursor) break;
    cursor = page.cursor;
  }

  return { tweets, pagesFetched };
}

module.exports = {
  DEFAULT_BEARER,
  getTwitterGraphqlAuthFromEnv,
  buildCookieHeader,
  graphqlErrorMessage,
  graphqlGet,
  fetchUserByScreenName,
  parseUserByScreenName,
  extractTweetFromEntry,
  normalizeGraphqlTweet,
  parseTimelineInstructions,
  fetchUserTweetsPage,
  fetchAllUserTweetsGraphql,
};
