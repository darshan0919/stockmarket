'use strict';

const fs = require('fs');

/**
 * Perplexity Finance session auth.
 *
 * `https://www.perplexity.ai/rest/finance/earnings/*` is Perplexity's own
 * internal web-app API — undocumented, not a published product API. Two tiers
 * of auth were observed live (2026-07-24, via a captured browser session):
 *
 *   - The earnings-EVENTS-LIST endpoint (`/rest/finance/earnings/{TICKER}`)
 *     worked with only the `x-pplx-account` header and browser-fingerprint
 *     headers — no Cookie needed. It may be effectively public/anonymous-
 *     accessible, or just tolerant of an unauthenticated session; treat this
 *     as unconfirmed until re-tested without any cookie at all.
 *   - The TRANSCRIPT endpoint (`/rest/finance/earnings/{TICKER}/transcript/{id}`)
 *     required a full authenticated session: `__Secure-next-auth.session-token`,
 *     `cf_clearance` (Cloudflare challenge cookie — short-lived, minutes to a
 *     few hours), and several `pplx.*`/`_dd_s*` tracking cookies. There is no
 *     way to mint these programmatically — they only come from a real logged-in
 *     browser session (DevTools → Application → Cookies, or copy the `cookie`
 *     header from a captured request).
 *
 * Because `cf_clearance` in particular expires quickly, this integration
 * WILL go stale between runs more often than the Stockscans/Screener
 * cookie-based integrations. Callers should treat a 401/403/419-shaped
 * failure here as "refresh PERPLEXITY_COOKIES", not as a real absence of data,
 * and should not block the rest of the pipeline on it (see
 * `get-latest-concall-transcript.js`, which treats Perplexity as a soft tier
 * that falls through to the recording-announcement pipeline on any failure).
 *
 * Resolution order (first hit wins), mirroring ScreenerAuth/StockscansAuth:
 *   1. explicit values passed to the constructor
 *   2. process.env.PERPLEXITY_COOKIES / PERPLEXITY_ACCOUNT_ID
 *   3. a .env file on disk (same keys)
 */
class PerplexityAuth {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.cookies]    - Full Cookie header captured from a logged-in browser session.
   * @param {string} [opts.accountId]  - The `x-pplx-account` header value.
   * @param {string} [opts.envPath]
   * @param {string} [opts.userAgent]
   */
  constructor({ cookies, accountId, envPath, userAgent } = {}) {
    this._cookies = cookies || null;
    this._accountId = accountId || null;
    this._envPath = envPath || null;
    this._userAgent =
      userAgent ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';
  }

  _envFile(key) {
    const p = this._envPath;
    if (!p || !fs.existsSync(p)) return null;
    for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      if (line.slice(0, eq).trim() === key) {
        const val = line.slice(eq + 1).trim();
        if (val) return val;
      }
    }
    return null;
  }

  _resolve(key, explicit) {
    if (explicit) return explicit;
    if (process.env[key]) return process.env[key].trim();
    return this._envFile(key);
  }

  /** Full Cookie header, or null if unconfigured (transcript endpoint needs this). */
  cookieHeader() {
    return this._resolve('PERPLEXITY_COOKIES', this._cookies);
  }

  /** The `x-pplx-account` header value, or null if unconfigured. */
  accountId() {
    return this._resolve('PERPLEXITY_ACCOUNT_ID', this._accountId);
  }

  /**
   * Browser-fingerprint + optional auth headers for a Perplexity Finance call.
   * @param {Object} opts
   * @param {string} opts.endpoint - Full URL, echoed into x-perplexity-request-endpoint.
   * @param {string} [opts.referer]
   * @param {boolean} [opts.requireCookie=false] - Throw if no cookie configured (transcript endpoint).
   */
  headers({ endpoint, referer, requireCookie = false }) {
    const cookie = this.cookieHeader();
    if (requireCookie && !cookie) {
      throw new Error(
        'PERPLEXITY_COOKIES not set. This endpoint needs a logged-in Perplexity ' +
          'session — open perplexity.ai/finance in a browser while logged in, ' +
          'DevTools → Network → find a /rest/finance/earnings/*/transcript/* ' +
          'request, copy its full `cookie` request header, and set ' +
          'PERPLEXITY_COOKIES in .env. Also set PERPLEXITY_ACCOUNT_ID from the ' +
          "same request's `x-pplx-account` header. Expect to refresh this " +
          'periodically — the `cf_clearance` cookie inside it expires quickly.'
      );
    }
    const accountId = this.accountId();
    const h = {
      accept: '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': this._userAgent,
      'x-app-apiclient': 'default',
      'x-app-apiversion': '2.18',
      'x-perplexity-request-endpoint': endpoint,
      'x-perplexity-request-reason': 'finance',
      'x-perplexity-request-try-number': '1',
    };
    if (referer) h.referer = referer;
    if (accountId) h['x-pplx-account'] = accountId;
    if (cookie) h.cookie = cookie;
    return h;
  }

  /** True if a full authenticated session (cookie) is configured. */
  isFullyConfigured() {
    return Boolean(this.cookieHeader());
  }
}

module.exports = { PerplexityAuth };
