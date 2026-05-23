/**
 * @fileoverview StockScans announcement scan API — earnings-call transcripts by company list
 * @module services/stockscansAnnouncementScan
 * @see {@link docs/API_REFERENCE.md#download-latest-concall-transcripts-zip} for API docs
 */

const { getAuthToken, createAuthenticatedClient } = require('./stockscansAuth');
const { STOCKSCANS_ASSETS_BASE, ymdToNseDisplay } = require('./stockscansAnnouncements');

const STOCKSCANS_ANNOUNCEMENTS_SCAN_URL =
  'https://www.stockscans.in/api/company/announcements/scan';

/** StockScans validates `companyFilters` with max length 10 per announcement scan request */
const MAX_ANNOUNCEMENT_SCAN_COMPANY_FILTERS = 10;

/** Quarter-end months used by StockScans `quarterDate` (YYYYMM) */
const QUARTER_END_MONTHS = [3, 6, 9, 12];

/**
 * Current StockScans quarter key (YYYYMM) for the active calendar quarter.
 * @returns {string} e.g. `202606` when today is in Apr–Jun 2026
 */
function currentQuarterDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const qMonth = QUARTER_END_MONTHS.find((m) => month <= m) ?? 12;
  return `${year}${String(qMonth).padStart(2, '0')}`;
}

/**
 * Previous quarter key relative to a YYYYMM value.
 * @param {string} quarterDate - e.g. `202603`
 * @returns {string}
 */
function previousQuarterDate(quarterDate) {
  const s = String(quarterDate || '').trim();
  if (!/^\d{6}$/.test(s)) return currentQuarterDate();
  let year = parseInt(s.slice(0, 4), 10);
  let month = parseInt(s.slice(4, 6), 10);
  const idx = QUARTER_END_MONTHS.indexOf(month);
  if (idx <= 0) {
    year -= 1;
    month = QUARTER_END_MONTHS[QUARTER_END_MONTHS.length - 1];
  } else {
    month = QUARTER_END_MONTHS[idx - 1];
  }
  return `${year}${String(month).padStart(2, '0')}`;
}

/**
 * Parse comma/space/newline-separated company ids; bare symbols become `NSE:{SYMBOL}`.
 * @param {string} raw - User paste input
 * @returns {string[]} Unique normalized ids in input order
 */
function parseCompanyIdInput(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const tokens = raw
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const token of tokens) {
    const upper = token.toUpperCase();
    const id = upper.includes(':') ? upper : `NSE:${upper}`;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Build `companyFilters` payload entries for the scan API.
 * @param {string[]} companyIds
 * @returns {Array<{ companyId: string }>}
 */
function toCompanyFilters(companyIds) {
  return companyIds.map((companyId) => ({ companyId }));
}

/**
 * Split company ids into chunks for StockScans announcement scan API limits.
 * @param {string[]} companyIds
 * @param {number} [size=MAX_ANNOUNCEMENT_SCAN_COMPANY_FILTERS]
 * @returns {string[][]}
 */
function chunkCompanyIds(companyIds, size = MAX_ANNOUNCEMENT_SCAN_COMPANY_FILTERS) {
  const ids = Array.isArray(companyIds) ? companyIds.filter(Boolean) : [];
  if (size < 1) return [ids];
  /** @type {string[][]} */
  const chunks = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

/**
 * Map one scan row to normalized announcement + download URL.
 * @param {Object} row
 * @returns {Object|null}
 */
function mapScanAnnouncement(row) {
  if (!row || typeof row !== 'object') return null;
  const ssUrl = row.ssUrl || null;
  const attchmntFile = ssUrl ? `${STOCKSCANS_ASSETS_BASE}/${ssUrl}` : null;
  const an_dt = ymdToNseDisplay(row.date || (row.createdAt || '').split(' ')[0]);
  const [, symbol = ''] = String(row.companyId || '').split(':');

  return {
    companyId: row.companyId,
    symbol,
    name: row.name || symbol,
    subject: row.title || 'Earnings Call Transcript',
    desc: row.description || '',
    an_dt,
    attchmntFile,
    ssUrl,
    date: row.date || '',
    source: 'stockscans-scan',
  };
}

/**
 * Single StockScans announcement scan request (≤ {@link MAX_ANNOUNCEMENT_SCAN_COMPANY_FILTERS} companies).
 * @param {import('axios').AxiosInstance} client
 * @param {Object} options
 * @param {string[]} options.companyIds
 * @param {string} options.quarterDate
 * @param {number} [options.offset=0]
 * @returns {Promise<{ announcements: Object[], meta: Object }>}
 */
async function postEarningsCallScan(client, { companyIds, quarterDate, offset = 0 }) {
  const ids = Array.isArray(companyIds) ? companyIds.filter(Boolean) : [];
  const qd = String(quarterDate || '').trim() || currentQuarterDate();

  let response;
  try {
    response = await client.post(
      STOCKSCANS_ANNOUNCEMENTS_SCAN_URL,
      {
        scan: {
          scanId: '',
          scanName: 'Default Scan',
          filters: [],
          index: [],
          industry: [],
          watchlistIds: [],
          announcementType: 'Earnings Call',
          searchFilters: [],
          alerts: false,
          searchMode: 'full',
          companyFilters: toCompanyFilters(ids),
        },
        offset: Math.max(0, offset),
        quarterDate: qd,
      },
      {
        headers: {
          Origin: 'https://www.stockscans.in',
          Referer: 'https://www.stockscans.in/announcement-scans',
        },
      }
    );
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const data = err.response.data;
      const message =
        (data && typeof data === 'object' && data.message) ||
        (typeof data === 'string' ? data : 'StockScans announcement scan failed');
      const out = new Error(message);
      out.code =
        status === 401 || status === 403 ? 'STOCKSCANS_AUTH_REQUIRED' : 'STOCKSCANS_HTTP_ERROR';
      out.status = status;
      out.details = data;
      throw out;
    }
    const out = new Error(err.message || 'StockScans scan request failed');
    out.code = 'STOCKSCANS_NETWORK';
    throw out;
  }

  const body = response.data || {};
  if (body.status === 'error') {
    const err = new Error(body.message || 'StockScans announcement scan failed');
    err.code = 'STOCKSCANS_API_ERROR';
    err.details = body;
    throw err;
  }

  const rows = Array.isArray(body.announcements) ? body.announcements : [];
  const announcements = rows.map(mapScanAnnouncement).filter(Boolean);

  return {
    announcements,
    meta: {
      quarterDate: body.quarterDate || qd,
      total: typeof body.total === 'number' ? body.total : announcements.length,
      start: body.start,
      end: body.end,
      companyIds: ids,
    },
  };
}

/**
 * Scan StockScans for earnings-call announcements for the given companies and quarter.
 * Batches requests when more than 10 `companyFilters` (StockScans API limit).
 * @param {Object} options
 * @param {string[]} options.companyIds - e.g. [`NSE:RELIANCE`]
 * @param {string} options.quarterDate - YYYYMM quarter key
 * @param {number} [options.offset=0]
 * @returns {Promise<{ announcements: Object[], meta: Object }>}
 */
async function scanEarningsCalls({ companyIds, quarterDate, offset = 0 }) {
  const ids = Array.isArray(companyIds) ? companyIds.filter(Boolean) : [];
  if (ids.length === 0) {
    const err = new Error('At least one companyId is required');
    err.code = 'COMPANY_IDS_REQUIRED';
    throw err;
  }

  const qd = String(quarterDate || '').trim() || currentQuarterDate();
  if (!/^\d{6}$/.test(qd)) {
    const err = new Error('quarterDate must be YYYYMM (e.g. 202603)');
    err.code = 'INVALID_QUARTER_DATE';
    throw err;
  }

  let client;
  try {
    const token = getAuthToken();
    client = createAuthenticatedClient(token);
  } catch (err) {
    const out = new Error(err.message || 'StockScans auth required');
    out.code = 'STOCKSCANS_AUTH_REQUIRED';
    throw out;
  }

  const chunks = chunkCompanyIds(ids);
  if (chunks.length === 1) {
    return postEarningsCallScan(client, {
      companyIds: chunks[0],
      quarterDate: qd,
      offset,
    });
  }

  /** @type {Object[]} */
  const announcements = [];
  let apiCalls = 0;

  for (const chunk of chunks) {
    const result = await postEarningsCallScan(client, {
      companyIds: chunk,
      quarterDate: qd,
      offset: 0,
    });
    announcements.push(...result.announcements);
    apiCalls += 1;
  }

  return {
    announcements,
    meta: {
      quarterDate: qd,
      total: announcements.length,
      companyIds: ids,
      batches: apiCalls,
      batchSize: MAX_ANNOUNCEMENT_SCAN_COMPANY_FILTERS,
    },
  };
}

/**
 * Resolve the latest earnings-call transcript per company, walking back quarters when missing.
 * @param {Object} options
 * @param {string[]} options.companyIds
 * @param {string} [options.quarterDate] - Starting quarter (defaults to current)
 * @param {number} [options.maxQuarterLookback=4] - Quarters to try per missing company
 * @returns {Promise<{ announcements: Object[], missing: string[], meta: Object }>}
 */
async function resolveLatestEarningsCalls({ companyIds, quarterDate, maxQuarterLookback = 4 }) {
  const ids = Array.isArray(companyIds) ? [...companyIds] : [];
  /** @type {Map<string, Object>} */
  const byCompany = new Map();
  let qd = String(quarterDate || '').trim() || currentQuarterDate();
  const startQuarter = qd;
  let lookbacks = 0;

  let pending = [...ids];
  while (pending.length > 0 && lookbacks <= maxQuarterLookback) {
    const { announcements, meta } = await scanEarningsCalls({
      companyIds: pending,
      quarterDate: qd,
    });

    for (const ann of announcements) {
      if (ann.companyId && !byCompany.has(ann.companyId) && ann.attchmntFile) {
        byCompany.set(ann.companyId, { ...ann, quarterDate: meta.quarterDate || qd });
      }
    }

    pending = pending.filter((id) => !byCompany.has(id));
    if (pending.length === 0) break;

    qd = previousQuarterDate(qd);
    lookbacks += 1;
  }

  return {
    announcements: ids.map((id) => byCompany.get(id)).filter(Boolean),
    missing: pending,
    meta: {
      startQuarter,
      quartersTried: lookbacks + 1,
      requested: ids.length,
      found: byCompany.size,
    },
  };
}

module.exports = {
  STOCKSCANS_ANNOUNCEMENTS_SCAN_URL,
  MAX_ANNOUNCEMENT_SCAN_COMPANY_FILTERS,
  currentQuarterDate,
  previousQuarterDate,
  parseCompanyIdInput,
  toCompanyFilters,
  chunkCompanyIds,
  mapScanAnnouncement,
  postEarningsCallScan,
  scanEarningsCalls,
  resolveLatestEarningsCalls,
};
