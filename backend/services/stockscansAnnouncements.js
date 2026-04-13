/**
 * @fileoverview StockScans company announcements search API client and mappers
 * @module services/stockscansAnnouncements
 * @see {@link docs/API_REFERENCE.md#announcements-apis} for API docs
 */

const axios = require('axios');
const { getAuthToken, createAuthenticatedClient } = require('./stockscansAuth');

const STOCKSCANS_ANNOUNCEMENTS_SEARCH_URL =
  'https://www.stockscans.in/api/company/announcements/search';
const STOCKSCANS_ASSETS_BASE = 'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs';

/** Minimum search length required by StockScans (API returns validation error below this) */
const MIN_SEARCH_LENGTH = 3;

/**
 * Broad default search when the client sends under three characters (StockScans rejects shorter queries).
 * "report" matches many filings without being as narrow as a single category.
 * @type {string}
 */
const DEFAULT_ANNOUNCEMENT_SEARCH = 'report';

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Remove HTML tags from announcement text for safe plain-text display
 * @param {string} html - Raw HTML from StockScans
 * @returns {string} Plain text
 */
function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convert YYYY-MM-DD to NSE-style display used elsewhere in the app (e.g. ZIP filenames)
 * @param {string} ymd - Date part from StockScans (`date` field)
 * @returns {string} e.g. "31-Jan-2025 00:00:00"
 */
function ymdToNseDisplay(ymd) {
  if (!ymd || typeof ymd !== 'string') return '';
  const part = ymd.split('T')[0];
  const [y, m, d] = part.split('-');
  if (!y || !m || !d) return '';
  const mi = parseInt(m, 10) - 1;
  if (mi < 0 || mi > 11) return '';
  return `${parseInt(d, 10)}-${MONTH_LABELS[mi]}-${y} 00:00:00`;
}

/**
 * Map one StockScans announcement row to the shape expected by {@link frontend/components/stock/AnnouncementsTab}
 * @param {Object} row - Raw `companyAnnouncements` item
 * @returns {Object} Normalized announcement
 */
function mapStockScansAnnouncement(row) {
  if (!row || typeof row !== 'object') {
    return null;
  }
  const ssUrl = row.ssUrl || null;
  const attchmntFile = ssUrl ? `${STOCKSCANS_ASSETS_BASE}/${ssUrl}` : null;
  const an_dt = ymdToNseDisplay(row.date || (row.createdAt || '').split('T')[0]);

  return {
    subject: row.title || 'Announcement',
    desc: stripHtml(row.description || ''),
    an_dt,
    attchmntFile,
    attchmntText: null,
    source: 'stockscans',
    companyId: row.companyId,
  };
}

/**
 * Resolve axios client: authenticated when `STOCKSCANS_AUTH_TOKEN` is set
 * @returns {{ client: import('axios').AxiosInstance, hasAuth: boolean }}
 */
function getAnnouncementsClient() {
  try {
    const token = getAuthToken();
    return { client: createAuthenticatedClient(token), hasAuth: true };
  } catch {
    return { client: axios.create({ timeout: 30000 }), hasAuth: false };
  }
}

/**
 * Search announcements for a company via StockScans
 * @param {Object} options
 * @param {string} options.companyId - e.g. `NSE:RELIANCE`
 * @param {string} [options.search] - Search string (empty uses default broad term)
 * @param {number} [options.offset=0] - Pagination offset
 * @returns {Promise<{ data: Object[], meta: { offset: number, limit: number, search: string, companyId: string } }>}
 * @throws {Error} With `code` `STOCKSCANS_BAD_COMPANY` when upstream returns HTTP 5xx with a generic/internal error (often unknown `companyId` on StockScans)
 */
async function searchCompanyAnnouncements({ companyId, search, offset = 0 }) {
  const raw = (search || '').trim();
  const effectiveSearch = raw.length >= MIN_SEARCH_LENGTH ? raw : DEFAULT_ANNOUNCEMENT_SEARCH;

  const { client, hasAuth } = getAnnouncementsClient();
  if (!hasAuth) {
    const err = new Error(
      'STOCKSCANS_AUTH_TOKEN is required for announcements. Add the authtoken cookie value from stockscans.in to backend/.env'
    );
    err.code = 'STOCKSCANS_AUTH_REQUIRED';
    throw err;
  }

  let response;
  try {
    response = await client.post(
      STOCKSCANS_ANNOUNCEMENTS_SEARCH_URL,
      {
        search: effectiveSearch,
        companyId,
        offset,
      },
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Origin: 'https://www.stockscans.in',
          Referer: `https://www.stockscans.in/company/${encodeURIComponent(companyId)}`,
        },
      }
    );
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const data = err.response.data;
      let message = 'StockScans announcements search failed';
      if (data && typeof data === 'object' && typeof data.message === 'string') {
        message = data.message;
      } else if (typeof data === 'string' && data.length < 200) {
        message = data;
      }
      let code = 'STOCKSCANS_HTTP_ERROR';
      if (status === 401 || status === 403) {
        message = `StockScans authentication failed (HTTP ${status}). Refresh STOCKSCANS_AUTH_TOKEN in backend/.env from your stockscans.in session.`;
      } else if (status >= 500) {
        const raw =
          data && typeof data === 'object' && typeof data.message === 'string'
            ? data.message.trim()
            : '';
        const emptyOrGenericBody =
          !data || (typeof data === 'object' && Object.keys(data).length === 0) || !raw;
        const looksLikeUnknownCompany =
          emptyOrGenericBody ||
          !raw ||
          /^internal error occurred$/i.test(raw) ||
          /\binternal error\b/i.test(raw);
        if (looksLikeUnknownCompany) {
          code = 'STOCKSCANS_BAD_COMPANY';
          message = `StockScans returned no data for ${companyId} (HTTP ${status}). This symbol may be missing from StockScans; try the NSE data source or confirm the listing on stockscans.in.`;
        } else {
          message = `StockScans server error (HTTP ${status}): ${raw}. Try again later if this persists.`;
        }
      }
      const out = new Error(message);
      out.code = code;
      out.status = status;
      out.details = data;
      throw out;
    }
    const out = new Error(err.message || 'StockScans request failed (network)');
    out.code = 'STOCKSCANS_NETWORK';
    throw out;
  }

  const body = response.data || {};
  if (body.status === 'error') {
    const err = new Error(body.message || 'StockScans announcements search failed');
    err.code = 'STOCKSCANS_API_ERROR';
    err.details = body;
    throw err;
  }

  const rows = Array.isArray(body.companyAnnouncements) ? body.companyAnnouncements : [];
  const data = rows.map(mapStockScansAnnouncement).filter(Boolean);
  const limit = typeof body.limit === 'number' ? body.limit : data.length;

  return {
    data,
    meta: {
      offset: typeof body.offset === 'number' ? body.offset : offset,
      limit,
      search: effectiveSearch,
      companyId,
      requestedSearch: raw.length >= MIN_SEARCH_LENGTH ? raw : null,
    },
  };
}

module.exports = {
  DEFAULT_ANNOUNCEMENT_SEARCH,
  MIN_SEARCH_LENGTH,
  STOCKSCANS_ASSETS_BASE,
  mapStockScansAnnouncement,
  searchCompanyAnnouncements,
  stripHtml,
  ymdToNseDisplay,
};
