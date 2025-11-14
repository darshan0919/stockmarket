import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
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
    if (error.response) {
      console.error("API Error:", error.response.data);
    } else if (error.request) {
      console.error("Network Error:", error.message);
    } else {
      console.error("Error:", error.message);
    }
    return Promise.reject(error);
  }
);

// Stock APIs
export const stockAPI = {
  search: (query, page = 1, limit = 10) =>
    api.get(
      `/stocks/search?q=${encodeURIComponent(
        query
      )}&page=${page}&limit=${limit}`
    ),
  getDetails: (symbol) => api.get(`/stocks/${symbol}`),
  getTechnicals: (symbol) => api.get(`/stocks/${symbol}/technicals`),
  getFinancials: (symbol, quarters = 4) =>
    api.get(`/stocks/${symbol}/financials?quarters=${quarters}`),
  getQuarterlyResults: (symbol) => api.get(`/stocks/${symbol}/quarterly`),
};

// Screener APIs
export const screenerAPI = {
  runScreener: (
    filters,
    sortBy = "market_cap",
    sortOrder = "desc",
    limit = 100
  ) =>
    api.post("/screener/run", {
      filters,
      sort_by: sortBy,
      sort_order: sortOrder,
      limit,
    }),
};

// Watchlist APIs
export const watchlistAPI = {
  getAll: () => api.get("/watchlist"),
  add: (symbol) => api.post(`/watchlist/${symbol}`),
  remove: (symbol) => api.delete(`/watchlist/${symbol}`),
};

// Market APIs
export const marketAPI = {
  getIndices: () => api.get("/market/indices"),
  getStats: () => api.get("/market/stats"),
};

export default api;
