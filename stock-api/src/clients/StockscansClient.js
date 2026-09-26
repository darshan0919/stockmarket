'use strict';

const { HttpClient } = require('../http/HttpClient');
const { StockscansAuth } = require('../auth/stockscansAuth');
const { sanitizeCompanyId } = require('../utils/companyId');

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

  /**
   * Set (or clear) the job name this client's HttpClient instance attributes
   * outbound calls to for API-usage auditing. Call once at script startup —
   * this mutates the client's own HttpClient instance, not any shared/global
   * state, so it is safe even if multiple StockscansClient instances exist
   * in the same process for different purposes. See HttpClient.js's header.
   * @param {string|null} jobName
   */
  setJobName(jobName) {
    this.http.jobName = jobName || null;
  }

  _headers(referer, optional = false) {
    return this.auth.headers({ referer, userAgent: this.http.userAgent, optional });
  }

  // ── Scans ─────────────────────────────────────────────────────────────────

  /**
   * Run a saved/ad-hoc scan.
   *
   * PATH MIGRATED 2026-09-16 (Stockscans backend refactor — see
   * `docs/stockscans-api-schemas.md` §"Migration notes 2026-09-16"): old path
   * `POST /api/company/scans/run` now 404s. New path is
   * `POST /api/scans/stock/run`, confirmed live via captured browser traffic
   * (Network tab on stockscans.in/scans, re-running a saved scan). The
   * REQUEST SHAPE also changed — it's no longer a flat `{offset, filters, …}`
   * payload; the scan definition is now nested under a `scan` object matching
   * the saved-scan record shape (`scanId`, `scanName`, `scanDescription`,
   * `industry`, `index`, `tags`, `watchlistIds`, `filters`, `alertFrequency`),
   * plus top-level `ratiosType`, `timePeriod`, `watchlistIds`, `order`,
   * `orderBy`, `offset`. Response shape (array-of-rows `table`) is unchanged.
   * @param {Object} payload - New shape: `{ratiosType, timePeriod, scan:
   *   {scanId, scanName, scanDescription, industry, index, tags,
   *   watchlistIds, filters, alertFrequency}, watchlistIds, order, orderBy,
   *   offset}`. Callers migrating from the old flat shape must wrap their
   *   scan-definition fields (`filters`/`industry`/`index`/`watchlistIds`)
   *   inside `scan`, and supply `ratiosType`/`timePeriod`/`order`/`orderBy`
   *   (defaults below cover the common case).
   * @param {string} [scanId] - Used to build the Referer.
   * @returns {Promise<Object>}
   */
  async runScan(payload, scanId = '') {
    const referer = scanId ? `${BASE_URL}/scans/saved/${scanId}` : `${BASE_URL}/scans`;
    const body = {
      ratiosType: 'Default',
      timePeriod: 'Latest',
      order: 'asc',
      orderBy: 'Market Capitalization',
      offset: 0,
      watchlistIds: [],
      ...payload,
    };
    const { data } = await this.http.post(`${BASE_URL}/api/scans/stock/run`, body, {
      headers: this._headers(referer),
    });
    return data;
  }

  /**
   * Fetch a saved scan's metadata.
   *
   * PATH MIGRATED 2026-09-16: old path `GET /api/user/saved-scans/{scanId}`
   * now 404s. New path `GET /api/scans/stock/saved/{scanId}`, confirmed live
   * (mirrors {@link savedScans}'s `user/saved-scans` → `scans/stock/saved`
   * migration). Response shape unchanged (`{scanId, scanName,
   * scanDescription, industry, index, tags, watchlistIds, filters,
   * alertFrequency}`).
   * @param {string} scanId
   * @returns {Promise<Object>}
   */
  async getScanMetadata(scanId) {
    // The saved-scan *definition* (filters, tags, name) lives at the user
    // saved-scans endpoint. The older `/api/company/scans/metadata` /
    // `/api/scans/stock/metadata` path returns only generic index/industry
    // lists — not a scan definition — so callers that need the filters
    // (runScan, catalyst/keyword scanners) must use this.
    const { data } = await this.http.get(
      `${BASE_URL}/api/scans/stock/saved/${encodeURIComponent(scanId)}`,
      { headers: this._headers(`${BASE_URL}/scans/saved/${scanId}`) }
    );
    return data;
  }

  // ── Announcements ───────────────────────────────────────────────────────────

  /**
   * Announcement scan across companies/keywords/quarter.
   *
   * PATH MIGRATED 2026-09-16: old path `POST /api/company/announcements/scan`
   * now 404s. New path `POST /api/scans/announcement/search` — CONFIRMED LIVE
   * via captured browser traffic (Network tab, stockscans.in Announcement
   * Scans page): as of this refactor, Stockscans merged the old
   * `scan`/`search` distinction into ONE endpoint. Calling it with
   * `scan.searchFilters: []` (no keywords) returns the plain announcement
   * feed for the scan — exactly the old `scanAnnouncements` behavior; calling
   * it with `scan.searchFilters: ['some keyword']` is the old
   * `searchAnnouncements` behavior. See {@link searchAnnouncements}, which is
   * now a thin wrapper over this same endpoint.
   *
   * Request/response shape is otherwise UNCHANGED from the pre-migration
   * schema documented in `docs/stockscans-api-schemas.md` — quarter filter is
   * still the top-level `quarterDate` ("YYYYMM", e.g. "202609"), NOT a
   * per-item `date`/`documentType` field inside `scan`. `scan.filters` is
   * required (defaults to `[]`); `scan.watchlistIds` is the standard way to
   * scope to an arbitrary companyId list via a throwaway watchlist. Response
   * key is `announcements` (confirmed live).
   * @param {Object} payload
   * @param {Object} [opts]
   * @param {string} [opts.referer] - Override the Referer header.
   * @param {boolean} [opts.optionalAuth=false] - Allow unauthenticated (public page) calls.
   * @returns {Promise<Object>}
   */
  async scanAnnouncements(
    payload,
    { referer = `${BASE_URL}/watchlists`, optionalAuth = false } = {}
  ) {
    const { data } = await this.http.post(`${BASE_URL}/api/scans/announcement/search`, payload, {
      headers: this._headers(referer, optionalAuth),
    });
    return data;
  }

  /**
   * Announcement-scan keyword/company match statistics.
   *
   * PATH MIGRATED 2026-09-16: old path
   * `POST /api/company/announcements/statistics` now 404s. New path
   * `POST /api/scans/announcement/statistics` — CONFIRMED LIVE, same request
   * shape (the pre-migration `scan` object) and same response shape
   * (`{totalMatches, totalCompanies, companyData, keywords}`).
   * @param {Object} payload
   * @param {Object} [opts]
   * @param {string} [opts.referer]
   * @param {boolean} [opts.optionalAuth=false]
   * @returns {Promise<Object>}
   */
  async announcementStatistics(payload, { referer = `${BASE_URL}/`, optionalAuth = false } = {}) {
    const { data } = await this.http.post(
      `${BASE_URL}/api/scans/announcement/statistics`,
      payload,
      { headers: this._headers(referer, optionalAuth) }
    );
    return data;
  }

  /**
   * Announcements for a single company.
   *
   * PATH MIGRATED 2026-09-16: old path
   * `POST /api/company/announcements/company` now 404s. As of this refactor,
   * Stockscans MERGED the single-company and bulk-company announcement
   * endpoints into one: `POST /api/company/fundamentals/announcements` —
   * CONFIRMED LIVE with the exact same `{companyIds, offset}` payload
   * {@link announcements} (bulk) uses; a single-company call is just
   * `companyIds: [oneId]`. This method is now a thin wrapper delegating to
   * {@link announcements} — kept separate only for call-site clarity/naming,
   * not because the underlying request differs. Response key is
   * `companyAnnouncements` (confirmed live) — same as before.
   * @param {Object} payload - Must include `companyIds` (array, may be a single id) and `offset`.
   * @param {Object} [opts]
   * @param {string} [opts.referer]
   * @param {boolean} [opts.optionalAuth=false]
   * @returns {Promise<Object>}
   */
  async companyAnnouncements(payload, { referer, optionalAuth = false } = {}) {
    const companyIds = (payload.companyIds || []).map(sanitizeCompanyId);
    const finalReferer = referer || `${BASE_URL}/company/${companyIds[0] || ''}`;
    const { data } = await this.http.post(
      `${BASE_URL}/api/company/fundamentals/announcements`,
      { companyIds, offset: payload.offset || 0 },
      { headers: this._headers(finalReferer, optionalAuth) }
    );
    return data;
  }

  /**
   * Paginated corporate announcements for one or more companies.
   *
   * PATH MIGRATED 2026-09-16: old path `POST /api/company/announcements` now
   * 404s. New path `POST /api/company/fundamentals/announcements` —
   * CONFIRMED LIVE with the same `{companyIds, offset}` payload shape and the
   * same `companyAnnouncements` response key. As of this refactor, this is
   * now the SAME endpoint {@link companyAnnouncements} calls (Stockscans
   * merged what used to be two separate single-company/bulk routes) — kept
   * as a distinct method here only because callers use `announcements(ids,
   * offset)`'s positional-args signature, not because the request differs.
   * @param {string[]} companyIds
   * @param {number} [offset=0] - paginates in steps of 30
   * @returns {Promise<{companyAnnouncements: Array, offset: number, limit: number}>}
   */
  async announcements(companyIds, offset = 0) {
    companyIds = (companyIds || []).map(sanitizeCompanyId);
    const { data } = await this.http.post(
      `${BASE_URL}/api/company/fundamentals/announcements`,
      { companyIds, offset },
      { headers: this._headers(`${BASE_URL}/company/${companyIds[0]}`) }
    );
    return data;
  }

  /**
   * Announcement-scan metadata (index/industry lists).
   *
   * PATH MIGRATED 2026-09-16: old path `GET /api/company/scans/metadata` now
   * 404s. New path `GET /api/scans/stock/metadata` — CONFIRMED LIVE, same
   * response shape (`{indexList, industryList, …}`). Despite the "stock"
   * segment in the new path, this is still the generic index/industry
   * metadata used for announcement-scan filter dropdowns, not a stock-scan-
   * specific endpoint — Stockscans appears to have consolidated metadata
   * lookups under `scans/stock/metadata` regardless of which scan type calls it.
   * @param {Object} [opts] - { referer, optionalAuth }
   * @returns {Promise<Object>}
   */
  async scanMetadata({ referer = `${BASE_URL}/`, optionalAuth = false } = {}) {
    const { data } = await this.http.get(`${BASE_URL}/api/scans/stock/metadata`, {
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
  async companySearch(
    query,
    { type = 'Company', referer = `${BASE_URL}/`, optionalAuth = false } = {}
  ) {
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
   *
   * PATH MIGRATED 2026-09-16: old path `GET /api/user/announcement-scans`
   * now 404s. New path `GET /api/scans/announcement/saved` — CONFIRMED LIVE
   * (read-only, live-probed), same response shape (`{announcementScans: [...]}`).
   *
   * @param {Object} [opts] - { referer }
   * @returns {Promise<Object>}
   */
  async savedAnnouncementScans({ referer = `${BASE_URL}/` } = {}) {
    const { data } = await this.http.get(`${BASE_URL}/api/scans/announcement/saved`, {
      headers: this._headers(referer),
    });
    return data;
  }

  /**
   * Create/save an announcement scan (PUT). Auth required.
   *
   * PATH MIGRATED 2026-09-16: old path `PUT /api/user/announcement-scans`
   * now 404s. New path `PUT /api/scans/announcement/saved` — path taken
   * directly from the user-confirmed migration map; NOT live-tested since
   * this is a mutating call against the real account. Payload/response
   * shape assumed unchanged (mirrors the read-only `savedAnnouncementScans`
   * rename pattern) — verify against a real save before relying on it in a
   * new caller.
   *
   * @param {Object} payload @param {Object} [opts] - { referer }
   * @returns {Promise<Object>}
   */
  async saveAnnouncementScan(payload, { referer = `${BASE_URL}/` } = {}) {
    const { data } = await this.http.put(`${BASE_URL}/api/scans/announcement/saved`, payload, {
      headers: this._headers(referer),
    });
    return data;
  }

  /**
   * Reorder the user's saved announcement scans (PUT …/order). Auth required.
   *
   * PATH MIGRATED 2026-09-16: old path
   * `PUT /api/user/announcement-scans/order` now 404s. New path
   * `PUT /api/scans/announcement/saved/order` — from the user-confirmed
   * migration map; NOT live-tested (mutating). Payload/response shape
   * assumed unchanged.
   *
   * @param {string[]} scanIds @param {Object} [opts] - { referer }
   * @returns {Promise<Object>}
   */
  async reorderAnnouncementScans(scanIds, { referer = `${BASE_URL}/` } = {}) {
    const { data } = await this.http.put(
      `${BASE_URL}/api/scans/announcement/saved/order`,
      { scanIds },
      { headers: this._headers(referer) }
    );
    return data;
  }

  /**
   * Delete a saved announcement scan by id (DELETE). Auth required.
   *
   * PATH MIGRATED 2026-09-16: old path
   * `DELETE /api/user/announcement-scans/{scanId}` now 404s. New path
   * `DELETE /api/scans/announcement/saved/{scanId}` — from the
   * user-confirmed migration map; NOT live-tested (mutating). Response
   * shape assumed unchanged.
   *
   * @param {string} scanId @param {Object} [opts] - { referer }
   * @returns {Promise<Object>}
   */
  async deleteAnnouncementScan(scanId, { referer = `${BASE_URL}/` } = {}) {
    const { data } = await this.http.delete(
      `${BASE_URL}/api/scans/announcement/saved/${encodeURIComponent(scanId)}`,
      { headers: this._headers(referer) }
    );
    return data;
  }

  /**
   * Search announcements by free text.
   *
   * PATH MIGRATED 2026-09-16: old path `POST /api/company/announcements/search`
   * now 404s. Stockscans merged this into the same endpoint as
   * {@link scanAnnouncements} — `POST /api/scans/announcement/search` — with
   * `scan.searchFilters` populated (non-empty) signaling search behavior vs.
   * `scanAnnouncements`'s empty-array scan behavior. This method is now a
   * thin wrapper: callers should prefer {@link scanAnnouncements} directly
   * with `scan.searchFilters` set, but this is kept for backward
   * compatibility with existing call sites.
   *
   * @param {Object} payload
   * @param {Object} [opts]
   * @param {string} [opts.referer] - Override the Referer header (e.g. a company page).
   * @returns {Promise<Object>}
   */
  async searchAnnouncements(payload, { referer = `${BASE_URL}/` } = {}) {
    const { data } = await this.http.post(`${BASE_URL}/api/scans/announcement/search`, payload, {
      headers: this._headers(referer),
    });
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
   *
   * PATH MIGRATED 2026-09-16: old path `POST /api/company/card-details` now
   * 404s. New path `POST /api/home/card-details` — CONFIRMED LIVE, same
   * `{companyIds}` request shape and same response shape (`cardData` keyed
   * by companyId, each with a `prices` intraday array plus `metaRatios` — the
   * intraday `prices` array is new/more prominent in the live response than
   * previously documented, worth double-checking any caller that only reads
   * `metaRatios` still gets what it needs).
   * @param {string[]|string} companyIds - e.g. ['NSE:RELIANCE'] (a single id is wrapped).
   * @returns {Promise<Object>} Raw response; metrics live under `data.cardData[companyId].metaRatios`.
   */
  async cardDetails(companyIds) {
    const ids = (Array.isArray(companyIds) ? companyIds : [companyIds]).map(sanitizeCompanyId);
    const { data } = await this.http.post(
      `${BASE_URL}/api/home/card-details`,
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
    ticker = sanitizeCompanyId(ticker);
    const { data } = await this.http.get(
      `${BASE_URL}/api/company/prices/${encodeURIComponent(ticker)}`,
      { headers: this._headers(`${BASE_URL}/company/${ticker}`) }
    );
    return data;
  }

  /**
   * Minute-level (or other timeframe) OHLCV candles — the price source for
   * event-reaction metrics (returns since result, 1hr/1day/1month post-event).
   * Endpoint verified live 10-Jul-2026 for NSE:ELECON: `tf=1m` batch of 1000
   * candles reliably spans several trading days back from `before` (or "now" if
   * omitted), including the exact minute of a same-day event — e.g. the
   * 2026-07-10 11:47 candle captured Elecon's board-meeting result reaction
   * (515 → 485, ~6% down move, volume 331 → 129k), matching the NSE-verified
   * 11:47:44 announcement time.
   *
   * PATH MIGRATED 2026-09-16: old path `GET /api/company/ohlcv/{ticker}` now
   * 404s. New path `GET /api/charts/ohlcv/{ticker}` — CONFIRMED LIVE.
   * **The `tf` enum also changed** — the old `'1d'` value now returns
   * `400 {"message":"Input should be '1m', '2m', '3m', '5m', '10m', '15m',
   * '30m', '1h', '2h', '4h', '1D', '1W' or '1M'"}`. Daily is now `'1D'`
   * (capital D), and new intermediate values (`2m`, `3m`, `10m`, `2h`, `4h`)
   * plus weekly/monthly (`1W`, `1M`) were added. `'1m'`/`'5m'`/`'15m'`/`'1h'`
   * are unchanged. Response is gzip-compressed by the server (handled
   * transparently by this client's underlying HttpClient/axios — no special
   * handling needed here) and the shape is otherwise unchanged: `{companyId,
   * name, exchange, tf, prices: [[date, o, h, l, c, v], …], hasMore}`.
   * Auth: requires STOCKSCANS_AUTH_TOKEN (the `authtoken` cookie) — same as the
   * rest of this client. No extra headers (e.g. x-sync-source) were required in
   * testing despite appearing in a browser-captured request.
   * Pagination: response includes `hasMore`; when true, re-call with `before`
   * set to the earliest candle's timestamp from the previous page to page
   * further back in history.
   * @param {string} ticker - e.g. "NSE:ELECON".
   * @param {Object} [opts]
   * @param {'1m'|'2m'|'3m'|'5m'|'10m'|'15m'|'30m'|'1h'|'2h'|'4h'|'1D'|'1W'|'1M'} [opts.tf='1m']
   * @param {string} [opts.before] - ISO timestamp (no 'Z'), e.g.
   *   "2026-07-03T10:23:00" — fetch candles strictly before this point.
   * @returns {Promise<{companyId:string,name:string,exchange:string,tf:string,
   *   prices:Array<[string,number,number,number,number,number]>,hasMore:boolean}>}
   *   prices rows are [isoTimestamp (or date for 1D/1W/1M), open, high, low, close, volume].
   */
  async ohlcv(ticker, { tf = '1m', before } = {}) {
    ticker = sanitizeCompanyId(ticker);
    const params = { tf };
    if (before) params.before = before;
    const { data } = await this.http.get(
      `${BASE_URL}/api/charts/ohlcv/${encodeURIComponent(ticker)}`,
      {
        params,
        headers: this._headers(`${BASE_URL}/charts/${encodeURIComponent(ticker)}`),
      }
    );
    return data;
  }

  /**
   * Official company documents (AR / concall / PPT / results).
   *
   * PATH MIGRATED 2026-09-16: old path `GET /api/company/documents/{id}` now
   * 404s. New path `GET /api/company/fundamentals/documents/{id}` —
   * CONFIRMED LIVE, same response shape (`{companyId, documents: [{date,
   * documentType, ssUrl, hasNotes}, …]}`).
   * @param {string} companyId
   * @returns {Promise<Object>}
   */
  async documents(companyId) {
    // Stockscans keys on the bare exchange:symbol — a "-BE"/"-SM" series
    // suffix from raw feed data would otherwise 404 or silently return the
    // wrong company's documents. See stock-api/src/utils/companyId.js.
    companyId = sanitizeCompanyId(companyId);
    const { data } = await this.http.get(
      `${BASE_URL}/api/company/fundamentals/documents/${companyId}`,
      { headers: this._headers(`${BASE_URL}/company/${companyId}`) }
    );
    return data;
  }

  /**
   * Bulk "which companies have filed results this quarter" scan — powers
   * the /result-scans page. Unlike {@link documents}, this is NOT scoped to
   * one companyId: a single paginated call (50/page) returns every company
   * across the whole market that has a Result/PPT/Transcript filed for the
   * CURRENT results season.
   *
   * Confirmed by live testing (2026-07-26):
   * - Schema is strict — passing `quarterDate`/`quarter` in the request body
   *   returns HTTP 400 "Extra inputs are not permitted". This endpoint has
   *   NO historical-quarter override; it always reflects whatever quarter
   *   Stockscans currently considers "in season". Use {@link documents} for
   *   any explicit non-latest quarter.
   * - `documentType: "Transcript"` filters server-side to only companies
   *   with an official transcript already filed (86 of 502 as of the test
   *   date) — the exact Tier-2 "official-transcript-exists" set in one
   *   paginated fetch, no per-company calls needed.
   * - `searchCompany` filters to a single company by name substring (not
   *   useful for bulk lookups — paginate documentType:"" instead and look
   *   up companyIds client-side).
   * - Response shape: `{ documents: [{Name, companyId, resultSsUrl,
   *   pptSsUrl, transcriptSsUrl, hasNotes, updatedAt}], total, quarterDate }`.
   *   `total` across all pages was 502 companies, 11 pages at offset+=50 —
   *   trivial to fully page through even for a 1000-company bulk request,
   *   since the call volume depends on how many companies filed this
   *   quarter market-wide, not on how many the caller asked about.
   *
   * PATH MIGRATED 2026-09-16: old path `POST /api/company/results/documents`
   * now 404s. New path `POST /api/scans/result/documents` — CONFIRMED LIVE,
   * same request body and response shape (`{documents, total, quarterDate}`).
   *
   * @param {Object} [opts]
   * @param {number} [opts.offset=0] - paginates in steps of 50
   * @param {string} [opts.documentType=''] - '', 'Result', 'PPT', or 'Transcript'
   * @param {string} [opts.searchCompany=''] - single-company name filter (not for bulk use)
   * @param {string[]} [opts.watchlistIds=[]] - restrict to companies on these watchlist(s)
   *   (e.g. a throwaway watchlist built from an arbitrary companyId list — see
   *   get-concall-transcript-url.js scenario 2)
   * @returns {Promise<{documents: Array, total: number, quarterDate: string}>}
   */
  async resultsDocuments({
    offset = 0,
    documentType = '',
    searchCompany = '',
    watchlistIds = [],
  } = {}) {
    const { data } = await this.http.post(
      `${BASE_URL}/api/scans/result/documents`,
      {
        scan: { filters: [], index: [], industry: [], watchlistIds },
        offset,
        searchCompany,
        documentType,
      },
      { headers: this._headers(`${BASE_URL}/result-scans`) }
    );
    return data;
  }

  /**
   * Paginate {@link resultsDocuments} to completion and return a
   * companyId -> doc lookup map for the CURRENT results season, plus the
   * `quarterDate` it applies to. Callers must confirm this quarterDate
   * matches the quarter they actually want before trusting the map (see
   * {@link resultsDocuments} docs — there's no historical override).
   *
   * Cost: a fixed ~11 sequential calls regardless of how many companies the
   * caller cares about (11 pages covered the full 502-company results
   * season in live testing, ~2.7s total) — this is the bulk replacement for
   * what would otherwise be one {@link documents} call per company.
   *
   * @param {Object} [opts]
   * @param {string} [opts.documentType=''] - passthrough filter
   * @returns {Promise<{quarterDate: string, byCompanyId: Map<string, Object>, total: number}>}
   */
  async resultsDocumentsMap({ documentType = '' } = {}) {
    const byCompanyId = new Map();
    let offset = 0;
    let total = null;
    let quarterDate = null;
    for (;;) {
      const page = await this.resultsDocuments({ offset, documentType });
      total = page.total;
      quarterDate = page.quarterDate;
      const docs = page.documents || [];
      if (!docs.length) break;
      for (const doc of docs) byCompanyId.set(doc.companyId, doc);
      offset += docs.length;
      if (offset >= total) break;
    }
    return { quarterDate, byCompanyId, total };
  }

  /**
   * AI-synthesized growth-catalyst report for a company (ready-made research
   * context — no synthesis needed on our side).
   *
   * PATH MIGRATED 2026-09-16: old path
   * `GET /api/company/growth-catalysts/{id}` now 404s. New path
   * `GET /api/company/reports/growth-catalysts/{id}` — CONFIRMED LIVE, same
   * response shape (`{finalReport, dateLabel, toc}`). Note: this endpoint (like
   * {@link businessOverview} and {@link concallNotes}) is served by a
   * different backend (`server: uvicorn`, i.e. Python/FastAPI) than the
   * Next.js-fronted endpoints — it occasionally returned a bare `401 {}` in
   * testing that cleared on retry within ~1.5s, which looked like an auth
   * failure but was NOT (same token, same headers, succeeded moments later on
   * an unmodified retry) — treat a 401 from this specific endpoint as
   * possibly transient/rate-limit-like and retry once before treating it as a
   * real auth failure.
   * @param {string} companyId
   * @returns {Promise<{finalReport: string, dateLabel: string, toc: Array<{id, text}>}>}
   */
  async growthCatalysts(companyId) {
    companyId = sanitizeCompanyId(companyId);
    const { data } = await this.http.get(
      `${BASE_URL}/api/company/reports/growth-catalysts/${encodeURIComponent(companyId)}`,
      { headers: this._headers(`${BASE_URL}/company/${companyId}`) }
    );
    return data;
  }

  /**
   * AI-synthesized business-overview report for a company (ready-made research
   * context — no synthesis needed on our side).
   *
   * PATH MIGRATED 2026-09-16: old path
   * `GET /api/company/business-overview/{id}` now 404s. New path
   * `GET /api/company/reports/business-overview/{id}` — CONFIRMED LIVE, same
   * response shape (`{finalReport, dateLabel, toc}`).
   * @param {string} companyId
   * @returns {Promise<{finalReport: string, dateLabel: string, toc: Array<{id, text}>}>}
   */
  async businessOverview(companyId) {
    companyId = sanitizeCompanyId(companyId);
    const { data } = await this.http.get(
      `${BASE_URL}/api/company/reports/business-overview/${encodeURIComponent(companyId)}`,
      { headers: this._headers(`${BASE_URL}/company/${companyId}`) }
    );
    return data;
  }

  /**
   * AI-synthesized notes from a single concall transcript. `ssUrl` is the
   * transcript document's id — see {@link documents} (filter
   * `documentType === 'Transcript'`) or {@link latestTranscript}.
   *
   * PATH MIGRATED 2026-09-16: old path
   * `GET /api/company/concall-notes/{id}/{ssUrl}` now 404s. New path
   * `GET /api/scans/concall/notes/{id}/{ssUrl}` — CONFIRMED LIVE, same
   * response shape (`{finalReport, date, companyName, bullets}`). Like
   * {@link growthCatalysts}, occasionally returned a transient bare `401 {}`
   * that cleared on retry — see that method's doc note.
   * @param {string} companyId
   * @param {string} ssUrl
   * @returns {Promise<{finalReport: string, date: string, companyName: string, bullets: Object}>}
   */
  async concallNotes(companyId, ssUrl) {
    companyId = sanitizeCompanyId(companyId);
    const { data } = await this.http.get(this.concallNotesUrl(companyId, ssUrl), {
      headers: this._headers(`${BASE_URL}/company/${companyId}`),
    });
    return data;
  }

  /**
   * The raw notes-endpoint URL for a single concall transcript — same
   * endpoint {@link concallNotes} calls server-side, exposed here so callers
   * that need a plain navigable URL (e.g. a frontend "open notes" link) can
   * get one without reconstructing the path themselves. Keeping the actual
   * path segment (`scans/concall/notes`) in this one method means a future
   * Stockscans path migration only has to change it here.
   * @param {string} companyId
   * @param {string} ssUrl
   * @returns {string}
   */
  concallNotesUrl(companyId, ssUrl) {
    companyId = sanitizeCompanyId(companyId);
    return `${BASE_URL}/api/scans/concall/notes/${encodeURIComponent(companyId)}/${encodeURIComponent(ssUrl)}`;
  }

  /**
   * Resolve the most recent concall Transcript document for a company (or
   * null if none on file). One extra call to {@link documents} — cheap
   * relative to the AI-synthesis endpoints, and callers rarely want anything
   * but the latest transcript.
   * @param {string} companyId
   * @returns {Promise<Object|null>} The document record (has `.ssUrl`, `.date`), or null.
   */
  async latestTranscript(companyId) {
    const { documents } = await this.documents(companyId);
    const transcripts = (documents || []).filter((d) => d.documentType === 'Transcript' && d.ssUrl);
    if (!transcripts.length) return null;
    // date is 'YYYY' or 'YYYYMM'; pad so lexical/numeric compare both sort correctly,
    // unparseable dates sort last rather than crashing the comparator.
    const rank = (d) => {
      const raw = String(d.date || '');
      return /^\d{4}(\d{2})?$/.test(raw) ? parseInt(raw.padEnd(6, '9'), 10) : -1;
    };
    return [...transcripts].sort((a, b) => rank(b) - rank(a))[0];
  }

  /**
   * Concall sentiment/quality scan — powers the /concall-scans page.
   *
   * PATH MIGRATED 2026-09-16: old path `POST /api/company/concall-scan` now
   * 404s. New path `POST /api/scans/concall/run` — CONFIRMED LIVE with the
   * unmodified pre-migration payload shape, and the response shape below
   * (`{rows, next, quarter, subscription}`, 12-element positional rows) is
   * UNCHANGED — a direct path swap, no payload/response migration needed.
   *
   * Confirmed live 2026-08-01 (throwaway watchlist of 50 real tickers, `resultsDocuments`
   * transcript set). Response: `{rows: [...], next, quarter, subscription}` —
   * NOT `records`/`data`/`items` as originally guessed. `next` is the offset to
   * pass on the following call, or `null` when exhausted (confirmed with a
   * 50-row page — `next: 50` on page 1, `next: null` on page 2 with 0 rows).
   *
   * Each row is a POSITIONAL ARRAY of 12 elements (confirmed live, sample size
   * ~65 rows across large-caps and midcaps):
   *   [0]  internal numeric id (string, e.g. "24769") — purpose unconfirmed
   *   [1]  companyId, e.g. "NSE:MUTHOOTFIN"
   *   [2]  company name
   *   [3]  industry/category label
   *   [4]  ISO date+offset of the concall/result, e.g. "2026-08-01T16:00:00+05:30"
   *        — this IS the "how recent" field gainers-signal's 7-day check needs.
   *   [5]  a PDF filename slug (e.g. "as-6dfa....pdf") — likely the results
   *        PPT/announcement doc; not yet resolved to a full ssUrl/URL.
   *   [6]  small integer, always `1` in every observed row — meaning unconfirmed.
   *   [7]  boolean, always `true` in every observed row — meaning unconfirmed.
   *   [8]  resultQualityScore (number, 0-100, nullable — null seen for ABB/URBANCO)
   *   [9]  sentiment (number 0-4) — see {@link CONCALL_SCAN_SENTIMENT}
   *   [10] highlights (string[], typically 3 items, each prefixed ▲/▼/●)
   *   [11] a second PDF filename slug, nullable — likely the transcript ssUrl
   *        (several rows had this null while [5] was present, and vice versa
   *        never observed — needs one more live comparison against
   *        `documents(companyId)` to confirm which doc type this is before
   *        relying on it for a document link).
   * Indices 0, 5, 6, 7, 11 are read but not yet load-bearing anywhere in this
   * codebase — if a new caller needs one of them, confirm its exact meaning
   * against a second live company/quarter first rather than assuming this
   * comment's guess is right.
   *
   * Scope to a specific company set the same way as {@link scanAnnouncements}
   * — via `payload.watchlistIds` on a throwaway watchlist (see
   * `createWatchlist`/`deleteWatchlist`, always paired in try/finally).
   *
   * @param {Object} payload - e.g. `{industry:[], index:[], watchlistIds:[],
   *   resultTiers:[], sentimentTiers:[], filters:[{left,sign,right}], q:'', offset:0}`
   * @param {Object} [opts]
   * @param {string} [opts.referer]
   * @param {boolean} [opts.optionalAuth=false]
   * @returns {Promise<{rows: Array<Array>, next: number|null, quarter: string, subscription: string}>}
   */
  async concallScan(payload, { referer = `${BASE_URL}/concall-scans`, optionalAuth = false } = {}) {
    const { data } = await this.http.post(`${BASE_URL}/api/scans/concall/run`, payload, {
      headers: this._headers(referer, optionalAuth),
    });
    return data;
  }

  /**
   * Management-interview scan — powers the /interview-scans page. Surfaces
   * recent YouTube management interviews/appearances for a company (or a
   * keyword search across channels), each pre-tagged with the company(s)
   * mentioned.
   *
   * CONFIRMED LIVE 2026-09-25 (user-supplied sample payload/response, plus a
   * live re-check of the paired `interviewDetail` call below against the
   * same video). `POST /api/scans/interview/run`.
   *
   * @param {Object} payload - `{industry:[], index:[], watchlistIds:[],
   *   channelIds:[], q:'<ticker symbol or free text>', cursor:''}`. `q` is a
   *   free-text match against company tag/title — the confirmed usage is a
   *   bare ticker symbol (no exchange prefix, e.g. `"NEPHROPLUS"` not
   *   `"NSE:NEPHROPLUS"`); each returned row's company tags (index 6) still
   *   need to be checked against the target companyId before trusting a
   *   match, since `q` is a text search, not an exact scope filter. Scoping
   *   via `watchlistIds` (the throwaway-watchlist pattern, §14) is
   *   presumably also supported (the field exists on the payload) but is
   *   NOT yet live-confirmed for this endpoint — confirm before relying on
   *   it instead of `q`.
   * @param {Object} [opts]
   * @param {string} [opts.referer]
   * @param {boolean} [opts.optionalAuth=false]
   * @returns {Promise<{rows: Array<Array>, next: string|null, total: number,
   *   channels: Array<[string,string]>, subscription: string}>} `next` is an
   *   opaque cursor (not an offset) — per conventions §16's parallelization
   *   exception, do NOT fire pages concurrently; page sequentially, passing
   *   `next` back as `cursor` until it comes back `null`.
   *
   * Each row is a POSITIONAL ARRAY of 7 elements (confirmed live):
   *   [0] videoId (YouTube id, e.g. "Y7YT7sqszzg")
   *   [1] title
   *   [2] publishedAt — ISO datetime with `+05:30` offset
   *   [3] duration (seconds)
   *   [4] embeddable (boolean)
   *   [5] channelName
   *   [6] companies — `Array<[companyId, companyName, isPrimary:boolean]>`
   */
  async interviewScan(payload, { referer = `${BASE_URL}/interview-scans`, optionalAuth = false } = {}) {
    const { data } = await this.http.post(`${BASE_URL}/api/scans/interview/run`, payload, {
      headers: this._headers(referer, optionalAuth),
    });
    return data;
  }

  /**
   * Management-interview takeaways for a single video — the paired "detail"
   * call for a `videoId` surfaced by {@link interviewScan}.
   *
   * CONFIRMED LIVE 2026-09-25 (`videoId: "Y7YT7sqszzg"`, a NephroPlus/ET Now
   * interview — see `docs/stockscans-api-schemas.md`).
   *
   * @param {string} videoId
   * @param {Object} [opts]
   * @param {string} [opts.referer]
   * @param {boolean} [opts.optionalAuth=false]
   * @returns {Promise<{takeaways: Array<[string, string, null]>, video:
   *   {title: string, channelName: string, publishedAt: string, embeddable:
   *   boolean}}>} `takeaways` is an array of `[companyId, markdownBullets,
   *   null]` — one entry per company the interview substantively discusses
   *   (a single-company interview has one entry; the third element's
   *   purpose is unconfirmed, always observed `null`). `markdownBullets` is
   *   a Stockscans-generated SUMMARY of the interview, not a verbatim
   *   transcript excerpt — treat it with the same caution as any
   *   secondary-source paraphrase (see rerating-catalysts SKILL.md's
   *   interview-sourcing note).
   */
  async interviewDetail(videoId, { referer = `${BASE_URL}/interview-scans`, optionalAuth = false } = {}) {
    const { data } = await this.http.post(
      `${BASE_URL}/api/scans/interview/detail`,
      { videoId },
      { headers: this._headers(referer, optionalAuth) }
    );
    return data;
  }

  // ── Watchlists ──────────────────────────────────────────────────────────────

  /**
   * @param {string} watchlistId
   * @param {Object} [opts] - ratiosType, order, orderBy, plus extra payload fields.
   * @returns {Promise<Object>}
   */
  async watchlistTable(watchlistId, opts = {}) {
    const {
      ratiosType = 'Performance',
      order = 'desc',
      orderBy = 'Market Capitalization',
      ...rest
    } = opts;
    const payload = { watchlistId, ratiosType, order, orderBy, ...rest };
    const { data } = await this.http.post(`${BASE_URL}/api/user/watchlists/table`, payload, {
      headers: this._headers(`${BASE_URL}/watchlists`),
    });
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
    companyIds = (companyIds || []).map(sanitizeCompanyId);
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
   * Create a new (typically throwaway) watchlist. Confirmed live 2026-07-26:
   * `POST /api/user/watchlists` requires exactly `{watchlistName, companyIds}`
   * — passing only one of the two fields returns HTTP 400 "Field required".
   * Primary use case: batching an `announcements/scan` call across MORE than
   * the 10 companies `companyFilters` allows in one call (confirmed live —
   * an 11th unique companyId returns HTTP 400 "List should have at most 10
   * items"). Scanning by `watchlistIds` instead of `companyFilters` has no
   * such cap — tested live with 15 and 50 companies in one watchlist, both
   * scanned successfully in a single call (paginated normally). Always pair
   * with {@link deleteWatchlist} in a `finally` block — this creates a real
   * watchlist in the user's account, not a scoped/ephemeral resource.
   * @param {string} name
   * @param {string[]} companyIds
   * @returns {Promise<{watchlistId: string, watchlistName: string, companyIds: string[]}>}
   */
  async createWatchlist(name, companyIds) {
    companyIds = (companyIds || []).map(sanitizeCompanyId);
    const { data } = await this.http.post(
      `${BASE_URL}/api/user/watchlists`,
      { watchlistName: name, companyIds },
      { headers: this._headers(`${BASE_URL}/watchlists`) }
    );
    return data;
  }

  /**
   * Delete a watchlist by id. Confirmed live: `DELETE /api/user/watchlists`
   * with `{watchlistId}` in the body — NOT `DELETE /api/user/watchlists/{id}`
   * as a path param, which 404s (that path pattern works for
   * {@link deleteAnnouncementScan}, a different resource, but not this one).
   * @param {string} watchlistId
   * @returns {Promise<Object>}
   */
  async deleteWatchlist(watchlistId) {
    const { data } = await this.http.delete(`${BASE_URL}/api/user/watchlists`, {
      headers: this._headers(`${BASE_URL}/watchlists`),
      data: { watchlistId },
    });
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
    companyIds = companyIds.map(sanitizeCompanyId);
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
   * Server-rendered company page (`/company/<EXCH:SYMBOL>`), ~400-500 KB of
   * Next.js SSR HTML. There is NO JSON API behind its financials section --
   * the Quarterly Results / Annual P&L tables are plain `<table>`s in this
   * HTML (confirmed 2026-09-20), so the only way to get historical P&L is to
   * fetch the page and parse it (see `analyzers/companyFinancials.js`, which
   * owns the parsing; this method only fetches).
   *
   * @param {string} companyId - e.g. "NSE:AVALON" (series suffix stripped).
   * @returns {Promise<string>} Raw HTML.
   */
  async companyPageHtml(companyId) {
    const id = sanitizeCompanyId(companyId);
    const headers = {
      cookie: `authtoken=${this.auth.getToken()}`,
      accept: 'text/html,application/xhtml+xml',
    };
    const { data } = await this.http.get(`${BASE_URL}/company/${encodeURIComponent(id)}`, {
      headers,
      timeout: 45000,
    });
    return typeof data === 'string' ? data : String(data);
  }

  /**
   * The authenticated user's saved scans.
   *
   * PATH MIGRATED 2026-09-16: old path `GET /api/user/saved-scans` now
   * 404s. New path `GET /api/scans/stock/saved` — CONFIRMED LIVE, same
   * response shape (`{scans: [...]}`).
   *
   * @returns {Promise<Object>} Raw response (a bare array or `{ scans: [...] }`).
   */
  async savedScans() {
    const { data } = await this.http.get(`${BASE_URL}/api/scans/stock/saved`, {
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

  /**
   * Validate that the auth token is active.
   * Throws if expired.
   */
  async validateAuth() {
    try {
      await this.http.get(`${BASE_URL}/api/user/watchlists`, {
        params: { view: 'names' },
        headers: this._headers(`${BASE_URL}/`),
      });
    } catch (e) {
      if (e.response && (e.response.status === 401 || e.response.status === 403)) {
        throw new Error('STOCKSCANS_AUTH_TOKEN is expired or invalid.');
      }
      throw e;
    }
  }

  /**
   * Results scan with filters and date filtering — powers the /result-scans page
   * with advanced filtering capability. Unlike {@link resultsDocuments}, this
   * endpoint supports:
   * - `resultDate` filter to fetch results filed on a specific date
   * - Custom scan filters (e.g., EPS Growth, Market Cap thresholds)
   * - Full pagination support (response includes offset management)
   *
   * Confirmed by live testing (2026-08-11):
   * - Payload must include `scan` object with `filters` array (can be empty)
   * - `resultDate` in YYYY-MM-DD format filters to results filed that day
   * - Paginates via `offset` parameter (can determine page size by response count)
   *
   * PATH MIGRATED 2026-09-16: old path `POST /api/company/results/scan` now
   * 404s. New path `POST /api/scans/result/run` — CONFIRMED LIVE, same
   * request payload shape. BREAKING RESPONSE CHANGE: the old `data.results`
   * array is gone — the response now returns a top-level `resultTables` key
   * instead. Any caller reading `response.data.results` (or similar) must be
   * updated to read `response.resultTables`. See
   * scripts/jobs/daily_results_extractor.js, which was updated alongside
   * this change.
   *
   * @param {Object} payload - Full payload shape:
   *   {
   *     scan: {
   *       filters: [{left: string, sign: string, right: number|string}, ...],
   *       index: [],
   *       industry: [],
   *       watchlistIds: []
   *     },
   *     order: 'desc'|'asc',
   *     orderBy: string (e.g. "Last Result Date"),
   *     offset: number,
   *     resultDate: 'YYYY-MM-DD',
   *     searchCompany: '',
   *     documentType: ''
   *   }
   * @param {Object} [opts]
   * @param {string} [opts.referer]
   * @returns {Promise<{resultTables: Array, status: number, message?: string}>}
   */
  async resultsScan(payload, { referer = `${BASE_URL}/result-scans` } = {}) {
    const { data } = await this.http.post(`${BASE_URL}/api/scans/result/run`, payload, {
      headers: this._headers(referer),
    });
    return data;
  }
}

/**
 * Sentiment enum for {@link StockscansClient#concallScan} response records,
 * index [9]. Per user-provided mapping (2026-08-01) — not yet independently
 * confirmed against a live payload.
 */
const CONCALL_SCAN_SENTIMENT = {
  0: 'Bearish',
  1: 'Cautious',
  2: 'Neutral', // source spec had a typo ("Nuetral") — corrected here
  3: 'Optimistic',
  4: 'Bullish',
};

module.exports = {
  StockscansClient,
  STOCKSCANS_BASE_URL: BASE_URL,
  S3_BASE_URL,
  CONCALL_SCAN_SENTIMENT,
};
