'use strict';

const { sanitizeCompanyId } = require('../utils/companyId');

/**
 * Normalise Stockscans 1D prices rows into standard candle objects.
 * Stockscans row format: [dateString, open, high, low, close, volume].
 * @param {Array<[string, number, number, number, number, number]>} prices
 * @returns {Array<Object>}
 */
function normalizeStockscansPrices(prices) {
  if (!Array.isArray(prices)) return [];
  return prices
    .map(([dt, o, h, l, c, v]) => {
      const date = String(dt || '').slice(0, 10);
      return {
        date,
        open: Number(o),
        high: Number(h),
        low: Number(l),
        close: Number(c),
        prevClose: null,
        volume: Number(v),
        totalTradedValue: null,
        source: 'stockscans',
      };
    })
    .filter((c) => c.date && Number.isFinite(c.close))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Fetches daily (1D) OHLCV candles for a stock using a high-efficiency waterfall:
 * 1. Primary: Official NSE MCP in-memory cache (fast, <50ms, zero auth/quota required) for NSE symbols.
 * 2. Fallback: Stockscans chart OHLCV API for BSE symbols or if NSE MCP encounters downtime/network error.
 *
 * @param {string} ticker - Canonical companyId or ticker symbol (e.g. 'NSE:TCS', 'BSE:500325', or 'INFY')
 * @param {Object} [opts]
 * @param {number} [opts.months=3] - Lookback window in months
 * @param {string} [opts.endDate='today'] - End date YYYY-MM-DD or 'today'
 * @param {import('../clients/NseClient').NseClient} [opts.nseClient] - Optional injected NseClient
 * @param {import('../clients/StockscansClient').StockscansClient} [opts.stockscansClient] - Optional injected StockscansClient
 * @returns {Promise<{ ticker: string, source: 'nse'|'stockscans', candles: Array<{ date: string, open: number, high: number, low: number, close: number, volume: number, prevClose: number|null, totalTradedValue: number|null, source: string }> }>}
 */
async function fetchDailyCandles(ticker, opts = {}) {
  const { months = 3, endDate = 'today', nseClient, stockscansClient } = opts;

  const normalized = sanitizeCompanyId(ticker);
  const isNse = normalized.startsWith('NSE:') || !normalized.includes(':');

  if (isNse) {
    const symbol = normalized.replace(/^NSE:/i, '');
    try {
      const nse = nseClient || require('../index').nse;
      const rows = await nse.getHistoricalOhlcv(symbol, { months, endDate });
      if (Array.isArray(rows) && rows.length > 0) {
        return {
          ticker: normalized,
          source: 'nse',
          candles: rows.map((r) => ({ ...r, source: 'nse' })),
        };
      }
    } catch (err) {
      // Graceful fallback to Stockscans on any NSE MCP transport/server issue
      // eslint-disable-next-line no-console
      console.warn(
        `[dailyCandlesFetcher] NSE MCP fetch failed for ${normalized}, falling back to Stockscans:`,
        err.message
      );
    }
  }

  // Fallback to Stockscans
  const ss = stockscansClient || require('../index').stockscans;
  const res = await ss.ohlcv(normalized, { tf: '1D' });
  const candles = normalizeStockscansPrices(res?.prices);

  return {
    ticker: normalized,
    source: 'stockscans',
    candles,
  };
}

module.exports = {
  fetchDailyCandles,
  normalizeStockscansPrices,
};
