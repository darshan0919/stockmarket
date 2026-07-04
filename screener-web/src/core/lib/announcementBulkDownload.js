/**
 * Helpers for bulk announcement ZIP downloads using StockScans search queries or NSE client-side filtering.
 * @module lib/announcementBulkDownload
 * @see {@link docs/API_REFERENCE.md#announcements-apis}
 */

/** StockScans / UI search strings for announcement categories */
export const ANNOUNCEMENT_SEARCH = {
  ANNUAL_REPORT: 'annual report',
  TRANSCRIPT: 'transcript',
  INVESTOR_PRESENTATION: 'investor presentation',
  ORDERS: 'Award_of_Order_Receipt_of_Order',
};

/**
 * Unified rolling window for bulk downloads (months or years from today).
 * @typedef {'m3'|'m6'|'y1'|'y3'|'y5'|'all'} TimeSpanPreset
 */

/**
 * Minimum `an_dt` for a time-span preset, or `null` for all history.
 * @param {TimeSpanPreset} timeSpan
 * @returns {Date|null}
 */
export function minDateForTimeSpan(timeSpan) {
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
 * Parse NSE-style announcement datetime (`DD-Mon-YYYY HH:mm:ss`) to a Date (local).
 * @param {string} an_dt
 * @returns {Date|null}
 */
export function parseAnnouncementDate(an_dt) {
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
 * Whether an announcement row matches a StockScans search query (for NSE fallback where search is ignored server-side).
 * @param {Object} ann
 * @param {string} searchQuery
 * @returns {boolean}
 */
export function announcementMatchesQuery(ann, searchQuery) {
  const text = `${ann.subject || ''} ${ann.desc || ''}`.toLowerCase().replace(/_/g, ' ');
  const q = searchQuery.trim().toLowerCase().replace(/_/g, ' ');
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  if (q.includes('award') && q.includes('order') && q.includes('receipt')) {
    return (
      (text.includes('award') && text.includes('order')) ||
      (text.includes('receipt') && text.includes('order'))
    );
  }
  return tokens.every((t) => text.includes(t));
}

/**
 * Dedupe announcements by attachment URL (keeps first occurrence).
 * @param {Array<Object>} items
 * @returns {Array<Object>}
 */
export function dedupeByAttachmentUrl(items) {
  const seen = new Set();
  return items.filter((ann) => {
    const u = ann.attchmntFile;
    if (!u || seen.has(u)) return false;
    seen.add(u);
    return true;
  });
}

/**
 * Sort newest first by `an_dt`.
 * @param {Array<Object>} items
 * @returns {Array<Object>}
 */
export function sortByDateDesc(items) {
  return [...items].sort((a, b) => {
    const da = parseAnnouncementDate(a.an_dt)?.getTime() ?? 0;
    const db = parseAnnouncementDate(b.an_dt)?.getTime() ?? 0;
    return db - da;
  });
}

/**
 * Keep items with `an_dt` on or after `minDate`.
 * @param {Array<Object>} items
 * @param {Date} minDate
 * @returns {Array<Object>}
 */
export function filterOnOrAfterDate(items, minDate) {
  if (!minDate || isNaN(minDate.getTime())) return items;
  return items.filter((ann) => {
    const d = parseAnnouncementDate(ann.an_dt);
    if (!d) return true;
    return d >= minDate;
  });
}

/**
 * First `count` items that have an attachment URL.
 * @param {Array<Object>} items
 * @param {number} count
 * @returns {Array<Object>}
 */
export function takeWithAttachments(items, count) {
  const out = [];
  for (const ann of items) {
    if (!ann.attchmntFile) continue;
    out.push(ann);
    if (out.length >= count) break;
  }
  return out;
}

/**
 * Apply time window and keep rows with PDFs.
 * @param {Array<Object>} sortedNewestFirst
 * @param {TimeSpanPreset} timeSpan
 * @returns {Array<Object>}
 */
function filterCategoryByTimeSpan(sortedNewestFirst, timeSpan) {
  const minDate = minDateForTimeSpan(timeSpan);
  let rows = sortedNewestFirst;
  if (minDate) rows = filterOnOrAfterDate(rows, minDate);
  return dedupeByAttachmentUrl(rows.filter((ann) => ann.attchmntFile));
}

/**
 * Fetch all pages for a StockScans search query.
 * @param {string} symbol
 * @param {string} searchQuery
 * @param {{ getBySymbol: Function }} announcementsAPI
 * @returns {Promise<Object[]>}
 */
async function fetchAllPagesStockScans(symbol, searchQuery, announcementsAPI, provider) {
  const out = [];
  let offset = 0;

  for (;;) {
    const response = await announcementsAPI.getBySymbol(symbol, {
      search: searchQuery,
      offset,
      provider,
    });
    if (!response.data?.success) {
      throw new Error(response.data?.error || 'Failed to fetch announcements');
    }
    const batch = Array.isArray(response.data.data) ? response.data.data : [];
    const meta = response.data.meta || {};
    const limit = typeof meta.limit === 'number' ? meta.limit : 30;

    out.push(...batch);

    if (batch.length === 0 || batch.length < limit) break;
    // StockScans may echo meta.offset as 0 every page; `0 ?? prev` would wrongly reset. Advance by this page size.
    offset += batch.length;
  }

  return out;
}

/**
 * Collect announcements for one search query. Uses StockScans pagination when `listProvider === 'stockscans'`;
 * otherwise filters a one-shot NSE list.
 * @param {string} symbol
 * @param {string} searchQuery
 * @param {'stockscans'|'nse'|null} listProvider
 * @param {{ getBySymbol: Function }} announcementsAPI
 * @param {Object[]|null} [nseRows] - When `listProvider === 'nse'`, reuse these rows instead of refetching
 * @returns {Promise<Object[]>}
 */
export async function fetchAnnouncementsForSearchQuery(
  symbol,
  searchQuery,
  listProvider,
  announcementsAPI,
  nseRows = null
) {
  if (listProvider === 'nse') {
    let rows = nseRows;
    if (!rows) {
      const response = await announcementsAPI.getBySymbol(symbol, { provider: 'nse' });
      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Failed to fetch announcements');
      }
      rows = Array.isArray(response.data.data) ? response.data.data : [];
    }
    return rows.filter((ann) => announcementMatchesQuery(ann, searchQuery));
  }

  if (listProvider === 'stockscans') {
    return fetchAllPagesStockScans(symbol, searchQuery, announcementsAPI, 'stockscans');
  }

  throw new Error('Announcements provider is unknown; reload the tab.');
}

/**
 * Standard pack: all four categories, each limited by the same time window.
 * @param {string} symbol
 * @param {'stockscans'|'nse'|null} listProvider
 * @param {{ getBySymbol: Function }} announcementsAPI
 * @param {TimeSpanPreset} timeSpan
 * @returns {Promise<Object[]>}
 */
export async function buildStandardPack(symbol, listProvider, announcementsAPI, timeSpan) {
  let nseRows = null;
  if (listProvider === 'nse') {
    const response = await announcementsAPI.getBySymbol(symbol, { provider: 'nse' });
    if (!response.data?.success) throw new Error(response.data?.error || 'Failed to fetch');
    nseRows = Array.isArray(response.data.data) ? response.data.data : [];
  }

  const run = (q) =>
    fetchAnnouncementsForSearchQuery(symbol, q, listProvider, announcementsAPI, nseRows);

  const [annualRaw, transcriptRaw, invRaw, ordersRaw] = await Promise.all([
    run(ANNOUNCEMENT_SEARCH.ANNUAL_REPORT),
    run(ANNOUNCEMENT_SEARCH.TRANSCRIPT),
    run(ANNOUNCEMENT_SEARCH.INVESTOR_PRESENTATION),
    run(ANNOUNCEMENT_SEARCH.ORDERS),
  ]);

  const annual = filterCategoryByTimeSpan(sortByDateDesc(annualRaw), timeSpan);
  const transcripts = filterCategoryByTimeSpan(sortByDateDesc(transcriptRaw), timeSpan);
  const presentations = filterCategoryByTimeSpan(sortByDateDesc(invRaw), timeSpan);
  const orders = filterCategoryByTimeSpan(sortByDateDesc(ordersRaw), timeSpan);

  return dedupeByAttachmentUrl([...annual, ...transcripts, ...presentations, ...orders]);
}

/**
 * Single document category (annual, transcript, or investor presentation) with a time span.
 * @param {string} symbol
 * @param {'stockscans'|'nse'|null} listProvider
 * @param {{ getBySymbol: Function }} announcementsAPI
 * @param {string} searchQuery - One of {@link ANNOUNCEMENT_SEARCH} (not orders)
 * @param {TimeSpanPreset} timeSpan
 * @returns {Promise<Object[]>}
 */
export async function buildCategoryYearPack(
  symbol,
  listProvider,
  announcementsAPI,
  searchQuery,
  timeSpan
) {
  const raw = await fetchAnnouncementsForSearchQuery(
    symbol,
    searchQuery,
    listProvider,
    announcementsAPI,
    null
  );
  return filterCategoryByTimeSpan(sortByDateDesc(raw), timeSpan);
}

/**
 * Order-book announcements within the selected time span.
 * @param {string} symbol
 * @param {'stockscans'|'nse'|null} listProvider
 * @param {{ getBySymbol: Function }} announcementsAPI
 * @param {TimeSpanPreset} timeSpan
 * @returns {Promise<Object[]>}
 */
export async function buildOrderBookPack(symbol, listProvider, announcementsAPI, timeSpan) {
  const rows = sortByDateDesc(
    await fetchAnnouncementsForSearchQuery(
      symbol,
      ANNOUNCEMENT_SEARCH.ORDERS,
      listProvider,
      announcementsAPI,
      null
    )
  );
  return filterCategoryByTimeSpan(rows, timeSpan);
}
