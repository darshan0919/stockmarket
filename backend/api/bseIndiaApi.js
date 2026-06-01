const { bseGetText, bseGetJson, BSE_REQUEST_TIMEOUT_MS } = require('./bseHttp');

/**
 * Parse BSE PeerSmartSearch HTML into NSE-autocomplete-shaped symbols.
 * @param {string} html - Raw HTML fragment from BSE search API
 * @returns {Array<Object>}
 */
const parseBseSmartSearchHtml = (html) => {
  const symbols = [];
  const itemRegex = /liclick\('(\d+)','([^']+)'\)[\s\S]*?<span>([\s\S]*?)<\/span>/gi;
  let match = itemRegex.exec(html);
  while (match) {
    const spanPlain = match[3]
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .trim();
    const tokens = spanPlain.split(/\s+/).filter(Boolean);
    const symbol = tokens[0] || match[2].split(' ')[0];
    symbols.push({
      symbol,
      symbol_info: match[2],
      result_sub_type: 'equity',
      activeSeries: ['EQ'],
      listing_date: null,
      bse_scrip_code: match[1],
    });
    match = itemRegex.exec(html);
  }
  return symbols;
};

/**
 * Resolve BSE scrip code for an NSE/BSE symbol via smart search.
 * @param {string} symbol
 * @returns {Promise<string|null>}
 */
const getStockScripCode = async (symbol) => {
  try {
    const normalized = symbol.trim().toUpperCase();
    const { data } = await bseGetText('PeerSmartSearch/w', {
      params: { Type: 'SS', text: normalized },
      timeout: BSE_REQUEST_TIMEOUT_MS,
    });
    const html = String(data).replaceAll('&nbsp;', ' ');
    const symbols = parseBseSmartSearchHtml(html);
    const exact = symbols.find((item) => item.symbol?.toUpperCase() === normalized);
    if (exact?.bse_scrip_code) {
      return exact.bse_scrip_code;
    }

    const regex = new RegExp(`<strong>${normalized}<\\/strong>\\s+\\w+\\s+(\\d+)`);
    const match = html.match(regex);
    return match?.[1] || null;
  } catch (error) {
    console.warn('BSE getStockScripCode failed:', error.message);
    return null;
  }
};

/**
 * Fetch earnings-call transcript announcements from BSE.
 * @param {string} symbol
 * @param {string} fromDate
 * @param {string} toDate
 * @returns {Promise<Array|null>}
 */
const getResultAnnoucement = async (symbol, fromDate, toDate) => {
  let pageno = 1;
  const scripCode = await getStockScripCode(symbol);
  if (!scripCode) {
    return null;
  }
  let result = [];
  while (true) {
    const response = await bseGetJson('AnnSubCategoryGetData/w', {
      params: {
        pageno: pageno,
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
    if (result.length >= response.Table1[0].ROWCNT || pageno > 10) {
      return result;
    }
    pageno++;
  }
};

/**
 * Fetch upcoming result dates from BSE.
 * @returns {Promise<Array>}
 */
const upcomingResults = async () => {
  return bseGetJson('Corpforthresults/w');
};

/**
 * Fetch company header metadata from BSE.
 * @param {string} scripCode
 * @returns {Promise<Object>}
 */
const getCompanyInfo = async (scripCode) => {
  return bseGetJson('ComHeadernew/w', {
    params: { quotetype: 'EQ', scripcode: scripCode },
    timeout: BSE_REQUEST_TIMEOUT_MS,
  });
};

/**
 * Live quote header from BSE (LTP, change, company name).
 * @param {string} scripCode - BSE scrip code
 * @returns {Promise<Object>}
 */
const getBseQuoteHeader = async (scripCode) => {
  return bseGetJson('getScripHeaderData/w', {
    params: { Market: 'EQ', scripcode: scripCode },
    timeout: BSE_REQUEST_TIMEOUT_MS,
  });
};

/**
 * BSE smart search (fallback when NSE autocomplete is unavailable).
 * @param {string} query - Search text
 * @returns {Promise<{ symbols: Array<Object> }>}
 * @see {@link docs/backend/api/bseIndiaApi.md}
 */
const bseSmartSearch = async (query) => {
  const { data } = await bseGetText('PeerSmartSearch/w', {
    params: { Type: 'SS', text: query },
    timeout: BSE_REQUEST_TIMEOUT_MS,
  });
  const html = String(data || '');
  return { symbols: parseBseSmartSearchHtml(html) };
};

module.exports = {
  getStockScripCode,
  getResultAnnoucement,
  upcomingResults,
  getCompanyInfo,
  getBseQuoteHeader,
  bseSmartSearch,
  parseBseSmartSearchHtml,
};
