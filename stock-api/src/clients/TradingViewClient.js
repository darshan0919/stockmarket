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

module.exports = { TradingViewClient, parseScannerResponse, MACRO_TICKERS, SCANNER_URL };
