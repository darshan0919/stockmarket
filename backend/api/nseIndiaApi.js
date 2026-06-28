/**
 * @fileoverview NSE India API wrapper.
 *
 * Session/transport (cookie warmup, authenticated GET with 401/403 retry) and the
 * price-action methods (quote, live symbol data / delivery %, price-volume-
 * deliverable, live variations) delegate to the centralized `@stock/api` package.
 * Fundamental NSE endpoints (corporate announcements, financial results, integrated
 * filings, event calendar) remain here for now, running over the SAME shared NSE
 * session — so there is no duplicated cookie/session logic. They are candidates to
 * move onto Stockscans in a later pass.
 *
 * Export surface is unchanged so existing consumers don't change.
 * @see {@link docs/backend/api/nseIndiaApi.md}
 */

const { nse, nseSession, NseSession } = require('@stock/api');

const NSE_API_URL = NseSession.API_URL;
const NSE_HOME_URL = NseSession.HOME_URL;

// ── Session / transport → shared NseSession singleton ─────────────────────────

const clearNseCookieCache = () => nseSession.clearCache();
const getNseCookies = () => nseSession.getCookies();
const getNseHeaders = (opts = {}) => nseSession.headers(opts);
const warmupNseSession = (equitySymbol) => nseSession.warmup(equitySymbol);
const nseGet = (path, options = {}) => nseSession.get(path, options);

// ── Price-action → delegate to the centralized client ─────────────────────────

const getQuoteEquity = (symbol) => nse.getQuote(symbol);
const getSymbolData = (symbol, series = 'EQ') => nse.getSymbolData(symbol, series);
const getPriceVolumeDeliverable = (symbol, fromDate, toDate) =>
  nse.getPriceVolumeDeliverable(symbol, fromDate, toDate);
const getLiveVariations = (variation = 'gainers', exchSeg = '') =>
  nse.getLiveVariations(variation, exchSeg);

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatDate = (date) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

const quoteReferer = (symbol) =>
  `${NSE_HOME_URL}get-quotes/equity?symbol=${encodeURIComponent(symbol)}`;

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
    if (response.data?.symbols?.length) return response.data;
  } catch (error) {
    const status = error.response?.status;
    if (status && status !== 404) throw error;
  }
  const { bseSmartSearch } = require('./bseIndiaApi');
  return bseSmartSearch(query);
};

// ── Fundamental NSE endpoints (kept local, shared session) ────────────────────

/**
 * Corporate announcements for a symbol.
 * @param {string} symbol @param {Object} [extraParams]
 * @returns {Promise<Array>}
 */
const getCorporateAnnouncements = async (symbol, extraParams = {}) => {
  const upper = symbol.toUpperCase();
  const response = await nseGet('/corporate-announcements', {
    params: { index: 'equities', symbol: upper, ...extraParams },
    referer: quoteReferer(upper),
    symbol: upper,
    timeout: 60000,
  });
  return Array.isArray(response.data) ? response.data : [];
};

/**
 * Corporates financial results (quarterly).
 * @param {string} symbol @param {string} issuer
 * @returns {Promise<Array>}
 */
const getCorporatesFinancialResults = async (symbol, issuer) => {
  const upper = symbol.toUpperCase();
  const response = await nseGet('/corporates-financial-results', {
    params: { index: 'equities', symbol: upper, issuer, period: 'Quarterly' },
    referer: quoteReferer(upper),
    symbol: upper,
    timeout: 60000,
  });
  return response.data || [];
};

/**
 * Integrated filing results (recent quarters).
 * @param {string} symbol @param {string} issuer
 * @returns {Promise<Array>}
 */
const getIntegratedFilingResults = async (symbol, issuer) => {
  const upper = symbol.toUpperCase();
  const response = await nseGet('/integrated-filing-results', {
    params: {
      index: 'equities',
      symbol: upper,
      issuer,
      period_ended: 'all',
      type: 'Integrated Filing- Financials',
      page: 1,
      size: 20,
    },
    referer: quoteReferer(upper),
    symbol: upper,
    timeout: 60000,
  });
  return response.data?.data || [];
};

/**
 * NextApi GetQuoteApi wrapper.
 * @param {string} functionName @param {string} symbol @param {Object} [extraParams]
 * @returns {Promise<*>}
 */
const getQuoteApi = async (functionName, symbol, extraParams = {}) => {
  const upper = symbol.toUpperCase();
  const response = await nseGet('/NextApi/apiClient/GetQuoteApi', {
    params: { functionName, symbol: upper, marketApiType: 'equities', ...extraParams },
    referer: quoteReferer(upper),
    symbol: upper,
    timeout: 60000,
  });
  return response.data?.data ?? response.data ?? [];
};

/**
 * Fetch upcoming financial results from the NSE event calendar.
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
      timeout: 60000,
    });
    return response.data || [];
  } catch (error) {
    console.error('Error fetching NSE upcoming results:', error.message);
    return [];
  }
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
  getSymbolData,
  getCorporateAnnouncements,
  getCorporatesFinancialResults,
  getIntegratedFilingResults,
  getQuoteApi,
  upcomingResults,
  formatDate,
  getPriceVolumeDeliverable,
  getLiveVariations,
};
