'use strict';

// BSE returns malformed response headers that break axios/https' parser; undici's
// fetch tolerates them. Node 18+ exposes a global fetch backed by undici, so we use
// that and fall back to the undici package if a global isn't present.
let _fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null;
if (!_fetch) {
  // eslint-disable-next-line global-require
  _fetch = require('undici').fetch;
}

const BSE_API_URL = 'https://api.bseindia.com/BseIndiaAPI/api';
const BSE_REQUEST_TIMEOUT_MS = 12000;

const BSE_BROWSER_HEADERS = {
  Referer: 'https://www.bseindia.com/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * Build a BSE API URL with query params.
 * @param {string} path - Path under BSE_API_URL (e.g. 'SecurityPosition/w').
 * @param {Record<string, string|number>} [params]
 * @returns {string}
 */
function buildBseUrl(path, params = {}) {
  const url = new URL(`${BSE_API_URL}/${path.replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * GET text from the BSE API.
 * @param {string} path
 * @param {Object} [options] - { params, timeout }
 * @returns {Promise<{ data: string, status: number }>}
 */
async function bseGetText(path, { params = {}, timeout = BSE_REQUEST_TIMEOUT_MS } = {}) {
  const url = buildBseUrl(path, params);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await _fetch(url, {
      method: 'GET',
      headers: BSE_BROWSER_HEADERS,
      signal: controller.signal,
    });
    const data = await response.text();
    if (!response.ok) {
      const err = new Error(`BSE request failed with status ${response.status}`);
      err.status = response.status;
      throw err;
    }
    return { data, status: response.status };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET JSON from the BSE API.
 * @param {string} path
 * @param {Object} [options]
 * @returns {Promise<*>}
 */
async function bseGetJson(path, options = {}) {
  const { data } = await bseGetText(path, options);
  return JSON.parse(data);
}

module.exports = {
  BSE_API_URL,
  BSE_REQUEST_TIMEOUT_MS,
  BSE_BROWSER_HEADERS,
  buildBseUrl,
  bseGetText,
  bseGetJson,
};
