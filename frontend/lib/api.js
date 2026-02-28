/**
 * API Client - Centralized Axios instance for backend communication
 * @module lib/api
 * @see {@link docs/frontend/lib/api.md} for detailed documentation
 * @see {@link docs/API_REFERENCE.md} for backend API documentation
 * @see {@link frontend/lib/__tests__/api.test.js} for tests
 */

import axios from 'axios';

/** @constant {string} API_URL - Backend API base URL */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
if (process.env.NODE_ENV !== 'production') {
  console.log('API Client initialized with URL:', API_URL);
}

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('API Request:', config.method.toUpperCase(), config.url);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (process.env.NODE_ENV !== 'production') {
      if (error.response) {
        console.error('API Error:', error.response.data);
      } else if (error.request) {
        console.error('Network Error:', error.message);
      } else {
        console.error('Error:', error.message);
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Stock API methods
 * @see {@link docs/API_REFERENCE.md#stock-apis} for endpoint documentation
 */
export const stockAPI = {
  /** Search stocks by symbol/name @see GET /api/stocks/search */
  search: (query, page = 1, limit = 10) =>
    api.get(`/stocks/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`),
  /** Get stock details @see GET /api/stocks/:symbol */
  getDetails: (symbol) => api.get(`/stocks/${symbol}`),
  /** Get technical indicators @see GET /api/stocks/:symbol/technicals */
  getTechnicals: (symbol) => api.get(`/stocks/${symbol}/technicals`),
  /** Get financial statements @see GET /api/stocks/:symbol/financials */
  getFinancials: (symbol, quarters = 4) =>
    api.get(`/stocks/${symbol}/financials?quarters=${quarters}`),
  /** Get quarterly results @see GET /api/stocks/:symbol/quarterly */
  getQuarterlyResults: (symbol) => api.get(`/stocks/${symbol}/quarterly`),
};

// Transcript APIs
export const transcriptAPI = {
  getTranscripts: (symbol) => api.get(`/result-transcript/${symbol}`),
  analyzeTranscript: (symbol, attachmentName) =>
    api.post(`/result-transcript/${symbol}/analyze`, { attachmentName }, { timeout: 200000 }),
};

/**
 * Screener API methods
 * @see {@link docs/API_REFERENCE.md#screener-apis} for endpoint documentation
 */
export const screenerAPI = {
  /** Run stock screener with filters @see POST /api/screener/run */
  runScreener: (filters, sortBy = 'market_cap', sortOrder = 'desc', limit = 100) =>
    api.post('/screener/run', {
      filters,
      sort_by: sortBy,
      sort_order: sortOrder,
      limit,
    }),
};

/**
 * Watchlist API methods
 * @see {@link docs/API_REFERENCE.md#watchlist-apis} for endpoint documentation
 */
export const watchlistAPI = {
  /** Get all watchlist items @see GET /api/watchlist */
  getAll: () => api.get('/watchlist'),
  /** Add stock to watchlist @see POST /api/watchlist/:symbol */
  add: (symbol) => api.post(`/watchlist/${symbol}`),
  /** Remove stock from watchlist @see DELETE /api/watchlist/:symbol */
  remove: (symbol) => api.delete(`/watchlist/${symbol}`),
};

/**
 * Market API methods
 * @see {@link docs/API_REFERENCE.md#market-apis} for endpoint documentation
 */
export const marketAPI = {
  /** Get market indices (Nifty, Sensex) @see GET /api/market/indices */
  getIndices: () => api.get('/market/indices'),
  /** Get market statistics @see GET /api/market/stats */
  getStats: () => api.get('/market/stats'),
};

// Upcoming Results APIs
export const upcomingResultsAPI = {
  getAll: (page = 1, limit = 10) => api.get(`/upcoming-results?page=${page}&limit=${limit}`),
  getSymbols: () => api.get('/upcoming-results/symbols'),
};

// Announcements APIs
export const announcementsAPI = {
  getBySymbol: (symbol) => api.get(`/announcements/${symbol}`),
};

/**
 * Declared Results API methods
 * @see {@link docs/API_REFERENCE.md#declared-results-apis} for endpoint documentation
 */
export const declaredResultsAPI = {
  /** Get declared results with filters @see POST /api/declared-results */
  getResults: (params = {}) =>
    api.post('/declared-results', {
      marketCapMin: params.marketCapMin || 1000,
      index: params.index || [],
      industry: params.industry || [],
      watchlistIds: params.watchlistIds || [],
      order: params.order || 'desc',
      orderBy: params.orderBy || 'Last Result Date',
      offset: params.offset || 0,
      resultDate: params.resultDate || '',
      searchCompany: params.searchCompany || '',
      documentType: params.documentType || '',
    }),
  /** Get filter options @see GET /api/declared-results/filters */
  getFilterOptions: () => api.get('/declared-results/filters'),
  /** Download transcript notes for quarter @see POST /api/declared-results/download-notes */
  downloadTranscriptNotes: (quarterDate, companyIds) =>
    api.post('/declared-results/download-notes', { quarterDate, companyIds }, { timeout: 300000 }),
};

// Orders APIs
export const ordersAPI = {
  getBySymbol: (symbol, limit = 50) => api.get(`/orders/${symbol}?limit=${limit}`),
  getNonAI: (symbol, limit = 50) => api.get(`/orders/${symbol}?limit=${limit}`),
  getFullParsed: (symbol, limit = 20) =>
    api.get(`/orders/${symbol}/full?limit=${limit}`, { timeout: 180000 }),
  parsePdf: (symbol, attachmentUrl) =>
    api.post(`/orders/${symbol}/parse-pdf`, { attachmentUrl }, { timeout: 120000 }),
  getOrderbook: (symbol) => api.get(`/orders/${symbol}/orderbook`, { timeout: 300000 }),
  downloadAll: (symbol, limit = 100) =>
    api.post(`/orders/${symbol}/download-all`, { limit }, { timeout: 30000 }),
  downloadDirect: (
    symbol,
    limit = 100,
    transcriptUrl = null,
    quarterStartDate = null,
    transcriptDate = null
  ) =>
    api.post(
      `/orders/${symbol}/download-direct`,
      { limit, transcriptUrl, quarterStartDate, transcriptDate },
      { timeout: 60000 }
    ),
  getQuarters: (symbol) => api.get(`/orders/${symbol}/quarters`, { timeout: 30000 }),
  downloadQuarter: (symbol, quarter, fiscalYear, orders, transcripts) =>
    api.post(
      `/orders/${symbol}/download-quarter`,
      { quarter, fiscalYear, orders, transcripts },
      { timeout: 120000 }
    ),
};

export default api;
