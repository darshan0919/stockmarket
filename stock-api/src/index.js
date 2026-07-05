'use strict';

/**
 * @stock/api — centralized stock-data API clients.
 *
 * Domain split (single source of truth per datum):
 *   • StockscansClient → ALL fundamental research data (documents, announcements,
 *     scans, watchlists, screener, metrics).
 *   • NseClient / BseClient → PRICE-ACTION ONLY (price, volume, delivery %,
 *     traded/deliverable qty, live gainers).
 *
 * Default singletons are provided for convenience; construct your own with
 * injected http/auth/session for tests or alternate config.
 */

const { HttpClient } = require('./http/HttpClient');
const { NseSession } = require('./http/nseSession');
const bseHttp = require('./http/bseHttp');
const { StockscansAuth } = require('./auth/stockscansAuth');
const { StockscansClient, STOCKSCANS_BASE_URL, S3_BASE_URL } = require('./clients/StockscansClient');
const { NseClient } = require('./clients/NseClient');
const { BseClient, parseBseSmartSearchHtml } = require('./clients/BseClient');
const { ScreenerAuth } = require('./auth/screenerAuth');
const { ScreenerClient, SCREENER_BASE_URL } = require('./clients/ScreenerClient');

const generators = require('./generators');
const analyzers = require('./analyzers');

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
  ...analyzers
};
