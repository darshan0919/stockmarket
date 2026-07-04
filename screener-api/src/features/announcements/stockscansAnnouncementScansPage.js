/**
 * @fileoverview StockScans announcement-scans page API client.
 * Mirrors https://www.stockscans.in/announcement-scans payloads while
 * normalizing responses for the local app.
 * @module services/stockscansAnnouncementScansPage
 */

const { stockscans, StockscansAuth } = require('@stock/api');
const { STOCKSCANS_ASSETS_BASE } = require('./stockscansAnnouncements');

const STOCKSCANS_ORIGIN = 'https://www.stockscans.in';
const STOCKSCANS_ANNOUNCEMENT_SCANS_PAGE = `${STOCKSCANS_ORIGIN}/announcement-scans`;
const ANNOUNCEMENT_SCAN_URL = `${STOCKSCANS_ORIGIN}/api/company/announcements/scan`;
const ANNOUNCEMENT_STATISTICS_URL = `${STOCKSCANS_ORIGIN}/api/company/announcements/statistics`;
const ANNOUNCEMENT_COMPANY_URL = `${STOCKSCANS_ORIGIN}/api/company/announcements/company`;
const SCAN_METADATA_URL = `${STOCKSCANS_ORIGIN}/api/company/scans/metadata`;
const COMPANY_SEARCH_URL = `${STOCKSCANS_ORIGIN}/api/company/search`;
const WATCHLISTS_URL = `${STOCKSCANS_ORIGIN}/api/user/watchlists`;
const SAVED_ANNOUNCEMENT_SCANS_URL = `${STOCKSCANS_ORIGIN}/api/user/announcement-scans`;

const DEFAULT_ANNOUNCEMENT_SCAN = {
  scanId: '',
  scanName: 'Default Scan',
  filters: [{ left: 'Market Capitalization', right: '1000', sign: '>=' }],
  index: [],
  industry: [],
  watchlistIds: [],
  announcementType: 'All',
  searchFilters: [],
  titleKeywordsToIgnore: [],
  descriptionKeywordsToIgnore: [],
  alerts: false,
  searchMode: 'full',
  companyFilters: [],
};

const STOCKSCANS_SCAN_PAGE_SIZE = 30;
const MAX_FILTERED_SCAN_PAGES = 160;
const MAX_FILTERED_STATISTICS_PAGES = 180;

const ANNOUNCEMENT_TYPES = [
  'All',
  'Financial Results',
  'Earnings Call',
  'Presentation',
  'Annual Report',
];

const TRENDING_KEYWORDS = {
  'Growth Signals': [
    'All Time High',
    'Record High',
    'Volume Growth',
    'Market Share Gain',
    'Double Digit Growth',
    'Strong Demand',
    'Strong Pipeline',
    'Demand Visibility',
    'Operating Leverage',
    'Highest Ever',
    'Demand Recovery',
    'Blockbuster',
  ],
  'Expansion & Operations': [
    'Capex',
    'Capacity Expansion',
    'Commercial Production',
    'Greenfield',
    'Brownfield',
    'New Plant',
    'Plant Commissioning',
    'Plant Shutdown',
    'Product Launch',
    'Backward Integration',
    'Debottlenecking',
    'Capacity Utilization',
  ],
  'Orders & Wins': [
    'Order Win',
    'Order Book',
    'Backlog',
    'Contract Awarded',
    'L1 Bidder',
    'Defence Order',
    'Export Order',
    'Government Order',
    'Railway Order',
    'Letter of Award',
    'EPC Contract',
    'Turnkey Project',
  ],
  'Margin & Pricing': [
    'Margin Expansion',
    'Margin Contraction',
    'Margin Pressure',
    'Pricing Power',
    'Premiumization',
    'Value-Added Product',
    'Contribution Margin',
    'Realization',
    'ROCE',
    'Free Cash Flow',
    'Price Hike',
    'Cost Inflation',
  ],
  'Demand & Cost Pressure': [
    'Weak Demand',
    'Subdued Demand',
    'Headwinds',
    'Destocking',
    'Inventory Loss',
    'Raw Material Price',
    'Commodity Inflation',
    'Dumping',
    'Supply Chain Disruption',
    'Cost Overrun',
    'Input Cost',
    'Pricing Pressure',
  ],
  'Accounting Red Flags': [
    'Forensic Audit',
    'Fraud',
    'Qualified Opinion',
    'Restatement',
    'Impairment',
    'Exceptional Loss',
    'Whistleblower',
    'Show Cause Notice',
    'Default in Debt Repayment',
  ],
  'Regulatory Red Flags': [
    'SEBI Order',
    'SAST',
    'Penalty',
    'ED Raid',
    'Income Tax Raid',
    'Litigation',
    'Arbitration Award',
    'Tax Demand',
    'GST Demand',
  ],
  'Distress & Turnaround': [
    'IBC',
    'NCLT',
    'CIRP',
    'Insolvency',
    'Resolution Plan',
    'Liquidation',
    'Moratorium',
    'Restructuring',
    'Turnaround',
    'Debt Free',
    'Debt Reduction',
  ],
  'Capital Raising': [
    'QIP',
    'Preferential Allotment',
    'Warrants',
    'Conversion of Warrants',
    'FCCB',
    'ECB',
    'ESOP',
    'NCD',
    'Convertible Debentures',
    'Private Placement',
    'Fund Raise',
  ],
  'Mergers & Deals': [
    'Acquisition',
    'Merger',
    'Amalgamation',
    'Demerger',
    'Spin-off',
    'Slump Sale',
    'Joint Venture',
    'Stake Sale',
    'Takeover',
    'Scheme of Arrangement',
    'Strategic Partnership',
    'MOU Signed',
  ],
  'Corporate Actions': [
    'Dividend',
    'Bonus',
    'Buyback',
    'Stock Split',
    'Rights Issue',
    'Open Offer',
    'FPO',
    'Offer for Sale',
  ],
  'Management Change': [
    'CEO Resignation',
    'CFO Resignation',
    'MD Resignation',
    'Auditor Resignation',
    'Change in Management',
    'Independent Director Resignation',
  ],
  'Promoter & Insider': [
    'Pledge Release',
    'Bulk Deal',
    'Block Deal',
    'Promoter Buying',
    'Promoter Pledge',
    'Pledge Creation',
    'Open Market Purchase',
    'Promoter Selling',
    'Promoter Stake',
  ],
  'Credit & Ratings': [
    'Credit Rating',
    'Rating Upgrade',
    'Rating Downgrade',
    'Outlook Positive',
    'Outlook Negative',
    'Rating Watch Negative',
  ],
  'Approvals & Clearances': [
    'Patent Grant',
    'Mining Lease',
    'Environmental Clearance',
    'RBI Approval',
    'Technology Transfer',
    'Vendor Approval',
    'Regulatory Approval',
  ],
  Auto: [
    'Monthly Sales',
    'Vahan',
    'Dispatches',
    'Replacement Cycle',
    'Replacement Demand',
    'EV Penetration',
    'New OEM',
    'CPCB IV+',
    'Discounts',
    'Wholesales',
    'Retail Sales',
    'Waiting Period',
  ],
  Banking: [
    'GNPA',
    'NNPA',
    'Slippage',
    'Capital Adequacy',
    'PCR',
    'Write-off',
    'NIM',
    'CASA',
    'Collection Efficiency',
    'Credit Cost',
    'Gold Loan',
  ],
  NBFC: [
    'AUM',
    'Disbursement',
    'Collection Efficiency',
    'Yield on Advances',
    'Cost of Funds',
    'Securitization',
    'Co-lending',
    'Branch Expansion',
  ],
  'Pharma - USFDA / Regulatory': [
    'USFDA',
    'Form 483',
    'Warning Letter',
    'EIR',
    'OAI',
    'VAI',
    'NAI',
    'ANDA Approval',
    'Para IV',
    'First-to-File',
    'WHO GMP',
    'Drug Master File',
  ],
  'Pharma - Business & Pipeline': [
    'Biosimilar',
    'Biotech',
    'CDMO',
    'Key Starting Material',
    'New Molecule',
    'Patent Filed',
    'BioSecure Act',
    'Price Erosion',
  ],
  'Retail & QSR': [
    'SSSG',
    'Same Store Sales Growth',
    'New Store',
    'Store Addition',
    'Footfall',
    'Average Order Value',
    'Distribution Network',
    'Channel Inventory',
    'Quick Commerce',
    'Dine-in',
    'Private Label',
    'Dark Stores',
  ],
  IT: [
    'Large Deal',
    'TCV',
    'Attrition',
    'Client Addition',
    'Deal Wins',
    'ACV',
    'Wage Hike',
    'Utilization Rate',
    'Vendor Consolidation',
    'Discretionary Spend',
    'GCC',
    'Book to Bill',
  ],
  'AI & Data Centers': [
    'Artificial Intelligence',
    'Generative AI',
    'Agentic AI',
    'LLM',
    'Machine Learning',
    'Hyperscaler',
    'GPU',
    'Nvidia',
    'Liquid Cooling',
    'Data Center',
    'Semiconductor',
  ],
  'Power & Energy': [
    'Solar',
    'Wind',
    'Green Hydrogen',
    'Nuclear Power',
    'BESS',
    'HVDC',
    'PPA',
    'PLF',
    'Cell Manufacturing',
    'Grid Expansion',
    'Ethanol Blending',
    'Renewable Capacity',
  ],
  Defence: [
    'AMCA',
    'Drone',
    'Anti-Drone',
    'Kavach',
    'DRDO',
    'Missile',
    'Aerospace',
    'Combat Aircraft',
    'Submarine',
    'Emergency Procurement',
    'Indigenization',
    'Defence Export',
  ],
  'Make in India / China+1': [
    'China Plus One',
    'Make in India',
    'Atmanirbhar',
    'Import Substitution',
    'PLI Scheme',
    'Indigenization',
    'Viksit Bharat',
    'Tariff',
    'US Tariff',
    'FTA',
  ],
};

/**
 * @param {{ authRequired?: boolean }} [options]
 * @returns {import('axios').AxiosInstance}
 */
// Raw HTTP + auth now live in @stock/api StockscansClient. Public endpoints call the
// client with optionalAuth (works unauthenticated); the auth-required ones gate on a
// token first to preserve the STOCKSCANS_AUTH_REQUIRED contract.
function requireAuth() {
  try {
    new StockscansAuth().getToken();
  } catch {
    const err = new Error(
      'STOCKSCANS_AUTH_TOKEN is required for saved announcement scans and watchlists.'
    );
    err.code = 'STOCKSCANS_AUTH_REQUIRED';
    throw err;
  }
}

/**
 * @param {unknown} value
 * @param {Array} fallback
 * @returns {Array}
 */
function arrayOr(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

/**
 * @param {unknown} value
 * @param {number} [limit=50]
 * @returns {string[]}
 */
function normalizeKeywordList(value, limit = 50) {
  return arrayOr(value)
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .filter((keyword, index, arr) => {
      const lower = keyword.toLowerCase();
      return arr.findIndex((item) => item.toLowerCase() === lower) === index;
    })
    .slice(0, limit);
}

/**
 * @param {Object} scan
 * @returns {Object}
 */
function normalizeScan(scan = {}) {
  const merged = { ...DEFAULT_ANNOUNCEMENT_SCAN, ...(scan || {}) };
  return {
    ...merged,
    filters: arrayOr(merged.filters, DEFAULT_ANNOUNCEMENT_SCAN.filters),
    index: arrayOr(merged.index),
    industry: arrayOr(merged.industry),
    watchlistIds: arrayOr(merged.watchlistIds),
    searchFilters: normalizeKeywordList(merged.searchFilters, 12),
    titleKeywordsToIgnore: normalizeKeywordList(merged.titleKeywordsToIgnore),
    descriptionKeywordsToIgnore: normalizeKeywordList(merged.descriptionKeywordsToIgnore),
    announcementType: ANNOUNCEMENT_TYPES.includes(merged.announcementType)
      ? merged.announcementType
      : 'All',
    searchMode: merged.searchMode === 'quick' ? 'quick' : 'full',
    alerts: merged.alerts === true,
    companyFilters: arrayOr(merged.companyFilters)
      .map((item) => {
        if (typeof item === 'string') return { companyId: item };
        if (item && typeof item === 'object' && item.companyId) {
          return { companyId: String(item.companyId) };
        }
        return null;
      })
      .filter(Boolean),
  };
}

/**
 * @param {Object} scan
 * @returns {Object}
 */
function stripLocalScanFields(scan) {
  const {
    titleKeywordsToIgnore: _titleKeywordsToIgnore,
    descriptionKeywordsToIgnore: _descriptionKeywordsToIgnore,
    ...stockScansScan
  } = scan;
  return stockScansScan;
}

/**
 * @param {Object} raw
 * @returns {{ scan: Object, offset: number, quarterDate: string }}
 */
function normalizeAnnouncementScanParams(raw = {}) {
  return {
    scan: normalizeScan(raw.scan),
    offset: Math.max(0, parseInt(String(raw.offset || 0), 10) || 0),
    quarterDate: /^\d{6}$/.test(String(raw.quarterDate || ''))
      ? String(raw.quarterDate)
      : currentQuarterDate(),
  };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function searchableText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * @param {Object} announcement
 * @param {Object} scan
 * @returns {boolean}
 */
function shouldIgnoreAnnouncement(announcement, scan) {
  const title = searchableText(announcement.title || announcement.highlightedTitle);
  const description = searchableText(announcement.description);
  const titleIgnored = scan.titleKeywordsToIgnore.some((keyword) =>
    title.includes(keyword.toLowerCase())
  );
  if (titleIgnored) return true;
  return scan.descriptionKeywordsToIgnore.some((keyword) =>
    description.includes(keyword.toLowerCase())
  );
}

/**
 * @param {Object[]} announcements
 * @param {Object} scan
 * @returns {Object[]}
 */
function filterIgnoredAnnouncements(announcements, scan) {
  if (!hasIgnoreKeywords(scan)) return announcements;
  return announcements.filter((announcement) => !shouldIgnoreAnnouncement(announcement, scan));
}

/**
 * @param {Object} scan
 * @returns {boolean}
 */
function hasIgnoreKeywords(scan) {
  return (
    arrayOr(scan?.titleKeywordsToIgnore).length > 0 ||
    arrayOr(scan?.descriptionKeywordsToIgnore).length > 0
  );
}

/**
 * @param {Object} announcement
 * @param {string} keyword
 * @param {string} searchMode
 * @returns {boolean}
 */
function announcementMatchesKeyword(announcement, keyword, searchMode = 'full') {
  const needle = String(keyword || '')
    .trim()
    .toLowerCase();
  if (!needle) return false;
  const title = searchableText(announcement.title || announcement.highlightedTitle);
  if (title.includes(needle)) return true;
  if (searchMode === 'quick') return false;
  const description = searchableText(
    [announcement.description, ...arrayOr(announcement.snippet).map((snippet) => snippet?.text)]
      .filter(Boolean)
      .join(' ')
  );
  return description.includes(needle);
}

/**
 * @returns {string}
 */
function currentQuarterDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const quarterEnd = [3, 6, 9, 12].find((m) => month <= m) || 12;
  return `${year}${String(quarterEnd).padStart(2, '0')}`;
}

/**
 * @param {number} [startYear=2020]
 * @returns {string[]}
 */
function getQuarterDates(startYear = 2020) {
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisQuarter = Math.ceil((now.getMonth() + 1) / 3) || 4;
  const out = [];
  for (let year = startYear; year <= thisYear; year += 1) {
    const firstQuarter = year === startYear ? 3 : 1;
    const lastQuarter = year === thisYear ? thisQuarter : 4;
    for (let quarter = firstQuarter; quarter <= lastQuarter; quarter += 1) {
      out.push(`${year}${String(quarter * 3).padStart(2, '0')}`);
    }
  }
  return out.reverse();
}

/**
 * @param {unknown} raw
 * @param {string} fallback
 * @returns {Error}
 */
function toStockScansError(raw, fallback) {
  if (raw?.response) {
    const status = raw.response.status;
    const data = raw.response.data;
    const message =
      (data && typeof data === 'object' && data.message) ||
      (typeof data === 'string' && data.length < 200 ? data : fallback);
    const err = new Error(message || fallback);
    err.status = status;
    err.details = data;
    if (status === 401 || status === 403) err.code = 'STOCKSCANS_AUTH_REQUIRED';
    else if (status === 402) err.code = 'STOCKSCANS_SUBSCRIPTION_REQUIRED';
    else err.code = 'STOCKSCANS_HTTP_ERROR';
    return err;
  }
  const err = new Error(raw?.message || fallback);
  err.code = raw?.code || 'STOCKSCANS_NETWORK';
  return err;
}

/**
 * @param {Object} row
 * @returns {Object|null}
 */
function mapAnnouncement(row) {
  if (!row || typeof row !== 'object') return null;
  const ssUrl = row.ssUrl || null;
  const attachmentUrl = ssUrl ? `${STOCKSCANS_ASSETS_BASE}/${ssUrl}` : null;
  const [, symbol = ''] = String(row.companyId || '').split(':');
  const [exchange = ''] = String(row.companyId || '').split(':');
  return {
    date: row.date || '',
    title: row.title || 'Announcement',
    description: row.description || '',
    ssUrl,
    attachmentUrl,
    attchmntFile: attachmentUrl,
    createdAt: row.createdAt || '',
    companyId: row.companyId || '',
    exchange,
    symbol,
    name: row.name || symbol,
    snippet: arrayOr(row.snippet),
    highlightedTitle: row.highlightedTitle || null,
    pageNumber: row.pageNumber || null,
    source: 'stockscans-announcement-scan',
  };
}

/**
 * @param {Object} body
 * @returns {Object}
 */
function mapAnnouncementScanResponse(body = {}) {
  const announcements = arrayOr(body.announcements).map(mapAnnouncement).filter(Boolean);
  return {
    announcements,
    start: typeof body.start === 'number' ? body.start : announcements.length ? 1 : 0,
    end: typeof body.end === 'number' ? body.end : announcements.length,
    total: typeof body.total === 'number' ? body.total : announcements.length,
    quarterDate: body.quarterDate || null,
  };
}

async function postStockScansAnnouncementScan(payload) {
  const data = await stockscans.scanAnnouncements(payload, {
    referer: STOCKSCANS_ANNOUNCEMENT_SCANS_PAGE,
    optionalAuth: true,
  });
  return mapAnnouncementScanResponse(data || {});
}

async function postStockScansAnnouncementStatistics(payload) {
  const data = await stockscans.announcementStatistics(payload, {
    referer: STOCKSCANS_ANNOUNCEMENT_SCANS_PAGE,
    optionalAuth: true,
  });
  return data || {};
}

/**
 * @param {Object} params
 * @returns {Promise<Object>}
 */
async function runAnnouncementScan(params) {
  const payload = normalizeAnnouncementScanParams(params);
  const shouldFilter = hasIgnoreKeywords(payload.scan);
  const stockScansScan = stripLocalScanFields(payload.scan);
  const filteredOffset = payload.offset;
  const acceptedTarget = filteredOffset + STOCKSCANS_SCAN_PAGE_SIZE;
  let rawOffset = shouldFilter ? 0 : filteredOffset;
  let rawTotal = null;
  let rawEnd = rawOffset;
  let pagesRead = 0;
  const accepted = [];
  try {
    if (!shouldFilter) {
      return postStockScansAnnouncementScan({
        ...payload,
        scan: stockScansScan,
      });
    }

    while (pagesRead < MAX_FILTERED_SCAN_PAGES) {
      const page = await postStockScansAnnouncementScan({
        scan: stockScansScan,
        quarterDate: payload.quarterDate,
        offset: rawOffset,
      });
      pagesRead += 1;
      rawTotal = typeof page.total === 'number' ? page.total : rawTotal;
      rawEnd = typeof page.end === 'number' ? page.end : rawOffset + page.announcements.length;

      accepted.push(...filterIgnoredAnnouncements(page.announcements, payload.scan));

      const noMoreRawRows =
        page.announcements.length === 0 ||
        (rawTotal !== null && rawEnd >= rawTotal) ||
        page.end === rawOffset;
      if (accepted.length >= acceptedTarget || noMoreRawRows) break;
      rawOffset = rawEnd;
    }

    const pageRows = accepted.slice(filteredOffset, acceptedTarget);
    const reachedRawEnd = rawTotal === null || rawEnd >= rawTotal;
    const filteredTotal = reachedRawEnd
      ? accepted.length
      : Math.max(accepted.length + 1, acceptedTarget + 1);
    return {
      announcements: pageRows,
      start: pageRows.length ? filteredOffset + 1 : 0,
      end: filteredOffset + pageRows.length,
      total: filteredTotal,
      quarterDate: payload.quarterDate,
      meta: {
        ignoredTitleKeywords: payload.scan.titleKeywordsToIgnore,
        ignoredDescriptionKeywords: payload.scan.descriptionKeywordsToIgnore,
        rawTotal,
        rawEnd,
        pagesRead,
        filteringApplied: true,
        totalIsExact: reachedRawEnd,
      },
    };
  } catch (err) {
    throw toStockScansError(err, 'StockScans announcement scan failed');
  }
}

/**
 * @param {Object} rawStats
 * @returns {Map<string, { companyKey: string, name: string, companyId: string }>}
 */
function buildStatisticsCompanyLookup(rawStats) {
  const lookup = new Map();
  arrayOr(rawStats?.companyData).forEach((item) => {
    if (!Array.isArray(item)) return;
    const [companyKey, name, companyId] = item;
    if (!companyId) return;
    lookup.set(String(companyId), {
      companyKey: String(companyKey || companyId),
      name: String(name || companyId),
      companyId: String(companyId),
    });
  });
  return lookup;
}

/**
 * @param {Object} payload
 * @param {Object} rawStats
 * @returns {Promise<Object>}
 */
async function fetchFilteredAnnouncementStatistics(payload, rawStats) {
  const keywords = payload.scan.searchFilters;
  const stockScansScan = stripLocalScanFields(payload.scan);
  const companyLookup = buildStatisticsCompanyLookup(rawStats);
  const rows = new Map();
  let rawOffset = 0;
  let rawTotal = null;
  let rawEnd = 0;
  let pagesRead = 0;

  while (pagesRead < MAX_FILTERED_STATISTICS_PAGES) {
    const page = await postStockScansAnnouncementScan({
      scan: stockScansScan,
      quarterDate: payload.quarterDate,
      offset: rawOffset,
    });
    pagesRead += 1;
    rawTotal = typeof page.total === 'number' ? page.total : rawTotal;
    rawEnd = typeof page.end === 'number' ? page.end : rawOffset + page.announcements.length;

    const accepted = filterIgnoredAnnouncements(page.announcements, payload.scan);
    accepted.forEach((announcement) => {
      const companyId = String(announcement.companyId || '').trim();
      if (!companyId) return;
      const lookup = companyLookup.get(companyId);
      const current = rows.get(companyId) || {
        companyKey: lookup?.companyKey || companyId,
        name: lookup?.name || announcement.name || announcement.symbol || companyId,
        companyId,
        counts: keywords.map(() => 0),
      };
      keywords.forEach((keyword, index) => {
        if (announcementMatchesKeyword(announcement, keyword, payload.scan.searchMode)) {
          current.counts[index] += 1;
        }
      });
      rows.set(companyId, current);
    });

    const noMoreRawRows =
      page.announcements.length === 0 ||
      (rawTotal !== null && rawEnd >= rawTotal) ||
      page.end === rawOffset;
    if (noMoreRawRows) break;
    rawOffset = rawEnd;
  }

  const companyData = Array.from(rows.values())
    .filter((row) => row.counts.some((count) => count > 0))
    .sort(
      (a, b) =>
        b.counts.reduce((sum, count) => sum + count, 0) -
        a.counts.reduce((sum, count) => sum + count, 0)
    )
    .map((row) => [row.companyKey, row.name, row.companyId, row.counts]);
  const totalMatches = companyData.reduce(
    (sum, row) => sum + row[3].reduce((rowSum, count) => rowSum + count, 0),
    0
  );
  const reachedRawEnd = rawTotal === null || rawEnd >= rawTotal;

  return {
    ...rawStats,
    keywords,
    companyData,
    totalMatches,
    totalCompanies: companyData.length,
    meta: {
      ...(rawStats.meta || {}),
      ignoredTitleKeywords: payload.scan.titleKeywordsToIgnore,
      ignoredDescriptionKeywords: payload.scan.descriptionKeywordsToIgnore,
      rawTotal,
      rawEnd,
      pagesRead,
      filteringApplied: true,
      totalIsExact: reachedRawEnd,
    },
  };
}

async function fetchAnnouncementScanMetadata() {
  try {
    const data = await stockscans.scanMetadata({
      referer: STOCKSCANS_ANNOUNCEMENT_SCANS_PAGE,
      optionalAuth: true,
    });
    return {
      indexList: arrayOr(data?.indexList),
      industryList: arrayOr(data?.industryList),
      announcementTypes: ANNOUNCEMENT_TYPES,
      trendingKeywords: TRENDING_KEYWORDS,
      quarterDates: getQuarterDates(),
      defaultScan: DEFAULT_ANNOUNCEMENT_SCAN,
    };
  } catch (err) {
    throw toStockScansError(err, 'StockScans scan metadata failed');
  }
}

async function searchCompanies(query) {
  const q = String(query || '').trim();
  if (!q) return [];
  try {
    const data = await stockscans.companySearch(q, {
      type: 'Company',
      referer: STOCKSCANS_ANNOUNCEMENT_SCANS_PAGE,
      optionalAuth: true,
    });
    return arrayOr(data?.companies);
  } catch (err) {
    throw toStockScansError(err, 'StockScans company search failed');
  }
}

async function fetchWatchlists() {
  requireAuth();
  try {
    const data = await stockscans.watchlistsList({
      view: 'names',
      referer: STOCKSCANS_ANNOUNCEMENT_SCANS_PAGE,
    });
    return arrayOr(data?.watchlists);
  } catch (err) {
    throw toStockScansError(err, 'StockScans watchlists failed');
  }
}

async function fetchSavedAnnouncementScans() {
  requireAuth();
  try {
    const data = await stockscans.savedAnnouncementScans({
      referer: STOCKSCANS_ANNOUNCEMENT_SCANS_PAGE,
    });
    return arrayOr(data?.announcementScans);
  } catch (err) {
    throw toStockScansError(err, 'StockScans saved announcement scans failed');
  }
}

async function saveAnnouncementScan(scan) {
  requireAuth();
  try {
    const payload = stripLocalScanFields(normalizeScan(scan));
    const data = await stockscans.saveAnnouncementScan(payload, {
      referer: STOCKSCANS_ANNOUNCEMENT_SCANS_PAGE,
    });
    return data || {};
  } catch (err) {
    throw toStockScansError(err, 'StockScans save announcement scan failed');
  }
}

async function reorderAnnouncementScans(scanIds) {
  requireAuth();
  try {
    const data = await stockscans.reorderAnnouncementScans(arrayOr(scanIds), {
      referer: STOCKSCANS_ANNOUNCEMENT_SCANS_PAGE,
    });
    return data || {};
  } catch (err) {
    throw toStockScansError(err, 'StockScans reorder announcement scans failed');
  }
}

async function deleteAnnouncementScan(scanId) {
  const id = String(scanId || '').trim();
  if (!id) {
    const err = new Error('scanId is required');
    err.code = 'INVALID_SCAN_ID';
    throw err;
  }
  requireAuth();
  try {
    const data = await stockscans.deleteAnnouncementScan(id, {
      referer: STOCKSCANS_ANNOUNCEMENT_SCANS_PAGE,
    });
    return data || {};
  } catch (err) {
    throw toStockScansError(err, 'StockScans delete announcement scan failed');
  }
}

async function fetchAnnouncementStatistics(params) {
  const payload = normalizeAnnouncementScanParams(params);
  const stockScansScan = stripLocalScanFields(payload.scan);
  try {
    const rawStats = await postStockScansAnnouncementStatistics({
      scan: stockScansScan,
      quarterDate: payload.quarterDate,
      offset: payload.offset,
    });
    if (!hasIgnoreKeywords(payload.scan)) return rawStats;
    return fetchFilteredAnnouncementStatistics(payload, rawStats);
  } catch (err) {
    throw toStockScansError(err, 'StockScans announcement statistics failed');
  }
}

async function fetchCompanyAnnouncements(params = {}) {
  const companyKey = String(params.companyKey || '').trim();
  if (!companyKey) {
    const err = new Error('companyKey is required');
    err.code = 'COMPANY_KEY_REQUIRED';
    throw err;
  }
  const payload = {
    companyKey,
    keywords: arrayOr(params.keywords)
      .map((v) => String(v || '').trim())
      .filter(Boolean),
    quarterDate: /^\d{6}$/.test(String(params.quarterDate || ''))
      ? String(params.quarterDate)
      : currentQuarterDate(),
    allTime: params.allTime === true,
    announcementType: ANNOUNCEMENT_TYPES.includes(params.announcementType)
      ? params.announcementType
      : 'All',
    searchMode: params.searchMode === 'quick' ? 'quick' : 'full',
  };
  const ignoreScan = normalizeScan({
    titleKeywordsToIgnore: params.titleKeywordsToIgnore,
    descriptionKeywordsToIgnore: params.descriptionKeywordsToIgnore,
  });
  try {
    const data = await stockscans.companyAnnouncements(payload, {
      referer: STOCKSCANS_ANNOUNCEMENT_SCANS_PAGE,
      optionalAuth: true,
    });
    return {
      announcements: filterIgnoredAnnouncements(
        arrayOr(data?.announcements).map(mapAnnouncement).filter(Boolean),
        ignoreScan
      ),
    };
  } catch (err) {
    throw toStockScansError(err, 'StockScans company announcement drilldown failed');
  }
}

module.exports = {
  ANNOUNCEMENT_TYPES,
  DEFAULT_ANNOUNCEMENT_SCAN,
  TRENDING_KEYWORDS,
  getQuarterDates,
  currentQuarterDate,
  normalizeScan,
  normalizeAnnouncementScanParams,
  stripLocalScanFields,
  normalizeKeywordList,
  shouldIgnoreAnnouncement,
  filterIgnoredAnnouncements,
  announcementMatchesKeyword,
  buildStatisticsCompanyLookup,
  mapAnnouncement,
  mapAnnouncementScanResponse,
  runAnnouncementScan,
  fetchAnnouncementScanMetadata,
  searchCompanies,
  fetchWatchlists,
  fetchSavedAnnouncementScans,
  saveAnnouncementScan,
  reorderAnnouncementScans,
  deleteAnnouncementScan,
  fetchAnnouncementStatistics,
  fetchCompanyAnnouncements,
};
