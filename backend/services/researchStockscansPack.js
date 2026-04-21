/**
 * Multi-category StockScans announcement fetch + PDF save into research workspace folders.
 * Mirrors `frontend/lib/announcementBulkDownload.js` (standard pack + credit rating).
 * @module services/researchStockscansPack
 */

const path = require('path');
const { searchCompanyAnnouncements } = require('./stockscansAnnouncements');
const { fetchAnnouncementPdfBuffers } = require('./announcementPdfFetch');
const { ensureLayout, writePdfBufferUnique } = require('../utils/researchWorkspace');

/** @typedef {'m3'|'m6'|'y1'|'y3'|'y5'|'all'} TimeSpanPreset */

const TIME_SPANS = new Set(['m3', 'm6', 'y1', 'y3', 'y5', 'all']);

/**
 * Search queries aligned with institutional folders (order matters for URL dedupe).
 */
const CATEGORY_PACK = [
  { folder: 'Annual_Reports', search: 'annual report' },
  { folder: 'Concalls', search: 'transcript' },
  { folder: 'Investor_Presentations', search: 'investor presentation' },
  { folder: 'Credit_Rating_Reports', search: 'credit rating' },
  { folder: 'Events_Announcements', search: 'Award_of_Order_Receipt_of_Order' },
];

/**
 * @param {string} timeSpan
 * @returns {Date|null}
 */
function minDateForTimeSpan(timeSpan) {
  if (timeSpan === 'all') return null;
  const d = new Date();
  if (timeSpan === 'm3') {
    d.setMonth(d.getMonth() - 3);
    return d;
  }
  if (timeSpan === 'm6') {
    d.setMonth(d.getMonth() - 6);
    return d;
  }
  if (timeSpan === 'y1') {
    d.setFullYear(d.getFullYear() - 1);
    return d;
  }
  if (timeSpan === 'y3') {
    d.setFullYear(d.getFullYear() - 3);
    return d;
  }
  if (timeSpan === 'y5') {
    d.setFullYear(d.getFullYear() - 5);
    return d;
  }
  return null;
}

/**
 * @param {string} an_dt
 * @returns {Date|null}
 */
function parseAnnouncementDate(an_dt) {
  if (!an_dt || typeof an_dt !== 'string') return null;
  const parts = an_dt.trim().split(/\s+/);
  const dateParts = parts[0].split('-');
  const months = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };
  if (dateParts.length !== 3 || months[dateParts[1]] === undefined) {
    const d = new Date(an_dt);
    return isNaN(d.getTime()) ? null : d;
  }
  const day = parseInt(dateParts[0], 10);
  const year = parseInt(dateParts[2], 10);
  const hourMin = parts[1] ? parts[1].split(':') : ['0', '0', '0'];
  const h = parseInt(hourMin[0], 10) || 0;
  const m = parseInt(hourMin[1], 10) || 0;
  const s = parseInt(hourMin[2], 10) || 0;
  return new Date(year, months[dateParts[1]], day, h, m, s);
}

/**
 * @param {Array<Object>} items
 * @param {Date|null} minDate
 * @returns {Array<Object>}
 */
function filterOnOrAfterDate(items, minDate) {
  if (!minDate || isNaN(minDate.getTime())) return items;
  return items.filter((ann) => {
    const d = parseAnnouncementDate(ann.an_dt);
    if (!d) return true;
    return d >= minDate;
  });
}

/**
 * @param {Array<Object>} items
 * @returns {Array<Object>}
 */
function sortByDateDesc(items) {
  return [...items].sort((a, b) => {
    const da = parseAnnouncementDate(a.an_dt)?.getTime() ?? 0;
    const db = parseAnnouncementDate(b.an_dt)?.getTime() ?? 0;
    return db - da;
  });
}

/**
 * @param {string} companyId
 * @param {string} searchQuery
 * @returns {Promise<Object[]>}
 */
async function fetchAllPagesStockScans(companyId, searchQuery) {
  const out = [];
  let offset = 0;

  for (;;) {
    const { data, meta } = await searchCompanyAnnouncements({
      companyId,
      search: searchQuery,
      offset,
    });
    const batch = Array.isArray(data) ? data : [];
    const limit = typeof meta.limit === 'number' ? meta.limit : 30;

    out.push(...batch);

    if (batch.length === 0 || batch.length < limit) break;
    offset += batch.length;
  }

  return out;
}

/**
 * @param {Object} options
 * @param {string} options.symbol - Uppercase NSE symbol
 * @param {string} options.timeSpan
 * @returns {Promise<Object>}
 */
async function runStockscansPack({ symbol, timeSpan }) {
  const span = String(timeSpan || '')
    .trim()
    .toLowerCase();
  if (!TIME_SPANS.has(span)) {
    const err = new Error(
      `Invalid timeSpan "${timeSpan}". Use one of: ${[...TIME_SPANS].join(', ')}`
    );
    err.code = 'INVALID_TIME_SPAN';
    throw err;
  }

  const { workspace } = ensureLayout(symbol);
  const companyId = `NSE:${symbol}`;
  const minDate = minDateForTimeSpan(span);

  /** @type {Map<string, { folder: string, ann: Object }>} */
  const urlToAssignment = new Map();

  for (const { folder, search } of CATEGORY_PACK) {
    const raw = await fetchAllPagesStockScans(companyId, search);
    const sorted = sortByDateDesc(raw);
    const filtered = filterOnOrAfterDate(sorted, minDate);
    for (const ann of filtered) {
      const u = ann.attchmntFile;
      if (!u || typeof u !== 'string') continue;
      if (!urlToAssignment.has(u)) {
        urlToAssignment.set(u, { folder, ann });
      }
    }
  }

  const jobs = [];
  for (const [, { folder, ann }] of urlToAssignment) {
    jobs.push({
      folder,
      pdf: {
        url: ann.attchmntFile,
        subject: ann.subject || ann.desc || 'announcement',
        date: ann.an_dt || '',
      },
    });
  }

  if (jobs.length === 0) {
    return {
      workspace,
      timeSpan: span,
      totalQueued: 0,
      savedCount: 0,
      failedCount: 0,
      savedByFolder: {
        Annual_Reports: [],
        Concalls: [],
        Investor_Presentations: [],
        Credit_Rating_Reports: [],
        Events_Announcements: [],
      },
      failed: [],
    };
  }

  const pdfs = jobs.map((j) => j.pdf);
  const fetched = await fetchAnnouncementPdfBuffers(pdfs);

  /** @type {Record<string, string[]>} */
  const savedByFolder = {
    Annual_Reports: [],
    Concalls: [],
    Investor_Presentations: [],
    Credit_Rating_Reports: [],
    Events_Announcements: [],
  };
  const failed = [];
  let savedCount = 0;

  for (let i = 0; i < fetched.length; i += 1) {
    const r = fetched[i];
    const folder = jobs[i].folder;
    const dir = path.join(workspace, folder);
    if (r.ok) {
      const written = writePdfBufferUnique(dir, r.filename, r.buffer);
      savedByFolder[folder].push(written);
      savedCount += 1;
    } else {
      failed.push({ url: r.url, folder, error: r.error });
    }
  }

  return {
    workspace,
    timeSpan: span,
    totalQueued: jobs.length,
    savedCount,
    failedCount: failed.length,
    savedByFolder,
    failed,
  };
}

module.exports = {
  runStockscansPack,
  CATEGORY_PACK,
  TIME_SPANS,
};
