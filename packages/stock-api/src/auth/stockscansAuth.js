'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Unified Stockscans auth.
 *
 * ONE token source for the whole stack. Resolution order (first hit wins):
 *   1. explicit token passed to the constructor
 *   2. process.env.STOCKSCANS_AUTH_TOKEN          (canonical)
 *   3. process.env.STOCKSCANS_AUTHTOKEN           (legacy — deprecated, 1 cycle)
 *   4. a .env file on disk (canonical var, then legacy)
 *
 * The token is read lazily on every request so a refresh (updateAuthToken) takes
 * effect without restarting the consuming process — preserving the old Python
 * behaviour.
 */
class StockscansAuth {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.token]   - Explicit token (highest priority).
   * @param {string} [opts.envPath] - Path to a .env file to read as a fallback.
   */
  constructor({ token, envPath } = {}) {
    this._explicit = token || null;
    this._envPath = envPath || null;
    this._warnedLegacy = false;
  }

  _readFromEnvFile(key) {
    if (!this._envPath || !fs.existsSync(this._envPath)) return null;
    for (const raw of fs.readFileSync(this._envPath, 'utf8').split(/\r?\n/)) {
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

  _warnLegacy(source) {
    if (this._warnedLegacy) return;
    this._warnedLegacy = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[stock-api] Using legacy STOCKSCANS_AUTHTOKEN from ${source}. ` +
        'Rename to STOCKSCANS_AUTH_TOKEN — the legacy name is supported for one release only.'
    );
  }

  /**
   * @returns {string} The resolved auth token.
   * @throws {Error} If no token can be found anywhere.
   */
  getToken() {
    if (this._explicit) return this._explicit;

    if (process.env.STOCKSCANS_AUTH_TOKEN) {
      return process.env.STOCKSCANS_AUTH_TOKEN.trim();
    }
    if (process.env.STOCKSCANS_AUTHTOKEN) {
      this._warnLegacy('environment');
      return process.env.STOCKSCANS_AUTHTOKEN.trim();
    }

    const canonical = this._readFromEnvFile('STOCKSCANS_AUTH_TOKEN');
    if (canonical) return canonical;

    const legacy = this._readFromEnvFile('STOCKSCANS_AUTHTOKEN');
    if (legacy) {
      this._warnLegacy(this._envPath);
      return legacy;
    }

    throw new Error(
      'STOCKSCANS_AUTH_TOKEN not set. Log in to stockscans.in, copy the authtoken ' +
        'cookie, and set STOCKSCANS_AUTH_TOKEN (env or .env).'
    );
  }

  /**
   * Build the standard headers for a Stockscans request.
   * @param {Object} [opts]
   * @param {string} [opts.referer]
   * @param {string} [opts.userAgent]
   * @param {boolean} [opts.optional=false] - When true, omit the auth cookie if no
   *   token is available instead of throwing (for public, unauthenticated endpoints).
   * @returns {Object}
   */
  headers({ referer, userAgent, optional = false } = {}) {
    let token = null;
    try {
      token = this.getToken();
    } catch (err) {
      if (!optional) throw err;
    }
    const h = {
      accept: 'application/json',
      'content-type': 'application/json',
      origin: 'https://www.stockscans.in',
    };
    if (token) h.cookie = `authtoken=${token}`;
    if (userAgent) h['user-agent'] = userAgent;
    if (referer) h.referer = referer;
    return h;
  }
}

module.exports = { StockscansAuth };
