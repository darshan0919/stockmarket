const axios = require('axios');

const NSE_API_URL = 'https://www.nseindia.com/api';
const NSE_HOME_URL = 'https://www.nseindia.com/';
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SESSION_TTL_MS = 5 * 60 * 1000;

/** @see {@link docs/backend/api/nseIndiaApi.md} */
let sessionCookies = null;
let sessionExpiry = null;

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
 * Merge Set-Cookie headers into a single Cookie request header.
 * @param {string} existing - Existing cookie header
 * @param {string[]|undefined} setCookie - Response set-cookie array
 * @returns {string}
 */
const mergeSetCookie = (existing, setCookie) => {
  const map = new Map();
  const addPair = (key, value) => {
    const k = String(key || '').trim();
    const v = String(value ?? '')
      .replace(/[\r\n]/g, '')
      .trim();
    if (k && v) {
      map.set(k, v);
    }
  };

  if (existing) {
    for (const pair of existing.split(';')) {
      const eq = pair.indexOf('=');
      if (eq > 0) {
        addPair(pair.slice(0, eq), pair.slice(eq + 1));
      }
    }
  }
  if (setCookie) {
    for (const raw of setCookie) {
      const part = raw.split(';')[0];
      const eq = part.indexOf('=');
      if (eq > 0) {
        addPair(part.slice(0, eq), part.slice(eq + 1));
      }
    }
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
};

/**
 * Clear cached NSE session cookies.
 */
const clearNseCookieCache = () => {
  sessionCookies = null;
  sessionExpiry = null;
};

/**
 * Establish NSE session (homepage + optional equity quote page).
 * @param {string} [equitySymbol]
 * @returns {Promise<string|null>} Cookie header value
 */
const warmupNseSession = async (equitySymbol) => {
  if (sessionCookies && sessionExpiry && Date.now() < sessionExpiry && !equitySymbol) {
    return sessionCookies;
  }

  let cookie = sessionCookies || '';

  const home = await axios.get(NSE_HOME_URL, {
    headers: DOCUMENT_HEADERS,
    timeout: 15000,
  });
  cookie = mergeSetCookie(cookie, home.headers['set-cookie']);

  if (equitySymbol) {
    const upper = equitySymbol.toUpperCase();
    const equityPage = await axios.get(
      `${NSE_HOME_URL}get-quotes/equity?symbol=${encodeURIComponent(upper)}`,
      {
        headers: {
          ...DOCUMENT_HEADERS,
          Cookie: cookie,
          Referer: NSE_HOME_URL,
          'Sec-Fetch-Site': 'same-origin',
        },
        timeout: 15000,
      }
    );
    cookie = mergeSetCookie(cookie, equityPage.headers['set-cookie']);
  }

  sessionCookies = cookie || null;
  sessionExpiry = Date.now() + SESSION_TTL_MS;
  return sessionCookies;
};

/**
 * Serialize session cookies for PDF/manual requests.
 * @returns {Promise<string|null>}
 */
const getNseCookies = async () => {
  try {
    return await warmupNseSession();
  } catch (error) {
    console.error('Error getting NSE cookies:', error.message);
    return null;
  }
};

/**
 * Build authenticated headers for NSE JSON API requests.
 * @param {Object} [options]
 * @param {string} [options.referer]
 * @param {string} [options.symbol]
 * @returns {Promise<Object>}
 */
const getNseHeaders = async ({ referer = NSE_HOME_URL, symbol } = {}) => {
  const cookies = await warmupNseSession(symbol);
  return {
    ...API_HEADERS,
    Referer: referer,
    ...(cookies && { Cookie: cookies }),
  };
};

/**
 * Authenticated GET to NSE API with session warmup and one retry on 401/403.
 * @param {string} path
 * @param {Object} [options]
 * @returns {Promise<import('axios').AxiosResponse>}
 */
const nseGet = async (path, { params, referer = NSE_HOME_URL, symbol, timeout = 15000 } = {}) => {
  const url = path.startsWith('http')
    ? path
    : `${NSE_API_URL}${path.startsWith('/') ? path : `/${path}`}`;

  const doRequest = async () => {
    const headers = await getNseHeaders({ referer, symbol });
    return axios.get(url, { headers, params, timeout });
  };

  try {
    return await doRequest();
  } catch (error) {
    const status = error.response?.status;
    if (status === 401 || status === 403) {
      clearNseCookieCache();
      return doRequest();
    }
    throw error;
  }
};

/**
 * Stock search autocomplete (NSE), with BSE smart-search fallback.
 * @param {string} query
 * @returns {Promise<Object>}
 */
const searchAutocomplete = async (query) => {
  try {
    const response = await nseGet('/search/autocomplete', {
      params: { q: query },
      referer: NSE_HOME_URL,
      timeout: 10000,
    });
    if (response.data?.symbols?.length) {
      return response.data;
    }
  } catch (error) {
    const status = error.response?.status;
    if (status && status !== 404) {
      throw error;
    }
  }

  const { bseSmartSearch } = require('./bseIndiaApi');
  return bseSmartSearch(query);
};

/**
 * Equity quote for a symbol.
 * @param {string} symbol
 * @returns {Promise<Object>}
 */
const getQuoteEquity = async (symbol) => {
  const upperSymbol = symbol.toUpperCase();
  const response = await nseGet('/quote-equity', {
    params: { symbol: upperSymbol },
    referer: `${NSE_HOME_URL}get-quotes/equity?symbol=${encodeURIComponent(upperSymbol)}`,
    symbol: upperSymbol,
    timeout: 10000,
  });
  return response.data;
};

/**
 * Corporate announcements for a symbol.
 * @param {string} symbol
 * @param {Object} [extraParams]
 * @returns {Promise<Array>}
 */
const getCorporateAnnouncements = async (symbol, extraParams = {}) => {
  const upperSymbol = symbol.toUpperCase();
  const response = await nseGet('/corporate-announcements', {
    params: { index: 'equities', symbol: upperSymbol, ...extraParams },
    referer: `${NSE_HOME_URL}get-quotes/equity?symbol=${encodeURIComponent(upperSymbol)}`,
    symbol: upperSymbol,
    timeout: 15000,
  });
  const raw = response.data;
  return Array.isArray(raw) ? raw : [];
};

/**
 * Corporates financial results (quarterly).
 * @param {string} symbol
 * @param {string} issuer
 * @returns {Promise<Array>}
 */
const getCorporatesFinancialResults = async (symbol, issuer) => {
  const upperSymbol = symbol.toUpperCase();
  const response = await nseGet('/corporates-financial-results', {
    params: {
      index: 'equities',
      symbol: upperSymbol,
      issuer,
      period: 'Quarterly',
    },
    referer: `${NSE_HOME_URL}get-quotes/equity?symbol=${encodeURIComponent(upperSymbol)}`,
    symbol: upperSymbol,
    timeout: 15000,
  });
  return response.data || [];
};

/**
 * Integrated filing results (recent quarters).
 * @param {string} symbol
 * @param {string} issuer
 * @returns {Promise<Array>}
 */
const getIntegratedFilingResults = async (symbol, issuer) => {
  const upperSymbol = symbol.toUpperCase();
  const response = await nseGet('/integrated-filing-results', {
    params: {
      index: 'equities',
      symbol: upperSymbol,
      issuer,
      period_ended: 'all',
      type: 'Integrated Filing- Financials',
      page: 1,
      size: 20,
    },
    referer: `${NSE_HOME_URL}get-quotes/equity?symbol=${encodeURIComponent(upperSymbol)}`,
    symbol: upperSymbol,
    timeout: 15000,
  });
  return response.data?.data || [];
};

/**
 * NextApi GetQuoteApi wrapper.
 * @param {string} functionName
 * @param {string} symbol
 * @param {Object} [extraParams]
 * @returns {Promise<*>}
 */
const getQuoteApi = async (functionName, symbol, extraParams = {}) => {
  const upperSymbol = symbol.toUpperCase();
  const response = await nseGet('/NextApi/apiClient/GetQuoteApi', {
    params: {
      functionName,
      symbol: upperSymbol,
      marketApiType: 'equities',
      ...extraParams,
    },
    referer: `${NSE_HOME_URL}get-quotes/equity?symbol=${encodeURIComponent(upperSymbol)}`,
    symbol: upperSymbol,
    timeout: 15000,
  });
  return response.data?.data ?? response.data ?? [];
};

const formatDate = (date) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

/**
 * Fetch upcoming financial results from NSE event calendar.
 * @returns {Promise<Object[]>}
 */
const upcomingResults = async () => {
  try {
    const today = new Date();
    const oneYearLater = new Date(today);
    oneYearLater.setFullYear(today.getFullYear() + 1);

    const response = await nseGet('/event-calendar', {
      params: {
        index: 'equities',
        from_date: formatDate(today),
        to_date: formatDate(oneYearLater),
        subject: 'Financial Results',
      },
      timeout: 15000,
    });

    return response.data || [];
  } catch (error) {
    console.error('Error fetching NSE upcoming results:', error.message);
    return [];
  }
};

/**
 * Fetch historical price-volume-deliverable data for a symbol.
 * @param {string} symbol
 * @param {string} fromDate
 * @param {string} toDate
 * @returns {Promise<Array>}
 */
const getPriceVolumeDeliverable = async (symbol, fromDate, toDate) => {
  const upperSymbol = symbol.toUpperCase();
  const response = await nseGet('/historicalOR/generateSecurityWiseHistoricalData', {
    params: {
      from: fromDate,
      to: toDate,
      symbol: upperSymbol,
      type: 'priceVolumeDeliverable',
      series: 'ALL',
    },
    referer: `${NSE_HOME_URL}get-quotes/equity?symbol=${encodeURIComponent(upperSymbol)}`,
    symbol: upperSymbol,
    timeout: 20000,
  });
  return Array.isArray(response.data) ? response.data : response.data?.data || [];
};

module.exports = {
  NSE_API_URL,
  NSE_HOME_URL,
  clearNseCookieCache,
  getNseCookies,
  getNseHeaders,
  warmupNseSession,
  nseGet,
  searchAutocomplete,
  getQuoteEquity,
  getCorporateAnnouncements,
  getCorporatesFinancialResults,
  getIntegratedFilingResults,
  getQuoteApi,
  upcomingResults,
  formatDate,
  getPriceVolumeDeliverable,
};
