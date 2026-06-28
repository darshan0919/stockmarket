/**
 * @fileoverview BSE India API wrapper.
 *
 * Price-action methods (security position / delivery, scrip-code lookup, smart
 * search, live quote header) delegate to the centralized `@stock/api` BseClient.
 * Fundamental BSE endpoints (earnings-call transcript announcements, results
 * calendar, company header) remain here for now, but run over the SAME shared
 * transport (`bseHttp`) — no duplicated fetch/header logic. They are candidates to
 * move onto Stockscans in a later pass.
 *
 * Export surface is unchanged so existing consumers don't change.
 * @see {@link docs/backend/api/bseIndiaApi.md}
 */

const { bse, parseBseSmartSearchHtml, bseHttp } = require('@stock/api');

const { bseGetJson, BSE_REQUEST_TIMEOUT_MS } = bseHttp;

// ── Price-action → delegate to the centralized client ─────────────────────────

/** @param {string} symbol @returns {Promise<string|null>} */
const getStockScripCode = (symbol) => bse.getScripCode(symbol);

/** @param {string} scripCode */
const getSecurityPosition = (scripCode) => bse.getSecurityPosition(scripCode);

/** @param {string} scripCode */
const getBseQuoteHeader = (scripCode) => bse.getQuoteHeader(scripCode);

/** @param {string} query */
const bseSmartSearch = (query) => bse.smartSearch(query);

// ── Fundamental BSE endpoints (kept local, shared transport) ──────────────────

/**
 * Fetch earnings-call transcript announcements from BSE.
 * @param {string} symbol @param {string} fromDate @param {string} toDate
 * @returns {Promise<Array|null>}
 */
const getResultAnnoucement = async (symbol, fromDate, toDate) => {
  let pageno = 1;
  const scripCode = await getStockScripCode(symbol);
  if (!scripCode) return null;
  const result = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const response = await bseGetJson('AnnSubCategoryGetData/w', {
      params: {
        pageno,
        strCat: 'Company Update',
        strPrevDate: fromDate,
        strScrip: scripCode,
        strSearch: 'P',
        strToDate: toDate,
        strType: 'C',
        subcategory: 'Earnings Call Transcript',
      },
    });
    result.push(...response.Table);
    if (result.length >= response.Table1[0].ROWCNT || pageno > 10) return result;
    pageno++;
  }
};

/** @returns {Promise<Array>} */
const upcomingResults = async () => bseGetJson('Corpforthresults/w');

/** @param {string} scripCode @returns {Promise<Object>} */
const getCompanyInfo = async (scripCode) =>
  bseGetJson('ComHeadernew/w', {
    params: { quotetype: 'EQ', scripcode: scripCode },
    timeout: BSE_REQUEST_TIMEOUT_MS,
  });

module.exports = {
  getStockScripCode,
  getResultAnnoucement,
  getSecurityPosition,
  upcomingResults,
  getCompanyInfo,
  getBseQuoteHeader,
  bseSmartSearch,
  parseBseSmartSearchHtml,
};
