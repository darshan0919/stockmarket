'use strict';

const { HttpClient } = require('../http/HttpClient');
const { StockscansAuth } = require('../auth/stockscansAuth');

const BASE_URL = 'https://www.stockscans.in';
const S3_BASE_URL = 'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/';

/**
 * Stockscans client — the single owner of ALL fundamental research data:
 * company documents, announcements, scans, saved scans, watchlists, screener,
 * and card-detail metrics. Price-action (price/volume/delivery) is NOT here —
 * that belongs to {@link NseClient} / {@link BseClient}.
 *
 * Dependencies (HttpClient, StockscansAuth) are injected so the client holds only
 * endpoint logic and can be unit-tested with doubles (DIP).
 */
class StockscansClient {
  /**
   * @param {Object} [opts]
   * @param {HttpClient} [opts.http]
   * @param {StockscansAuth} [opts.auth]
   */
  constructor({ http, auth } = {}) {
    this.http = http || new HttpClient({ timeout: 30000 });
    this.auth = auth || new StockscansAuth();
    this.baseUrl = BASE_URL;
    this.s3BaseUrl = S3_BASE_URL;
  }

  _headers(referer, optional = false) {
    return this.auth.headers({ referer, userAgent: this.http.userAgent, optional });
  }

  // ── Scans ─────────────────────────────────────────────────────────────────

  /**
   * Run a saved/ad-hoc scan.
   * @param {Object} payload - Full scan payload (offset, filters, …).
   * @param {string} [scanId] - Used to build the Referer.
   * @returns {Promise<Object>}
   */
  async runScan(payload, scanId = '') {
    const referer = scanId ? `${BASE_URL}/scans/saved/${scanId}` : `${BASE_URL}/scans`;
    const { data } = await this.http.post(`${BASE_URL}/api/company/scans/run`, payload, {
      headers: this._headers(referer),
    });
    return data;
  }

  /**
   * Fetch a saved scan's metadata.
   * @param {string} scanId
   * @returns {Promise<Object>}
   */
  async getScanMetadata(scanId) {
    const { data } = await this.http.get(`${BASE_URL}/api/company/scans/metadata`, {
      params: { scanId },
      headers: this._headers(`${BASE_URL}/scans/saved/${scanId}`),
    });
    return data;
  }

  // ── Announcements ───────────────────────────────────────────────────────────

  /**
   * Announcement scan across companies/keywords/quarter.
   * @param {Object} payload
   * @param {Object} [opts]
   * @param {string} [opts.referer] - Override the Referer header.
   * @param {boolean} [opts.optionalAuth=false] - Allow unauthenticated (public page) calls.
   * @returns {Promise<Object>}
   */
  async scanAnnouncements(payload, { referer = `${BASE_URL}/watchlists`, optionalAuth = false } = {}) {
    const { data } = await this.http.post(
      `${BASE_URL}/api/company/announcements/scan`,
      payload,
      { headers: this._headers(referer, optionalAuth) }
    );
    return data;
  }

  /**
   * Announcement-scan keyword/company match statistics.
   * @param {Object} payload
   * @param {Object} [opts]
   * @param {string} [opts.referer]
   * @param {boolean} [opts.optionalAuth=false]
   * @returns {Promise<Object>}
   */
  async announcementStatistics(payload, { referer = `${BASE_URL}/`, optionalAuth = false } = {}) {
    const { data } = await this.http.post(
      `${BASE_URL}/api/company/announcements/statistics`,
      payload,
      { headers: this._headers(referer, optionalAuth) }
    );
    return data;
  }

  /**
   * Announcements for a single company.
   * @param {Object} payload
   * @param {Object} [opts]
   * @param {string} [opts.referer]
   * @param {boolean} [opts.optionalAuth=false]
   * @returns {Promise<Object>}
   */
  async companyAnnouncements(payload, { referer = `${BASE_URL}/`, optionalAuth = false } = {}) {
    const { data } = await this.http.post(
      `${BASE_URL}/api/company/announcements/company`,
      payload,
      { headers: this._headers(referer, optionalAuth) }
    );
    return data;
  }

  /**
   * Announcement-scan metadata (index/industry lists).
   * @param {Object} [opts] - { referer, optionalAuth }
   * @returns {Promise<Object>}
   */
  async scanMetadata({ referer = `${BASE_URL}/`, optionalAuth = false } = {}) {
    const { data } = await this.http.get(`${BASE_URL}/api/company/scans/metadata`, {
      headers: this._headers(referer, optionalAuth),
    });
    return data;
  }

  /**
   * Company autocomplete search.
   * @param {string} query
   * @param {Object} [opts] - { type, referer, optionalAuth }
   * @returns {Promise<Object>}
   */
  async companySearch(query, { type = 'Company', referer = `${BASE_URL}/`, optionalAuth = false } = {}) {
    const { data } = await this.http.get(`${BASE_URL}/api/company/search`, {
      params: { q: query, type },
      headers: this._headers(referer, optionalAuth),
    });
    return data;
  }

  /**
   * The user's watchlists (list view). Auth required.
   * @param {Object} [opts] - { view, referer }
   * @returns {Promise<Object>}
   */
  async watchlistsList({ view = 'names', referer = `${BASE_URL}/` } = {}) {
    const { data } = await this.http.get(`${BASE_URL}/api/user/watchlists`, {
      params: { view },
      headers: this._headers(referer),
    });
    return data;
  }

  /**
   * The user's saved announcement scans. Auth required.
   * @param {Object} [opts] - { referer }
   * @returns {Promise<Object>}
   */
  async savedAnnouncementScans({ referer = `${BASE_URL}/` } = {}) {
    const { data } = await this.http.get(`${BASE_URL}/api/user/announcement-scans`, {
      headers: this._headers(referer),
    });
    return data;
  }

  /**
   * Create/save an announcement scan (PUT). Auth required.
   * @param {Object} payload @param {Object} [opts] - { referer }
   * @returns {Promise<Object>}
   */
  async saveAnnouncementScan(payload, { referer = `${BASE_URL}/` } = {}) {
    const { data } = await this.http.put(`${BASE_URL}/api/user/announcement-scans`, payload, {
      headers: this._headers(referer),
    });
    return data;
  }

  /**
   * Reorder the user's saved announcement scans (PUT …/order). Auth required.
   * @param {string[]} scanIds @param {Object} [opts] - { referer }
   * @returns {Promise<Object>}
   */
  async reorderAnnouncementScans(scanIds, { referer = `${BASE_URL}/` } = {}) {
    const { data } = await this.http.put(
      `${BASE_URL}/api/user/announcement-scans/order`,
      { scanIds },
      { headers: this._headers(referer) }
    );
    return data;
  }

  /**
   * Delete a saved announcement scan by id (DELETE). Auth required.
   * @param {string} scanId @param {Object} [opts] - { referer }
   * @returns {Promise<Object>}
   */
  async deleteAnnouncementScan(scanId, { referer = `${BASE_URL}/` } = {}) {
    const { data } = await this.http.delete(
      `${BASE_URL}/api/user/announcement-scans/${encodeURIComponent(scanId)}`,
      { headers: this._headers(referer) }
    );
    return data;
  }

  /**
   * Search announcements by free text.
   * @param {Object} payload
   * @param {Object} [opts]
   * @param {string} [opts.referer] - Override the Referer header (e.g. a company page).
   * @returns {Promise<Object>}
   */
  async searchAnnouncements(payload, { referer = `${BASE_URL}/` } = {}) {
    const { data } = await this.http.post(
      `${BASE_URL}/api/company/announcements/search`,
      payload,
      { headers: this._headers(referer) }
    );
    return data;
  }

  // ── Company / fundamentals ─────────────────────────────────────────────────

  /**
   * Company search (resolve a ticker / name to a companyId).
   * @param {string} query
   * @returns {Promise<Object>}
   */
  async searchCompany(query) {
    const { data } = await this.http.get(`${BASE_URL}/api/company/search`, {
      params: { q: query },
      headers: this._headers(`${BASE_URL}/`),
    });
    return data;
  }

  /**
   * Card details / fundamental metrics — batch POST for one or more companyIds.
   * @param {string[]|string} companyIds - e.g. ['NSE:RELIANCE'] (a single id is wrapped).
   * @returns {Promise<Object>} Raw response; metrics live under `data.cardData[companyId].metaRatios`.
   */
  async cardDetails(companyIds) {
    const ids = Array.isArray(companyIds) ? companyIds : [companyIds];
    const { data } = await this.http.post(
      `${BASE_URL}/api/company/card-details`,
      { companyIds: ids },
      { headers: this._headers(`${BASE_URL}/`) }
    );
    return data;
  }

  /**
   * Historical price candles for a ticker (Stockscans price API).
   * @param {string} ticker - e.g. "NSE:RELIANCE".
   * @returns {Promise<*>} Raw response (list-of-arrays or {prices|data|candles}).
   */
  async prices(ticker) {
    const { data } = await this.http.get(
      `${BASE_URL}/api/company/prices/${encodeURIComponent(ticker)}`,
      { headers: this._headers(`${BASE_URL}/company/${ticker}`) }
    );
    return data;
  }

  /**
   * Official company documents (AR / concall / PPT / results).
   * @param {string} companyId
   * @returns {Promise<Object>}
   */
  async documents(companyId) {
    const { data } = await this.http.get(`${BASE_URL}/api/company/documents/${companyId}`, {
      headers: this._headers(`${BASE_URL}/company/${companyId}`),
    });
    return data;
  }

  // ── Watchlists ──────────────────────────────────────────────────────────────

  /**
   * @param {string} watchlistId
   * @param {Object} [opts] - ratiosType, order, orderBy, plus extra payload fields.
   * @returns {Promise<Object>}
   */
  async watchlistTable(watchlistId, opts = {}) {
    const { ratiosType = 'Performance', order = 'desc', orderBy = 'Market Capitalization', ...rest } =
      opts;
    const payload = { watchlistId, ratiosType, order, orderBy, ...rest };
    const { data } = await this.http.post(
      `${BASE_URL}/api/user/watchlists/table`,
      payload,
      { headers: this._headers(`${BASE_URL}/watchlists`) }
    );
    return data;
  }

  /**
   * Replace the full company list of a watchlist.
   * @param {string} watchlistId
   * @param {string[]} companyIds
   * @returns {Promise<Object>}
   * @throws {Error} If the server echoes a different count.
   */
  async replaceWatchlist(watchlistId, companyIds) {
    const { data } = await this.http.post(
      `${BASE_URL}/api/user/watchlists/company-ids/replace`,
      { watchlistId, companyIds },
      { headers: this._headers(`${BASE_URL}/watchlists`) }
    );
    const returned = (data.companyIds || []).length;
    if (returned !== companyIds.length) {
      throw new Error(
        `Watchlist replace mismatch: sent ${companyIds.length}, got back ${returned}`
      );
    }
    return data;
  }

  /**
   * Add or delete companies on a watchlist.
   * @param {string} watchlistId
   * @param {'add'|'delete'} action
   * @param {string[]} companyIds
   * @returns {Promise<Object>}
   */
  async updateWatchlist(watchlistId, action, companyIds) {
    if (action !== 'add' && action !== 'delete') {
      throw new Error(`action must be 'add' or 'delete', got ${action}`);
    }
    if (!companyIds || companyIds.length === 0) return {};
    const { data } = await this.http.put(
      `${BASE_URL}/api/user/watchlists/company-ids`,
      { watchlistId, action, companyIds },
      { headers: this._headers(`${BASE_URL}/watchlists`) }
    );
    return data;
  }

  /**
   * Fetch the raw HTML of a saved-scan page (the scan definition is embedded as a
   * Next.js RSC payload). Authenticated GET that returns text/html, not JSON.
   * @param {string} scanId
   * @returns {Promise<string>} Raw HTML.
   */
  async savedScanPageHtml(scanId) {
    const headers = {
      cookie: `authtoken=${this.auth.getToken()}`,
      accept: 'text/html,application/xhtml+xml',
    };
    const { data } = await this.http.get(`${BASE_URL}/scans/saved/${scanId}`, {
      headers,
      timeout: 30000,
    });
    return typeof data === 'string' ? data : String(data);
  }

  /**
   * The authenticated user's saved scans.
   * @returns {Promise<Object>} Raw response (a bare array or `{ scans: [...] }`).
   */
  async savedScans() {
    const { data } = await this.http.get(`${BASE_URL}/api/user/saved-scans`, {
      headers: this._headers(`${BASE_URL}/scans/saved`),
    });
    return data;
  }

  // ── Documents / PDFs ────────────────────────────────────────────────────────

  /** Build the full S3 URL from a bare ssUrl filename. */
  s3PdfUrl(ssUrl) {
    return ssUrl ? `${S3_BASE_URL}${ssUrl}` : '';
  }

  /**
   * Fetch a PDF (or any binary) as a Buffer.
   * @param {string} url
   * @param {number} [timeout=60000]
   * @returns {Promise<Buffer>}
   */
  async fetchPdf(url, timeout = 60000) {
    const { data } = await this.http.get(url, { timeout, responseType: 'arraybuffer' });
    return Buffer.from(data);
  }
}

module.exports = { StockscansClient, STOCKSCANS_BASE_URL: BASE_URL, S3_BASE_URL };
