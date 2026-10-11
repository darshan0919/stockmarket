'use strict';

const { HttpClient } = require('../http/HttpClient.js');

const INDIAMTF_BASE_URL = 'https://indiamtf.com';

/**
 * @typedef {Object} MtfScripRow One row of /history/scripwise/daily/<YYYY-MM-DD>.csv
 * @property {string} symbol
 * @property {string} isin
 * @property {string} name
 * @property {number} nseCr   NSE funded amount, Rs Cr
 * @property {number} bseCr
 * @property {number} combinedCr
 * @property {number} nseQty  shares financed on NSE
 * @property {number} bseQty
 * @property {number} qty     nseQty + bseQty (the `q` of the research, SPEC.md)
 * @property {number} rank
 * @property {number} pctOfBook
 * @property {string} src     'N' | 'B' | 'N+B'
 */

/**
 * indiamtf.com client — a free third-party aggregator of the NSE/BSE daily Margin Trading
 * Disclosure files (attribution required: "IndiaMTF.com, from NSE/BSE disclosures"). It is NOT
 * an exchange feed: it can change or vanish without notice (see docs/indiamtf-api-schemas.md).
 * The disclosed session trails the latest market session by one day.
 */
class IndiaMtfClient {
  /** @param {{http?: HttpClient}} [opts] */
  constructor({ http } = {}) {
    this.http = http || new HttpClient({ timeout: 30000 });
  }

  /** Attribute outbound calls to a job for API-usage auditing (instance-scoped). */
  setJobName(jobName) {
    if (this.http && typeof this.http.setJobName === 'function') this.http.setJobName(jobName);
  }

  /** @returns {Promise<Object>} raw /latest.json */
  async latest() {
    const { data } = await this.http.get(`${INDIAMTF_BASE_URL}/latest.json`);
    return data;
  }

  /** Latest disclosed session (YYYY-MM-DD) when NSE and BSE are aligned, else the older of the two. */
  async latestDate() {
    return parseLatestDate(await this.latest());
  }

  /**
   * Per-scrip daily funded book (top 1,000 by book; 500 before 2025-11-11).
   * @param {string} isoDate YYYY-MM-DD
   * @returns {Promise<MtfScripRow[]|null>} null when no file exists for that date (holiday / unpublished)
   */
  async scripwiseDaily(isoDate) {
    try {
      const { data } = await this.http.get(
        `${INDIAMTF_BASE_URL}/history/scripwise/daily/${isoDate}.csv`,
        { responseType: 'text' }
      );
      const rows = parseScripwiseCsv(typeof data === 'string' ? data : String(data ?? ''));
      return rows.length ? rows : null;
    } catch (err) {
      if (err.response && (err.response.status === 404 || err.response.status === 403)) return null;
      throw err;
    }
  }
}

const MONTHS = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

/** '08 Oct 2026' -> '2026-10-08' (null when unparseable). */
function parseHumanDate(s) {
  const m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(String(s || '').trim());
  if (!m || !MONTHS[m[2].toLowerCase()]) return null;
  return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`;
}

/** Pure: /latest.json -> ISO date of the session both exchanges have published (older of the two). */
function parseLatestDate(latest) {
  const st = (latest && latest.status) || {};
  const dates = [parseHumanDate(st.nse_date), parseHumanDate(st.bse_date)].filter(Boolean);
  if (!dates.length) return null;
  return dates.sort()[0];
}

/** Pure (unit-tested): scripwise CSV text -> rows. Rows without a positive share count are dropped. */
function parseScripwiseCsv(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length < 2) return [];
  const head = lines[0].split(',').map((h) => h.trim());
  const ix = (n) => head.indexOf(n);
  const need = ['symbol', 'nse_qty', 'bse_qty'];
  if (need.some((n) => ix(n) < 0)) return [];
  const num = (v) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  const out = [];
  for (const line of lines.slice(1)) {
    const c = line.split(','); // names may contain commas -> index columns from both ends is unsafe; name is col 2 and quoted-free in practice
    if (c.length !== head.length) continue; // skip malformed/quoted rows rather than mis-assign columns
    const row = {
      symbol: c[ix('symbol')].trim(),
      isin: c[ix('isin')],
      name: c[ix('name')],
      nseCr: num(c[ix('nse_cr')]),
      bseCr: num(c[ix('bse_cr')]),
      combinedCr: num(c[ix('combined_cr')]),
      nseQty: num(c[ix('nse_qty')]),
      bseQty: num(c[ix('bse_qty')]),
      rank: num(c[ix('rank')]),
      pctOfBook: num(c[ix('pct_of_book')]),
      src: c[ix('src')],
    };
    row.qty = row.nseQty + row.bseQty;
    if (row.symbol && row.qty > 0) out.push(row);
  }
  return out;
}

module.exports = {
  IndiaMtfClient,
  parseScripwiseCsv,
  parseLatestDate,
  parseHumanDate,
  INDIAMTF_BASE_URL,
};
