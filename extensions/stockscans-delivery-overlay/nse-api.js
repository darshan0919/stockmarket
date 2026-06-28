"use strict";

const NSE_HOME_URL = "https://www.nseindia.com/";
const NSE_API_URL = "https://www.nseindia.com/api";
const SESSION_TTL_MS = 5 * 60 * 1000;

const DOCUMENT_HEADERS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

const API_HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9",
  "x-requested-with": "XMLHttpRequest",
};

let sessionExpiresAt = 0;
let activeWarmup = null;

export function quoteReferer(symbol) {
  return `${NSE_HOME_URL}get-quotes/equity?symbol=${encodeURIComponent(symbol)}`;
}

export async function getPriceVolumeDeliverable(symbol, fromDate, toDate) {
  const upper = symbol.toUpperCase();
  return nseGet("/historicalOR/generateSecurityWiseHistoricalData", {
    params: {
      from: fromDate,
      to: toDate,
      symbol: upper,
      type: "priceVolumeDeliverable",
      series: "ALL",
    },
    referrer: quoteReferer(upper),
    symbol: upper,
    timeoutMs: 30000,
  });
}

export async function getSymbolData(symbol, series = "EQ") {
  const upper = symbol.toUpperCase();
  const data = await nseGet("/NextApi/apiClient/GetQuoteApi", {
    params: {
      functionName: "getSymbolData",
      marketType: "N",
      series,
      symbol: upper,
    },
    referrer: quoteReferer(upper),
    symbol: upper,
    timeoutMs: 30000,
  });
  const rows = data?.equityResponse;
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function nseGet(path, { params, referrer = NSE_HOME_URL, symbol, timeoutMs = 30000 } = {}) {
  const url = path.startsWith("http")
    ? new URL(path)
    : new URL(`${NSE_API_URL}${path.startsWith("/") ? path : `/${path}`}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const request = () =>
    fetchJson(url.toString(), {
      headers: API_HEADERS,
      referrer,
      timeoutMs,
    });

  await warmupNseSession(symbol);

  try {
    return await request();
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      clearNseSession();
      await warmupNseSession(symbol);
      return request();
    }
    throw error;
  }
}

async function warmupNseSession(symbol) {
  if (Date.now() < sessionExpiresAt) return;
  if (activeWarmup) return activeWarmup;

  activeWarmup = (async () => {
    await fetchText(NSE_HOME_URL, {
      headers: DOCUMENT_HEADERS,
      referrer: NSE_HOME_URL,
      timeoutMs: 30000,
    });

    if (symbol) {
      await fetchText(quoteReferer(symbol.toUpperCase()), {
        headers: DOCUMENT_HEADERS,
        referrer: NSE_HOME_URL,
        timeoutMs: 30000,
      });
    }

    sessionExpiresAt = Date.now() + SESSION_TTL_MS;
  })();

  try {
    await activeWarmup;
  } finally {
    activeWarmup = null;
  }
}

function clearNseSession() {
  sessionExpiresAt = 0;
  activeWarmup = null;
}

async function fetchJson(url, options) {
  const response = await fetchWithTimeout(url, {
    ...options,
    cache: "no-store",
    credentials: "include",
  });
  const text = await response.text();

  if (!response.ok) {
    throw makeHttpError(response, text);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`NSE returned a non-JSON response for ${new URL(url).pathname}`);
  }
}

async function fetchText(url, options) {
  const response = await fetchWithTimeout(url, {
    ...options,
    cache: "no-store",
    credentials: "include",
  });
  const text = await response.text();

  if (!response.ok) {
    throw makeHttpError(response, text);
  }

  return text;
}

async function fetchWithTimeout(url, { timeoutMs, ...options }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 30000);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`NSE request timed out for ${new URL(url).pathname}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function makeHttpError(response, text) {
  const error = new Error(
    `NSE request failed: ${response.status} ${response.statusText}`.trim()
  );
  error.status = response.status;
  error.body = String(text || "").slice(0, 240);
  return error;
}
