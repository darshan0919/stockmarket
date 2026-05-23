/**
 * @fileoverview StockScans saved scan URL → company ids via scans/run API
 * @module services/stockscansSavedScan
 * @see {@link docs/API_REFERENCE.md#download-latest-concall-transcripts-zip} for API docs
 */

const axios = require('axios');
const { getAuthToken, createAuthenticatedClient } = require('./stockscansAuth');

const STOCKSCANS_SCANS_RUN_URL = 'https://www.stockscans.in/api/company/scans/run';
const STOCKSCANS_SAVED_SCAN_PAGE = 'https://www.stockscans.in/scans/saved';

/** @typedef {Object} StockScansScanDefinition */

/**
 * Extract saved scan id from a StockScans URL or bare id string.
 * @param {string} raw - e.g. `https://www.stockscans.in/scans/saved/c29a98e...` or `c29a98e...`
 * @returns {string|null}
 */
function parseScanIdFromUrl(raw) {
  const t = (raw || '').trim();
  if (!t) return null;

  const urlMatch = t.match(/\/scans\/saved\/([a-f0-9]+)/i);
  if (urlMatch) return urlMatch[1];

  if (/^[a-f0-9]{8,64}$/i.test(t)) return t;

  return null;
}

/**
 * Escape a string for use inside a RegExp.
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalize Next.js RSC–escaped JSON fragment before `JSON.parse`.
 * @param {string} escapedInner - Scan object inner (without outer braces)
 * @returns {string}
 */
function normalizeEscapedScanJson(escapedInner) {
  return `{${escapedInner
    .replace(/\\"/g, '"')
    .replace(/\\u003e/g, '>')
    .replace(/\\u003c/g, '<')}}`;
}

/**
 * Extract embedded `scan` object from saved scan page HTML (Next.js RSC payload).
 * StockScans embeds the scan as doubly-escaped JSON (`\\"scanId\\":...`).
 * @param {string} html
 * @param {string} scanId
 * @returns {StockScansScanDefinition}
 */
function extractScanFromSavedPageHtml(html, scanId) {
  if (!html || typeof html !== 'string') {
    throw new Error('Saved scan page response was empty');
  }

  const id = escapeRegExp(scanId);

  /** @type {RegExpMatchArray|null} */
  let match = html.match(
    new RegExp(
      `\\\\"scan\\\\":\\{(\\\\"scanId\\\\":\\\\"${id}\\\\"[\\s\\S]*?\\\\"alertFrequency\\\\":null)\\}`,
      'i'
    )
  );

  if (!match) {
    match = html.match(
      new RegExp(`"scan":\\{("scanId":"${id}"[\\s\\S]*?"alertFrequency":null)\\}`, 'i')
    );
    if (match) {
      const scan = JSON.parse(`{${match[1]}}`);
      if (scan.scanId !== scanId) {
        throw new Error('Parsed scan definition did not match the requested scan id');
      }
      return scan;
    }

    const err = new Error(
      `Scan "${scanId}" not found on the saved scan page. Check the URL and that STOCKSCANS_AUTH_TOKEN matches your stockscans.in session.`
    );
    err.code = 'STOCKSCANS_SCAN_NOT_FOUND';
    throw err;
  }

  const scan = JSON.parse(normalizeEscapedScanJson(match[1]));

  if (!scan || scan.scanId !== scanId) {
    throw new Error('Parsed scan definition did not match the requested scan id');
  }

  return scan;
}

/**
 * Fetch saved scan filters/metadata by loading the StockScans saved scan page.
 * @param {string} scanId
 * @returns {Promise<StockScansScanDefinition>}
 */
async function fetchSavedScanDefinition(scanId) {
  let token;
  try {
    token = getAuthToken();
  } catch (err) {
    const out = new Error(err.message || 'StockScans auth required');
    out.code = 'STOCKSCANS_AUTH_REQUIRED';
    throw out;
  }

  let html;
  try {
    const response = await axios.get(`${STOCKSCANS_SAVED_SCAN_PAGE}/${scanId}`, {
      headers: {
        Cookie: `authtoken=${token}`,
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    html = response.data;
  } catch (err) {
    const out = new Error(err.message || 'Failed to load saved scan page');
    out.code = 'STOCKSCANS_NETWORK';
    throw out;
  }

  return extractScanFromSavedPageHtml(typeof html === 'string' ? html : String(html), scanId);
}

/**
 * Extract `companyId` values from a scans/run `table` matrix response.
 * @param {Array<Array<unknown>>|null|undefined} table
 * @returns {string[]}
 */
function companyIdsFromScanTable(table) {
  if (!Array.isArray(table) || table.length < 2) return [];
  const header = table[0];
  if (!Array.isArray(header)) return [];
  const companyIdx = header.indexOf('companyId');
  if (companyIdx < 0) return [];

  const seen = new Set();
  const out = [];
  for (let i = 1; i < table.length; i++) {
    const row = table[i];
    if (!Array.isArray(row)) continue;
    const id = row[companyIdx];
    if (typeof id === 'string' && id.includes(':') && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Run a StockScans scan and collect all `companyId` values (paginated).
 * @param {StockScansScanDefinition} scan
 * @param {Object} [options]
 * @param {string} [options.order='desc']
 * @param {string} [options.orderBy='Market Capitalization']
 * @returns {Promise<{ companyIds: string[], meta: Object }>}
 */
async function runScanAndCollectCompanyIds(scan, options = {}) {
  if (!scan?.scanId) {
    const err = new Error('scan definition with scanId is required');
    err.code = 'STOCKSCANS_INVALID_SCAN';
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

  const order = options.order || 'desc';
  const orderBy = options.orderBy || 'Market Capitalization';
  const scanId = scan.scanId;

  /** @type {string[]} */
  const companyIds = [];
  const seen = new Set();
  let offset = 0;
  let total = 0;
  let pages = 0;

  for (;;) {
    let response;
    try {
      response = await client.post(
        STOCKSCANS_SCANS_RUN_URL,
        {
          ratiosType: 'Ratios',
          timePeriod: 'Latest',
          scan,
          watchlistIds: [],
          order,
          orderBy,
          offset,
        },
        {
          headers: {
            Origin: 'https://www.stockscans.in',
            Referer: `${STOCKSCANS_SAVED_SCAN_PAGE}/${scanId}`,
          },
        }
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
        out.details = data;
        throw out;
      }
      const out = new Error(err.message || 'StockScans scan run failed');
      out.code = 'STOCKSCANS_NETWORK';
      throw out;
    }

    const body = response.data || {};
    if (body.status === 'error') {
      const err = new Error(body.message || 'StockScans scan run failed');
      err.code = 'STOCKSCANS_API_ERROR';
      err.details = body;
      throw err;
    }

    total = typeof body.total === 'number' ? body.total : total;
    const end = typeof body.end === 'number' ? body.end : 0;
    const batch = companyIdsFromScanTable(body.table);
    for (const id of batch) {
      if (!seen.has(id)) {
        seen.add(id);
        companyIds.push(id);
      }
    }
    pages += 1;

    if (end >= total || batch.length === 0) break;
    offset = end;
  }

  return {
    companyIds,
    meta: {
      scanId,
      scanName: scan.scanName || null,
      total,
      pages,
    },
  };
}

/**
 * Resolve company ids from a saved StockScans scan URL (or bare scan id).
 * @param {string} scanUrlOrId
 * @returns {Promise<{ companyIds: string[], scan: StockScansScanDefinition, meta: Object }>}
 */
async function fetchCompanyIdsFromSavedScanUrl(scanUrlOrId) {
  const scanId = parseScanIdFromUrl(scanUrlOrId);
  if (!scanId) {
    const err = new Error(
      'Invalid scan URL. Use a link like https://www.stockscans.in/scans/saved/{scanId}'
    );
    err.code = 'INVALID_SCAN_URL';
    throw err;
  }

  const scan = await fetchSavedScanDefinition(scanId);
  const { companyIds, meta: runMeta } = await runScanAndCollectCompanyIds(scan);

  if (companyIds.length === 0) {
    const err = new Error(`Scan "${scan.scanName || scanId}" returned no companies`);
    err.code = 'STOCKSCANS_SCAN_EMPTY';
    err.meta = { scanId, ...runMeta };
    throw err;
  }

  return {
    companyIds,
    scan,
    meta: { scanId, ...runMeta },
  };
}

module.exports = {
  STOCKSCANS_SCANS_RUN_URL,
  STOCKSCANS_SAVED_SCAN_PAGE,
  parseScanIdFromUrl,
  escapeRegExp,
  normalizeEscapedScanJson,
  extractScanFromSavedPageHtml,
  fetchSavedScanDefinition,
  companyIdsFromScanTable,
  runScanAndCollectCompanyIds,
  fetchCompanyIdsFromSavedScanUrl,
};
