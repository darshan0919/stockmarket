'use strict';

const { withRetry } = require('./concurrency.js');

// A REAL saved scan (id + name) must be echoed back in the request payload
// even when scanning ad-hoc by watchlist/companyFilters — confirmed live
// 2026-07-26: passing an arbitrary scanId (e.g. "x") silently breaks
// watchlist-based scans (returns {message, status} instead of results),
// while reusing an existing saved scan's id/name works. This is presumably
// because the endpoint resolves scan-level context (owner, permissions) from
// scanId server-side rather than trusting the inline `scan` object alone.
const DEFAULT_SCAN_ID = '59822b15a2859d183df3770d';
const DEFAULT_SCAN_NAME = 'Recordings';

// companyFilters accepts at most this many companyIds per call — confirmed
// live: an 11th unique id returns HTTP 400 "List should have at most 10
// items after validation, not <n>". Above this, use a temporary watchlist
// instead (no such cap there — tested live with 15 and 50 companies).
const COMPANY_FILTERS_MAX = 10;

// announcements/scan paginates 30/call (response includes start/end/total).
const PAGE_SIZE = 30;

// Default cap on pages fetched per scan. **Do not use the response's `total`
// field to decide when to stop** — confirmed live 2026-07-26 it is NOT a
// real total: across 5 consecutive pages for the same 15-company/one-quarter
// query it read 31, 61, 91, 121, 151 (i.e. always ~= offset + page size + 1,
// self-inflating every page). Results ARE genuinely sorted newest-first
// (verified: page dates monotonically decrease across pages), so a bounded
// page cap plus early-exit-once-every-company-has-a-match is both cheaper
// and more correct than trusting `total` — the underlying match set for a
// loose keyword/type filter across many companies can genuinely run into
// the hundreds (many unrelated filings loosely match "recording"/"transcript"
// keywords over a company's history), most of which we don't need once the
// newest match per company is found.
const DEFAULT_MAX_PAGES = 5;

/**
 * `announcements/scan`'s `quarterDate` filters on the ACTUAL RELEASE/FILING
 * date of the announcement — NOT the reporting period the document is
 * about. Confirmed by Darshan (2026-07-26) and cross-checked against
 * `stock-api/src/fetchers/announcementScanner.js`'s pre-existing
 * `lastNQuarterDates()`, which already treated `quarterDate` as a literal
 * calendar-quarter-end bucket (Mar/Jun/Sep/Dec) independent of any specific
 * company's fiscal period — same conclusion, arrived at independently
 * elsewhere in this codebase before this module existed.
 *
 * Given that, the right `quarterDate` to search for a document ABOUT period
 * `periodEndYyyymm` is: whichever calendar quarter its filing is expected to
 * land in. SEBI mandates quarterly results within 45 days of period end —
 * well inside the immediately following calendar quarter — so the release
 * date for a period ending in a given quarter-end month almost always falls
 * in the NEXT calendar quarter. Live-tested 2026-07-26 (ASALCBR): a
 * transcript for the quarter ending March 2026 (`202603`), filed 2026-05-23,
 * was found under `quarterDate: "202606"` — exactly "next calendar quarter,"
 * not the period's own end-month.
 *
 * This applies uniformly whether the target period is the current results
 * season or a historical one — there is no separate "current quarter"
 * exception. (An earlier version of this codebase passed the period's own
 * `yyyymm` unmodified for current-quarter Tier-4 searches, which is wrong
 * for the same reason and was corrected once this was understood — a
 * same-company "hit" during testing turned out to be a stale prior-quarter
 * recording that coincidentally shared the scan window, not the target
 * quarter's actual recording.)
 *
 * @param {string} periodEndYyyymm - e.g. "202603" for a Jan-Mar period
 * @returns {string} the calendar-quarter-end `quarterDate` to search
 */
function computeReleaseQuarterDate(periodEndYyyymm) {
  const year = parseInt(periodEndYyyymm.slice(0, 4), 10);
  const month = parseInt(periodEndYyyymm.slice(4, 6), 10); // 1-12
  const total = year * 12 + (month - 1) + 3; // next calendar quarter
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return `${newYear}${String(newMonth).padStart(2, '0')}`;
}

/**
 * Smart payload builder for `announcements/scan` — bakes in the one thing
 * every caller must get right and would otherwise have to remember: a REAL
 * saved scanId/scanName must be echoed back even for an ad-hoc
 * watchlist/companyFilters query (see DEFAULT_SCAN_ID comment above an
 * arbitrary scanId silently breaks watchlist-based scans). Callers supply
 * only the parts that actually vary per call.
 *
 * @param {Object} opts
 * @param {string[]} [opts.searchFilters=[]]
 * @param {string} [opts.announcementType='All']
 * @param {{companyId: string}[]} [opts.companyFilters=[]] - mutually exclusive with watchlistIds
 * @param {string[]} [opts.watchlistIds=[]] - mutually exclusive with companyFilters
 * @param {Array} [opts.filters=[]] - scan-level filters (e.g. market cap), rarely needed here
 * @returns {Object} the `scan` object to pass as `{scan: ..., offset, quarterDate}`
 */
function buildAnnouncementScanBody({
  searchFilters = [],
  announcementType = 'All',
  companyFilters = [],
  watchlistIds = [],
  filters = [],
} = {}) {
  return {
    scanId: DEFAULT_SCAN_ID,
    scanName: DEFAULT_SCAN_NAME,
    filters,
    industry: [],
    index: [],
    searchFilters,
    announcementType,
    alerts: false,
    searchMode: 'full',
    companyIds: [],
    companyFilters,
    watchlistIds,
  };
}

/**
 * Fetch pages of an announcements/scan query, stopping early once every
 * companyId in `stopWhenFoundFor` has at least one match, or once
 * `maxPages` is reached, or once a short page is returned (fewer than
 * PAGE_SIZE — genuinely the last page). Never relies on the response's
 * `total` field (see DEFAULT_MAX_PAGES comment — it's not trustworthy).
 *
 * @param {import('../clients/StockscansClient.js').StockscansClient} client
 * @param {Object} scanBody - the `scan` object (searchFilters, announcementType, companyFilters|watchlistIds, etc.)
 * @param {string} quarterDate
 * @param {Object} [opts]
 * @param {Set<string>} [opts.stopWhenFoundFor] - companyIds to early-exit on once each has >=1 match
 * @param {number} [opts.maxPages=DEFAULT_MAX_PAGES]
 * @returns {Promise<Array>} flattened announcements across all pages fetched (NOT necessarily all matches — see cap/early-exit above)
 */
async function scanAllPages(client, scanBody, quarterDate, { stopWhenFoundFor, maxPages = DEFAULT_MAX_PAGES } = {}) {
  const out = [];
  const seen = new Set();
  let offset = 0;
  for (let page = 0; page < maxPages; page++) {
    const res = await withRetry(() =>
      client.scanAnnouncements(
        { scan: scanBody, offset, quarterDate },
        { referer: `${client.baseUrl}/announcement-scans` }
      )
    );
    const anns = res.announcements || [];
    out.push(...anns);
    for (const a of anns) seen.add(a.companyId);
    offset += anns.length;
    if (anns.length < PAGE_SIZE) break; // short page = genuinely the last page
    if (stopWhenFoundFor && [...stopWhenFoundFor].every((id) => seen.has(id))) break;
  }
  return out;
}

/**
 * Bulk announcements/scan across an arbitrary number of companies, hiding
 * the 10-companyId `companyFilters` cap from callers.
 *
 * - `companyIds.length <= 10`: scans directly via `companyFilters`, no
 *   watchlist needed (cheapest path, matches how a single/small batch would
 *   be queried by hand).
 * - `companyIds.length > 10`: creates a throwaway watchlist containing all
 *   of them, scans via `watchlistIds`, then deletes the watchlist in a
 *   `finally` block. This replaces what would otherwise be `ceil(N/10)`
 *   chunked calls with exactly 3 calls (create + scan-pages + delete)
 *   regardless of N (scan-pages itself may be >1 if the filtered result set
 *   is large, but a narrow `searchFilters`/`announcementType` keeps that
 *   small in practice).
 *
 * Never throws — on any failure (create/scan/delete), calls `onWarning`
 * with a human-readable message and returns whatever was collected so far
 * (possibly empty). Callers should treat an empty/partial result as
 * "unconfirmed", not "confirmed absent", and surface the warning to the
 * user rather than silently trusting a negative.
 *
 * @param {Object} opts
 * @param {import('../clients/StockscansClient.js').StockscansClient} opts.client
 * @param {string[]} opts.companyIds
 * @param {string} opts.quarterDate - 'yyyymm', semantics of the *scan*, not necessarily the reporting period end (see get-latest-concall-transcript.js historical-quarter notes)
 * @param {string[]} [opts.searchFilters=[]]
 * @param {string} [opts.announcementType='All']
 * @param {(message: string) => void} [opts.onWarning] - called instead of throwing
 * @param {number} [opts.maxPages] - passed through to scanAllPages (see DEFAULT_MAX_PAGES)
 * @returns {Promise<Array>} flattened announcements (each has `companyId`) — early-exits once every company has a match, so this is "enough to resolve everyone", not "every matching announcement ever filed"
 */
async function scanAnnouncementsForCompanies({
  client,
  companyIds,
  quarterDate,
  searchFilters = [],
  announcementType = 'All',
  onWarning = () => {},
  maxPages,
}) {
  if (!companyIds.length) return [];
  const stopWhenFoundFor = new Set(companyIds);
  const pageOpts = { stopWhenFoundFor, ...(maxPages ? { maxPages } : {}) };

  if (companyIds.length <= COMPANY_FILTERS_MAX) {
    try {
      return await scanAllPages(
        client,
        buildAnnouncementScanBody({
          searchFilters,
          announcementType,
          companyFilters: companyIds.map((companyId) => ({ companyId })),
        }),
        quarterDate,
        pageOpts
      );
    } catch (err) {
      onWarning(
        `announcements/scan (direct, ${companyIds.length} companies) failed: ${err.message}. ` +
          `Treating as unconfirmed for: ${companyIds.join(', ')}.`
      );
      return [];
    }
  }

  // >10 companies: batch via a temporary watchlist instead of chunking into
  // ceil(N/10) calls. Always attempt cleanup even if the scan itself failed,
  // so a transient scan error doesn't leave an orphaned watchlist behind.
  let watchlistId = null;
  try {
    const tempName = `__bulk_concall_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const created = await withRetry(() => client.createWatchlist(tempName, companyIds));
    watchlistId = created.watchlistId;
    if (!watchlistId) {
      onWarning(`createWatchlist for ${companyIds.length} companies returned no watchlistId — treating as unconfirmed.`);
      return [];
    }
    return await scanAllPages(
      client,
      buildAnnouncementScanBody({ searchFilters, announcementType, watchlistIds: [watchlistId] }),
      quarterDate,
      pageOpts
    );
  } catch (err) {
    onWarning(
      `Watchlist-based announcements/scan failed for ${companyIds.length} companies: ${err.message}. ` +
        `Treating as unconfirmed for: ${companyIds.join(', ')}.`
    );
    return [];
  } finally {
    if (watchlistId) {
      try {
        await withRetry(() => client.deleteWatchlist(watchlistId));
      } catch (err) {
        onWarning(
          `Failed to delete temporary watchlist ${watchlistId} — please delete it manually from stockscans.in/watchlists. Error: ${err.message}`
        );
      }
    }
  }
}

module.exports = {
  scanAnnouncementsForCompanies,
  scanAllPages,
  computeReleaseQuarterDate,
  buildAnnouncementScanBody,
  COMPANY_FILTERS_MAX,
  DEFAULT_SCAN_ID,
  DEFAULT_SCAN_NAME,
};
