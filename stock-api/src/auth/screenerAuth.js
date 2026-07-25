'use strict';

const fs = require('fs');

/**
 * Screener.in session auth.
 *
 * Screener's per-company page is session-cookie authenticated: a valid login
 * unlocks the warehouse-backed extras (full ratios, quarter insights, peer
 * medians) that the pre-PEAD skill leans on. Two cookies matter:
 *   - sessionid  — the login session (this is what expires)
 *   - csrftoken  — required by Screener for any state-changing request; sent
 *                  alongside sessionid for parity with a real browser
 *
 * Resolution order (first hit wins), mirroring StockscansAuth:
 *   1. explicit values passed to the constructor
 *   2. process.env.SCREENER_SESSIONID / SCREENER_CSRFTOKEN
 *   3. process.env.SCREENER_COOKIES (a full Cookie header — overrides the two above)
 *   4. a .env file on disk (same keys)
 *
 * Read lazily on every request so refreshing the .env takes effect without a
 * restart — the user refreshes the cookie in the browser, pastes it into .env,
 * and the next run picks it up.
 */
class ScreenerAuth {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.sessionid]
   * @param {string} [opts.csrftoken]
   * @param {string} [opts.cookies]   - Full Cookie header (overrides the pair).
   * @param {string} [opts.envPath]   - Path to a .env file to read as a fallback.
   * @param {string} [opts.userAgent]
   */
  constructor({ sessionid, csrftoken, cookies, envPath, userAgent } = {}) {
    this._sessionid = sessionid || null;
    this._csrftoken = csrftoken || null;
    this._cookies = cookies || null;
    this._envPath = envPath || null;
    this._userAgent =
      userAgent ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';
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

  /** The full Cookie header string, or throws if nothing usable is configured. */
  cookieHeader() {
    // Explicit / env full-cookie override wins.
    const full = this._resolve('SCREENER_COOKIES', this._cookies);
    if (full) return full;

    const sessionid = this._resolve('SCREENER_SESSIONID', this._sessionid);
    const csrftoken = this._resolve('SCREENER_CSRFTOKEN', this._csrftoken);
    if (!sessionid) {
      throw new Error(
        'SCREENER_SESSIONID not set. Log in to screener.in, copy the `sessionid` ' +
          '(and `csrftoken`) cookie from DevTools → Application → Cookies, and set ' +
          'SCREENER_SESSIONID / SCREENER_CSRFTOKEN in .env.'
      );
    }
    const parts = [];
    if (csrftoken) parts.push(`csrftoken=${csrftoken}`);
    parts.push(`sessionid=${sessionid}`);
    return parts.join('; ');
  }

  /** Browser-like headers for a GET of a Screener company page. */
  headers({ referer = 'https://www.screener.in/', optional = false } = {}) {
    let cookie = null;
    try {
      cookie = this.cookieHeader();
    } catch (err) {
      if (!optional) throw err;
    }
    const h = {
      accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,' +
        'image/webp,image/apng,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': this._userAgent,
      referer,
      'upgrade-insecure-requests': '1',
    };
    if (cookie) h.cookie = cookie;
    return h;
  }

  /** True if a usable session cookie is configured (does not check server-side validity). */
  isConfigured() {
    try {
      this.cookieHeader();
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = { ScreenerAuth };
