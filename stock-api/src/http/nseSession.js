'use strict';

const axios = require('axios');

const NSE_API_URL = 'https://www.nseindia.com/api';
const NSE_HOME_URL = 'https://www.nseindia.com/';
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SESSION_TTL_MS = 5 * 60 * 1000;

const DOCUMENT_HEADERS = {
  'User-Agent': DEFAULT_USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  Connection: 'keep-alive',
};

const API_HEADERS = {
  'User-Agent': DEFAULT_USER_AGENT,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'X-Requested-With': 'XMLHttpRequest',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  Connection: 'keep-alive',
};

/**
 * Encapsulates the NSE/Akamai bot-evasion session: one homepage warmup, cached
 * cookies with a TTL, and serialized concurrent warmups so parallel enrichment
 * can't trigger 18 simultaneous homepage hits (which gets the whole session 403'd).
 *
 * Ported from backend/api/nseIndiaApi.js but instance-scoped instead of using
 * module globals — so it's injectable and test-friendly (DIP).
 */
class NseSession {
  constructor({ axiosInstance } = {}) {
    this.axios = axiosInstance || axios;
    this._cookies = null;
    this._expiry = null;
    this._activeWarmup = null;
  }

  static get API_URL() {
    return NSE_API_URL;
  }
  static get HOME_URL() {
    return NSE_HOME_URL;
  }

  clearCache() {
    this._cookies = null;
    this._expiry = null;
    this._activeWarmup = null;
  }

  _mergeSetCookie(existing, setCookie) {
    const map = new Map();
    const addPair = (key, value) => {
      const k = String(key || '').trim();
      const v = String(value ?? '')
        .replace(/[\r\n]/g, '')
        .trim();
      if (k && v) map.set(k, v);
    };
    if (existing) {
      for (const pair of existing.split(';')) {
        const eq = pair.indexOf('=');
        if (eq > 0) addPair(pair.slice(0, eq), pair.slice(eq + 1));
      }
    }
    if (setCookie) {
      for (const raw of setCookie) {
        const part = raw.split(';')[0];
        const eq = part.indexOf('=');
        if (eq > 0) addPair(part.slice(0, eq), part.slice(eq + 1));
      }
    }
    return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  /**
   * Establish/refresh the NSE session. Returns immediately if a cached session is
   * still valid (regardless of symbol) to avoid redundant homepage loads.
   * @param {string} [equitySymbol]
   * @returns {Promise<string|null>} Cookie header value.
   */
  async warmup(equitySymbol) {
    if (this._cookies && this._expiry && Date.now() < this._expiry) {
      return this._cookies;
    }
    if (this._activeWarmup) return this._activeWarmup;

    this._activeWarmup = (async () => {
      let cookie = this._cookies || '';
      const home = await this.axios.get(NSE_HOME_URL, {
        headers: DOCUMENT_HEADERS,
        timeout: 60000,
      });
      cookie = this._mergeSetCookie(cookie, home.headers['set-cookie']);

      if (equitySymbol) {
        const upper = equitySymbol.toUpperCase();
        const equityPage = await this.axios.get(
          `${NSE_HOME_URL}get-quotes/equity?symbol=${encodeURIComponent(upper)}`,
          {
            headers: {
              ...DOCUMENT_HEADERS,
              Cookie: cookie,
              Referer: NSE_HOME_URL,
              'Sec-Fetch-Site': 'same-origin',
            },
            timeout: 60000,
          }
        );
        cookie = this._mergeSetCookie(cookie, equityPage.headers['set-cookie']);
      }

      this._cookies = cookie || null;
      this._expiry = Date.now() + SESSION_TTL_MS;
      return this._cookies;
    })();

    try {
      return await this._activeWarmup;
    } finally {
      this._activeWarmup = null;
    }
  }

  async getCookies() {
    try {
      return await this.warmup();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error getting NSE cookies:', err.message);
      return null;
    }
  }

  async headers({ referer = NSE_HOME_URL, symbol } = {}) {
    const cookies = await this.warmup(symbol);
    return { ...API_HEADERS, Referer: referer, ...(cookies && { Cookie: cookies }) };
  }

  /**
   * Authenticated GET against the NSE JSON API, with one retry on 401/403 after
   * clearing the cookie cache.
   * @param {string} path - Path under /api (or a full URL).
   * @param {Object} [options] - { params, referer, symbol, timeout }
   */
  async get(path, { params, referer = NSE_HOME_URL, symbol, timeout = 60000 } = {}) {
    const url = path.startsWith('http')
      ? path
      : `${NSE_API_URL}${path.startsWith('/') ? path : `/${path}`}`;

    const doRequest = async () => {
      const headers = await this.headers({ referer, symbol });
      return this.axios.get(url, { headers, params, timeout });
    };

    try {
      return await doRequest();
    } catch (error) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        this.clearCache();
        return doRequest();
      }
      throw error;
    }
  }
}

module.exports = { NseSession, NSE_API_URL, NSE_HOME_URL };
