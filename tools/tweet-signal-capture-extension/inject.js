/**
 * Runs in the page's MAIN world (not the isolated content-script world), so
 * this fetch/XHR override actually sees the page's own real network calls —
 * unlike a normal isolated-world content script, which cannot intercept
 * the page's fetch/XHR because it lives in a separate JS realm.
 *
 * Captures ListLatestTweetsTimeline GraphQL responses and, instead of
 * dumping the whole (huge, deeply-nested) JSON body to the console, WALKS
 * the real parsed object here — where we still have proper JS object
 * access — and logs one compact, flat, already-paired row per tweet:
 * {author, createdAt, text, id}. This replaced an earlier version that
 * logged the raw body and relied on regex to re-pair fields afterward;
 * that broke because screen_name/created_at/full_text are not at a fixed
 * text distance from each other in the raw JSON, so no fixed-window regex
 * could pair them reliably. Parsing here, before serialization, sidesteps
 * that entirely.
 */
(function () {
  if (window.__tsCaptureInstalled) return;
  window.__tsCaptureInstalled = true;

  const TAG = '[TWEET_SIGNAL_CAPTURE]';
  const ROW_TAG = '[TWEET_SIGNAL_ROW]';
  const MATCH = 'ListLatestTweetsTimeline';

  /** Find the first value for `key` anywhere in a subtree (DFS). Scoped
   * per-tweet by the caller, so this can't cross-pair fields from
   * different tweets. */
  function findFirst(obj, key, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 12) return undefined;
    if (key in obj) return obj[key];
    for (const k of Object.keys(obj)) {
      const found = findFirst(obj[k], key, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  function extractTweetRow(tweetResult) {
    if (!tweetResult) return null;
    const legacy = tweetResult.legacy || tweetResult.tweet?.legacy || tweetResult;
    const text =
      legacy?.full_text ||
      findFirst(tweetResult, 'full_text') ||
      tweetResult.note_tweet?.note_tweet_results?.result?.text;
    if (!text) return null;
    const author =
      tweetResult.core?.user_results?.result?.legacy?.screen_name ||
      tweetResult.core?.user_results?.result?.core?.screen_name ||
      findFirst(tweetResult.core, 'screen_name') ||
      null;
    const createdAt = legacy?.created_at || findFirst(tweetResult, 'created_at') || null;
    const id = legacy?.id_str || tweetResult.rest_id || null;
    return { author, createdAt, text, id };
  }

  /** Walk a ListLatestTweetsTimeline response body and emit one row per
   * tweet found, handling both plain timeline items and TimelineModule
   * (conversation-thread) entries. */
  function walkAndLogRows(body) {
    try {
      const instructions = findFirst(body, 'instructions') || [];
      let count = 0;
      for (const instruction of instructions) {
        const entries = instruction.entries || [];
        for (const entry of entries) {
          const itemContent = entry?.content?.itemContent;
          const items = entry?.content?.items;
          const tweetResults = [];
          if (itemContent?.tweet_results?.result) tweetResults.push(itemContent.tweet_results.result);
          if (Array.isArray(items)) {
            for (const it of items) {
              const r = it?.item?.itemContent?.tweet_results?.result;
              if (r) tweetResults.push(r);
            }
          }
          for (const tr of tweetResults) {
            const row = extractTweetRow(tr);
            if (row) {
              console.log(ROW_TAG, JSON.stringify(row));
              count++;
            }
          }
        }
      }
      console.log(TAG, `parsed ${count} tweet row(s) from response`);
    } catch (e) {
      console.log(TAG, 'ERROR_WALK', e && e.message);
    }
  }

  function logCapture(url, body) {
    try {
      walkAndLogRows(body);
    } catch (e) {
      console.log(TAG, 'ERROR_STRINGIFY', e && e.message);
    }
  }

  // --- fetch ---
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
      if (url && url.includes(MATCH)) {
        res
          .clone()
          .json()
          .then((body) => logCapture(url, body))
          .catch((e) => console.log(TAG, 'ERROR_JSON', e && e.message));
      }
    } catch (e) {
      /* never let capture break the real request */
    }
    return res;
  };

  // --- XHR (fallback, in case X uses XHR for some calls) ---
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__ts_url = url;
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', () => {
      try {
        if (this.__ts_url && this.__ts_url.includes(MATCH)) {
          logCapture(this.__ts_url, JSON.parse(this.responseText));
        }
      } catch (e) {
        /* ignore */
      }
    });
    return origSend.apply(this, args);
  };

  console.log(TAG, 'HOOK_INSTALLED', location.href);
})();
