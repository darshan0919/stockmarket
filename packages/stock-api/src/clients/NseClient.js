'use strict';

const { NseSession, NSE_HOME_URL } = require('../http/nseSession');

/**
 * NSE client — PRICE-ACTION ONLY: real-time price, volume, delivery %, traded
 * quantity, and live gainers/variations.
 *
 * Intentionally does NOT expose NSE's fundamental endpoints (corporate
 * announcements, financial results, integrated filings, event calendar) — those
 * are owned by {@link StockscansClient}. Keeping this boundary means each datum
 * has exactly one owning client and there are no duplicate endpoints.
 */
class NseClient {
  /**
   * @param {Object} [opts]
   * @param {NseSession} [opts.session]
   */
  constructor({ session } = {}) {
    this.session = session || new NseSession();
  }

  _quoteReferer(symbol) {
    return `${NSE_HOME_URL}get-quotes/equity?symbol=${encodeURIComponent(symbol)}`;
  }

  /**
   * Equity quote (last price, OHLC, etc.).
   * @param {string} symbol
   * @returns {Promise<Object>}
   */
  async getQuote(symbol) {
    const upper = symbol.toUpperCase();
    const res = await this.session.get('/quote-equity', {
      params: { symbol: upper },
      referer: this._quoteReferer(upper),
      symbol: upper,
      timeout: 10000,
    });
    return res.data;
  }

  /**
   * Live intraday symbol data — includes tradeInfo.deliveryToTradedQuantity
   * (today's live delivery %, updated through the session).
   * @param {string} symbol
   * @param {string} [series='EQ']
   * @returns {Promise<Object|null>}
   */
  async getSymbolData(symbol, series = 'EQ') {
    const upper = symbol.toUpperCase();
    const res = await this.session.get('/NextApi/apiClient/GetQuoteApi', {
      params: { functionName: 'getSymbolData', marketType: 'N', series, symbol: upper },
      referer: this._quoteReferer(upper),
      symbol: upper,
      timeout: 60000,
    });
    const arr = res.data?.equityResponse;
    return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
  }

  /**
   * Historical price / volume / deliverable data for a symbol.
   * @param {string} symbol
   * @param {string} fromDate - dd-mm-yyyy
   * @param {string} toDate   - dd-mm-yyyy
   * @returns {Promise<Array>}
   */
  async getPriceVolumeDeliverable(symbol, fromDate, toDate) {
    const upper = symbol.toUpperCase();
    const res = await this.session.get(
      '/historicalOR/generateSecurityWiseHistoricalData',
      {
        params: {
          from: fromDate,
          to: toDate,
          symbol: upper,
          type: 'priceVolumeDeliverable',
          series: 'ALL',
        },
        referer: this._quoteReferer(upper),
        symbol: upper,
        timeout: 20000,
      }
    );
    return Array.isArray(res.data) ? res.data : res.data?.data || [];
  }

  /**
   * Fetch the end-of-day securities delivery bhavcopy CSV (sec_bhavdata_full) from
   * the NSE archives for a given date. Price-action data (delivery %, traded qty).
   * @param {string} ddmmyyyy - Date as DDMMYYYY (e.g. '27062026').
   * @param {number} [retries=3]
   * @returns {Promise<string|null>} Raw CSV text, or null if not yet published (404).
   */
  async getDeliveryBhavcopy(ddmmyyyy, retries = 3) {
    const url = `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${ddmmyyyy}.csv`;
    for (let i = 0; i < retries; i++) {
      try {
        const res = await this.session.get(url, { referer: NSE_HOME_URL, timeout: 25000 });
        const text = typeof res.data === 'string' ? res.data : String(res.data ?? '');
        const head = text.slice(0, 200).toUpperCase();
        if (text.slice(0, 200).includes(',') && head.includes('SYMBOL')) return text;
      } catch (err) {
        if (err.response?.status === 404) return null;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    return null;
  }

  /**
   * Today's large deals snapshot — bulk, block, and short-selling deals.
   * Endpoint verified 04-Jul-2026: /api/snapshot-capital-market-largedeal
   * Returns { as_on_date, BULK_DEALS_DATA, BLOCK_DEALS_DATA, SHORT_DEALS_DATA }.
   * Each row: { date, symbol, name, clientName, buySell, qty, watp, remarks }.
   * Deal value (₹) is NOT included — compute as qty × watp.
   * @returns {Promise<Object>}
   */
  async getLargeDeals() {
    const res = await this.session.get('/snapshot-capital-market-largedeal', {
      referer: `${NSE_HOME_URL}market-data/large-deals`,
      timeout: 30000,
    });
    return res.data || {};
  }

  /**
   * SAST Regulation 29(1)/29(2) disclosures (substantial acquisitions).
   * Endpoint verified 04-Jul-2026: /api/corporate-sast-reg29?index=equities
   * Row fields: symbol, company, acquirerName, acqSaleType (Acquisition|Sale),
   * noOfShareAcq, noOfShareSale, totAftShare (% post), attachement, timestamp.
   * No ₹ value in the payload — estimate as shares × close price.
   * @param {string} fromDate - DD-MM-YYYY
   * @param {string} toDate   - DD-MM-YYYY
   * @returns {Promise<Array>}
   */
  async getSastReg29(fromDate, toDate) {
    const res = await this.session.get('/corporate-sast-reg29', {
      params: { index: 'equities', from_date: fromDate, to_date: toDate },
      referer: `${NSE_HOME_URL}companies-listing/corporate-filings-regulation-29`,
      timeout: 30000,
    });
    return res.data?.data || [];
  }

  /**
   * Insider trading (PIT Reg 7(2)) filing index.
   * NOTE: the old /api/corporates-pit endpoint returns empty since NSE's 2026
   * GIGW revamp; the live endpoint (verified 04-Jul-2026) is /api/corporates-pit-gg.
   * Rows are filing METADATA only: { symbol, companyName, regulation,
   * typeOfSubmission, broadcastDateTime, xmlFileName (XBRL url), ixbrl }.
   * Trade details (person, qty, ₹ value) must be parsed from xmlFileName XBRL.
   * @param {string} fromDate - DD-MM-YYYY
   * @param {string} toDate   - DD-MM-YYYY
   * @returns {Promise<Array>}
   */
  async getInsiderFilings(fromDate, toDate) {
    const res = await this.session.get('/corporates-pit-gg', {
      params: { index: 'equities', from_date: fromDate, to_date: toDate },
      referer: `${NSE_HOME_URL}companies-listing/corporate-filings-insider-trading`,
      timeout: 60000,
    });
    return res.data?.data || [];
  }

  /**
   * Fetch a raw XBRL/XML document from nsearchives (no cookie warmup needed,
   * but the shared session keeps headers browser-like).
   * @param {string} url - Absolute nsearchives.nseindia.com URL.
   * @returns {Promise<string|null>}
   */
  async fetchArchiveXml(url) {
    try {
      const res = await this.session.get(url, { referer: NSE_HOME_URL, timeout: 20000 });
      return typeof res.data === 'string' ? res.data : String(res.data ?? '');
    } catch {
      return null;
    }
  }

  /**
   * Live market variations (top gainers / losers) across NSE index buckets.
   * @param {'gainers'|'loosers'} [variation='gainers'] - NSE spells losers "loosers".
   * @param {string} [exchSeg='']
   * @returns {Promise<Object>}
   */
  async getLiveVariations(variation = 'gainers', exchSeg = '') {
    const params = { index: variation };
    if (exchSeg) params.exchSeg = exchSeg;
    const res = await this.session.get('/live-analysis-variations', {
      params,
      referer: `${NSE_HOME_URL}market-data/top-gainers-losers`,
      timeout: 60000,
    });
    return res.data || {};
  }
}

module.exports = { NseClient };
