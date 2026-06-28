/**
 * StockScans Screener service — fetch saved scans list and run a scan collecting
 * all rows with column metadata.
 *
 * Builds on the auth + client from stockscansAuth.js and mirrors the pagination
 * loop already in stockscansSavedScan.js. This service returns the full table
 * (columns + typed row values) rather than just companyIds, so the controller
 * can merge it with live NSE quotes.
 *
 * @module services/stockscansScreener
 */

const { getAuthToken } = require('./stockscansAuth');
const { stockscans } = require('@stock/api');

/**
 * @typedef {Object} SavedScan
 * @property {string} scanId
 * @property {string} scanName
 * @property {string|null} scanDescription
 * @property {Object} scan - Full scan definition to pass to scans/run
 */

/**
 * @typedef {Object} ScanColumn
 * @property {string} key - Raw column name from the scans/run table header
 * @property {string} label - Display label
 * @property {'number'|'string'} type
 */

/**
 * @typedef {Object} ScanRow
 * @property {string} companyId - e.g. "NSE:RELIANCE"
 * @property {string} symbol - "RELIANCE"
 * @property {string} exchange - "NSE" or "BSE"
 * @property {Record<string, number|string|null>} metrics - keyed by column key
 */

// Raw HTTP + auth now live in @stock/api StockscansClient; this service keeps its
// table parsing, pagination, and upstream-error classification.
const ensureAuth = () => {
  try {
    getAuthToken();
  } catch (err) {
    const out = new Error(err.message || 'StockScans auth required');
    out.code = 'STOCKSCANS_AUTH_REQUIRED';
    throw out;
  }
};

/**
 * Fetch the user's saved scans list.
 * @returns {Promise<SavedScan[]>}
 */
const fetchSavedScans = async () => {
  ensureAuth();
  let raw;
  try {
    raw = await stockscans.savedScans();
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const out = new Error('Failed to fetch saved scans');
      out.code = status === 401 || status === 403 ? 'STOCKSCANS_AUTH_REQUIRED' : 'STOCKSCANS_HTTP_ERROR';
      out.status = status;
      throw out;
    }
    const out = new Error(err.message || 'Network error fetching saved scans');
    out.code = 'STOCKSCANS_NETWORK';
    throw out;
  }

  // API may return { scans: [...] } or a bare array
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.scans) ? raw.scans : []);

  return list.map((item) => ({
    scanId: item.scanId || item._id || item.id,
    scanName: item.scanName || item.name || 'Unnamed Scan',
    scanDescription: item.scanDescription || item.description || null,
    scan: item, // full object passed directly to scans/run
  }));
};

/**
 * Convert a header name to a display label.
 * @param {string} key
 * @returns {string}
 */
const headerToLabel = (key) => {
  const overrides = {
    companyId: 'Company',
    'Market Capitalization': 'Mkt Cap (Cr)',
    'P/E': 'P/E',
    'P/B': 'P/B',
    'ROE (%)': 'ROE %',
    'ROCE (%)': 'ROCE %',
  };
  return overrides[key] || key;
};

/**
 * Parse a scans/run response body into column definitions and typed rows.
 * @param {Object} body - response.data from scans/run
 * @returns {{ columns: ScanColumn[], rows: ScanRow[] }}
 */
const parseTableBody = (body) => {
  const table = body?.table;
  if (!Array.isArray(table) || table.length < 2) return { columns: [], rows: [] };

  const header = table[0];
  if (!Array.isArray(header)) return { columns: [], rows: [] };

  const companyIdx = header.indexOf('companyId');

  const columns = header
    .filter((h) => h !== 'companyId')
    .map((h) => ({
      key: h,
      label: headerToLabel(h),
      type: typeof table[1]?.[header.indexOf(h)] === 'number' ? 'number' : 'string',
    }));

  const rows = [];
  const seen = new Set();

  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    if (!Array.isArray(cells)) continue;
    const companyId = companyIdx >= 0 ? cells[companyIdx] : null;
    if (!companyId || seen.has(companyId)) continue;
    seen.add(companyId);

    const [exchange, symbol] = typeof companyId === 'string' && companyId.includes(':')
      ? companyId.split(':')
      : ['NSE', companyId];

    const metrics = {};
    for (const col of header) {
      if (col === 'companyId') continue;
      const idx = header.indexOf(col);
      const val = cells[idx];
      metrics[col] = val === undefined ? null : val;
    }

    rows.push({ companyId, symbol, exchange, metrics });
  }

  return { columns, rows };
};

/**
 * Run a saved scan and collect ALL rows (fully paginated).
 * @param {Object} scan - Full scan definition (the `scan` field from saved scans)
 * @returns {Promise<{ columns: ScanColumn[], rows: ScanRow[], total: number, scanName: string }>}
 */
const runScan = async (scan) => {
  if (!scan?.scanId) {
    const err = new Error('scan definition with scanId is required');
    err.code = 'STOCKSCANS_INVALID_SCAN';
    throw err;
  }

  ensureAuth();
  const scanId = scan.scanId;
  const scanName = scan.scanName || scanId;

  /** @type {ScanColumn[]} */
  let columns = [];
  /** @type {ScanRow[]} */
  const allRows = [];
  const seen = new Set();
  let offset = 0;
  let total = 0;

  for (;;) {
    let data;
    try {
      data = await stockscans.runScan(
        {
          ratiosType: 'Ratios',
          timePeriod: 'Latest',
          scan,
          watchlistIds: [],
          order: 'desc',
          orderBy: 'Market Capitalization',
          offset,
        },
        scanId
      );
    } catch (err) {
      if (err.response) {
        const data = err.response.data;
        const message =
          (data && typeof data === 'object' && data.message) ||
          (typeof data === 'string' ? data : 'StockScans scan run failed');
        const out = new Error(message);
        out.code =
          err.response.status === 401 || err.response.status === 403
            ? 'STOCKSCANS_AUTH_REQUIRED'
            : 'STOCKSCANS_HTTP_ERROR';
        out.status = err.response.status;
        throw out;
      }
      const out = new Error(err.message || 'StockScans scan run failed');
      out.code = 'STOCKSCANS_NETWORK';
      throw out;
    }

    const body = data || {};
    if (body.status === 'error') {
      const err = new Error(body.message || 'StockScans scan run failed');
      err.code = 'STOCKSCANS_API_ERROR';
      throw err;
    }

    total = typeof body.total === 'number' ? body.total : total;
    const end = typeof body.end === 'number' ? body.end : 0;

    const { columns: pageCols, rows: pageRows } = parseTableBody(body);
    if (columns.length === 0 && pageCols.length > 0) columns = pageCols;
    for (const row of pageRows) {
      if (!seen.has(row.companyId)) {
        seen.add(row.companyId);
        allRows.push(row);
      }
    }

    if (end >= total || pageRows.length === 0) break;
    offset = end;
  }

  return { columns, rows: allRows, total: allRows.length, scanName };
};

module.exports = {
  fetchSavedScans,
  runScan,
  parseTableBody,
  headerToLabel,
};
