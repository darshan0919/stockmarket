'use strict';

const { HttpClient } = require('../http/HttpClient.js');

const SCANNER_URL = 'https://scanner.tradingview.com';

/**
 * Macro instruments the SOIC macro-state job reads (taxonomy M2/M3; Suresh's thresholds:
 * Brent < $100, US 10Y < 5%, USDINR < 95). Tickers verified live 2026-10-10 on the `global`
 * scanner route. FX_IDC:USDINR is used (FX:USDINR quoted ~0.9 higher the same minute: two
 * feeds disagree, so the choice is recorded here, not hidden).
 */
const MACRO_TICKERS = Object.freeze({
  brent: 'ICEEUR:BRN1!',
  us10y: 'TVC:US10Y',
  usdinr: 'FX_IDC:USDINR',
  dxy: 'TVC:DXY',
  indiaVix: 'NSE:INDIAVIX',
  in10y: 'TVC:IN10Y',
  nifty: 'NSE:NIFTY',
});

/**
 * TradingView public scanner client — an UNOFFICIAL, undocumented endpoint (no API key,
 * may change or rate-limit without notice; see docs/tradingview-api-schemas.md). Used only for
 * slow-moving macro snapshots (one POST per job run), never for per-stock data. Callers
 * must treat a missing ticker as "no data", not as zero.
 */
class TradingViewClient {
  /** @param {{http?: HttpClient}} [opts] */
  constructor({ http } = {}) {
    this.http = http || new HttpClient({ timeout: 20000 });
  }

  /** Attribute outbound calls to a job for API-usage auditing (instance-scoped). */
  setJobName(jobName) {
    if (this.http && typeof this.http.setJobName === 'function') this.http.setJobName(jobName);
  }

  /**
   * Last price + % change for tickers.
   * @param {string[]} tickers - e.g. ['TVC:US10Y']
   * @returns {Promise<Record<string,{price:number,changePct:number,name:string,description:string}>>}
   */
  async getQuotes(tickers) {
    const { data } = await this.http.post(
      `${SCANNER_URL}/global/scan`,
      { symbols: { tickers }, columns: ['name', 'close', 'change', 'description'] },
      { headers: { 'Content-Type': 'application/json' } }
    );
    return parseScannerResponse(data);
  }

  /**
   * Last price plus trailing performance and moving averages -- the inputs a quarter-on-quarter
   * macro read needs without a price-history endpoint (pead-predictor's macro overlay).
   * SMA50 (~2.4 trading months) approximates the latest-quarter average; Perf.3M is the
   * point-to-point change over ~one quarter. Rows without a numeric close are dropped.
   * @param {string[]} tickers
   * @returns {Promise<Record<string,{price:number,changePct:number|null,perf1M:number|null,
   *   perf3M:number|null,perf6M:number|null,perf1Y:number|null,sma20:number|null,sma50:number|null,
   *   sma100:number|null,name:string,description:string}>>}
   */
  async getPerformance(tickers) {
    const { data } = await this.http.post(
      `${SCANNER_URL}/global/scan`,
      { symbols: { tickers }, columns: PERF_COLUMNS },
      { headers: { 'Content-Type': 'application/json' } }
    );
    return parsePerformanceResponse(data);
  }

  /** Convenience: the macro dashboard instruments keyed by short name (null when absent). */
  async getMacroSnapshot() {
    const keys = Object.keys(MACRO_TICKERS);
    const quotes = await this.getQuotes(keys.map((k) => MACRO_TICKERS[k]));
    const out = {};
    for (const k of keys) out[k] = quotes[MACRO_TICKERS[k]] || null;
    return out;
  }
}

/** Pure parser (unit-tested): scanner JSON -> map keyed by full ticker. */
function parseScannerResponse(data) {
  const out = {};
  for (const row of (data && data.data) || []) {
    const [name, close, change, description] = row.d || [];
    if (typeof close !== 'number') continue;
    out[row.s] = {
      name,
      price: close,
      changePct: typeof change === 'number' ? change : null,
      description,
    };
  }
  return out;
}

/** Column order for getPerformance (positional in the scanner's `d` array). */
const PERF_COLUMNS = Object.freeze([
  'name',
  'close',
  'change',
  'Perf.1M',
  'Perf.3M',
  'Perf.6M',
  'Perf.Y',
  'SMA20',
  'SMA50',
  'SMA100',
  'description',
]);

/** Pure parser (unit-tested): performance scan JSON -> map keyed by full ticker. */
function parsePerformanceResponse(data) {
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const out = {};
  for (const row of (data && data.data) || []) {
    const [name, close, change, p1, p3, p6, py, s20, s50, s100, description] = row.d || [];
    if (typeof close !== 'number') continue;
    out[row.s] = {
      name,
      price: close,
      changePct: n(change),
      perf1M: n(p1),
      perf3M: n(p3),
      perf6M: n(p6),
      perf1Y: n(py),
      sma20: n(s20),
      sma50: n(s50),
      sma100: n(s100),
      description,
    };
  }
  return out;
}

module.exports = {
  TradingViewClient,
  parseScannerResponse,
  parsePerformanceResponse,
  PERF_COLUMNS,
  MACRO_TICKERS,
  SCANNER_URL,
};
