/**
 * Runs in the page's MAIN world (not the isolated content-script world), so
 * this fetch/XHR override actually sees the page's own real network calls —
 * unlike a normal isolated-world content script, which cannot intercept
 * the page's fetch/XHR because it lives in a separate JS realm.
 *
 * Captures ListLatestTweetsTimeline GraphQL responses and logs the full JSON
 * body to the console with a distinct tag, so it can be read back out via
 * DevTools / the Chrome MCP's console-reading tool without ever writing
 * anything to disk or to a remote server.
 */
(function () {
  if (window.__tsCaptureInstalled) return;
  window.__tsCaptureInstalled = true;

  const TAG = '[TWEET_SIGNAL_CAPTURE]';
  const MATCH = 'ListLatestTweetsTimeline';

  function logCapture(url, body) {
    try {
      console.log(TAG, JSON.stringify({ url, capturedAt: new Date().toISOString(), body }));
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
