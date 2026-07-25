'use strict';

/**
 * @stock/api — centralized stock-data API clients.
 *
 * No hard ownership boundary between clients (revised 10-Jul-2026): each
 * endpoint lives on whichever client reaches it most reliably, even if more
 * than one exchange/source exposes similar data. In practice:
 *   • StockscansClient → fundamental research data (documents, scans,
 *     watchlists, screener, metrics) AND minute-level OHLCV (the only source
 *     with intraday candles), plus a company-announcements endpoint as fallback.
 *   • NseClient / BseClient → price-action (price, volume, delivery %,
 *     traded/deliverable qty, live gainers) AND corporate announcements with
 *     exact (second/ms-precision) event timestamps — verified more reliable
 *     for timing than Stockscans' batched feed. BSE symbol search is also
 *     preferred over NSE's (which 404s) or Stockscans' for lookup.
 * See eventReactionSignals.md-style notes in each client's header comment for
 * the specific reliability verification behind each choice.
 *
 * Default singletons are provided for convenience; construct your own with
 * injected http/auth/session for tests or alternate config.
 */

const { HttpClient } = require('./http/HttpClient');
const { NseSession } = require('./http/nseSession');
const bseHttp = require('./http/bseHttp');
const { StockscansAuth } = require('./auth/stockscansAuth');
const {
  StockscansClient,
  STOCKSCANS_BASE_URL,
  S3_BASE_URL,
} = require('./clients/StockscansClient');
const { NseClient } = require('./clients/NseClient');
const { BseClient, parseBseSmartSearchHtml } = require('./clients/BseClient');
const { ScreenerAuth } = require('./auth/screenerAuth');
const { ScreenerClient, SCREENER_BASE_URL } = require('./clients/ScreenerClient');

const generators = require('./generators');
const analyzers = require('./analyzers');
const { fetchEventReactionMetrics } = require('./orchestration/eventReactionMetrics');
const { fetchReactionCandles } = require('./fetchers/reactionCandlesFetcher');

// Convenience singletons (lazy auth → token resolved per request).
// One shared NseSession backs both the price-action client and any low-level
// transport callers (e.g. backend adapters) so they share a single cookie jar.
const nseSession = new NseSession();
const stockscans = new StockscansClient();
const nse = new NseClient({ session: nseSession });
const bse = new BseClient();
const screener = new ScreenerClient();

module.exports = {
  // Classes (for DI / custom config)
  HttpClient,
  NseSession,
  StockscansAuth,
  StockscansClient,
  NseClient,
  BseClient,
  ScreenerAuth,
  ScreenerClient,
  // Default singletons
  stockscans,
  nse,
  bse,
  screener,
  nseSession,
  // Low-level transport (for adapters)
  bseHttp,
  // Helpers / constants
  parseBseSmartSearchHtml,
  STOCKSCANS_BASE_URL,
  S3_BASE_URL,
  SCREENER_BASE_URL,
  // Generators
  ...generators,
  // Analyzers
  ...analyzers,
  // Event-reaction-signals orchestration
  fetchEventReactionMetrics,
  fetchReactionCandles,
};
