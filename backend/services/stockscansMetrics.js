/**
 * Batch fundamental metrics from Stockscans for a list of NSE symbols.
 *
 * Two parallel calls:
 *  1. POST /api/company/card-details  → Market Capitalization, Price To Earnings
 *  2. POST /api/company/scans/run     → PAT Growth TTM, Retail Holdings
 *     (scans/run requires a saved scanId; we use the user's "Top Gainers" scan and
 *      override its filters in the request body)
 *
 * @module services/stockscansMetrics
 */

const { stockscans } = require('@stock/api');

/**
 * Saved scan ID used as a token for scans/run. The actual filters are
 * overridden in the request body, so any valid scanId belonging to the
 * authenticated user works here.
 */
const SCAN_ID = '7f7e2d4044f428e69254ce31';

const toNum = (v) => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Fetch fundamental metrics for a list of NSE symbols in two batch calls.
 *
 * @param {string[]} nseSymbols - Plain NSE symbols, e.g. ['RELIANCE', 'TCS']
 * @returns {Promise<Record<string, { marketCapCr: number|null, pe: number|null, patGrowthTtm: number|null, retailHoldingsPercent: number|null }>>}
 */
async function fetchFundamentals(nseSymbols) {
  /** @type {Record<string, { marketCapCr: number|null, pe: number|null, patGrowthTtm: number|null, retailHoldingsPercent: number|null }>} */
  const result = {};
  for (const s of nseSymbols) {
    result[s] = { marketCapCr: null, pe: null, patGrowthTtm: null, retailHoldingsPercent: null };
  }

  const companyIds = nseSymbols.map((s) => `NSE:${s}`);

  const scanBody = {
    ratiosType: 'Ratios',
    timePeriod: 'Latest',
    scan: {
      scanId: SCAN_ID,
      filters: [
        { left: 'Returns 1D', sign: '>=', right: '0' },
        { left: 'PAT Growth TTM', sign: '>=', right: '-999999' },
        { left: 'Retail Holdings', sign: '>=', right: '-999999' },
      ],
      index: [],
      industry: [],
      sector: [],
      tags: [],
      watchlistIds: [],
      alertFrequency: null,
    },
    watchlistIds: [],
    order: 'desc',
    orderBy: 'Returns 1D',
    offset: 0,
  };

  // Raw HTTP + auth now live in @stock/api StockscansClient; this service keeps
  // only the metric-mapping business logic.
  const [cardResult, scanResult] = await Promise.allSettled([
    stockscans.cardDetails(companyIds),
    stockscans.runScan(scanBody),
  ]);

  // card-details → marketCapCr + pe
  if (cardResult.status === 'fulfilled') {
    const cardData = cardResult.value?.cardData ?? {};
    for (const symbol of nseSymbols) {
      const ratios = cardData[`NSE:${symbol}`]?.metaRatios;
      if (ratios) {
        result[symbol].marketCapCr = toNum(ratios['Market Capitalization']);
        result[symbol].pe = toNum(ratios['Price To Earnings']);
      }
    }
  }

  // scans/run → patGrowthTtm + retailHoldingsPercent
  if (scanResult.status === 'fulfilled') {
    const table = scanResult.value?.table;
    if (Array.isArray(table) && table.length > 1) {
      const hdr = table[0];
      const cidIdx = hdr.indexOf('companyId');
      const patIdx = hdr.indexOf('PAT Growth TTM');
      const retailIdx = hdr.indexOf('Retail Holdings');
      // Also pick up market cap from scan as fallback when card-details missed a symbol
      const mcIdx = hdr.indexOf('Market Capitalization');
      const peIdx = hdr.indexOf('Price To Earnings');

      for (let i = 1; i < table.length; i++) {
        const row = table[i];
        const cid = row[cidIdx];
        if (typeof cid !== 'string' || !cid.startsWith('NSE:')) continue;
        const symbol = cid.slice(4);
        if (!result[symbol]) continue;

        if (patIdx > -1) result[symbol].patGrowthTtm = toNum(row[patIdx]);
        if (retailIdx > -1) result[symbol].retailHoldingsPercent = toNum(row[retailIdx]);
        // Fallback market cap / PE from scan if card-details didn't get them
        if (result[symbol].marketCapCr == null && mcIdx > -1) {
          result[symbol].marketCapCr = toNum(row[mcIdx]);
        }
        if (result[symbol].pe == null && peIdx > -1) {
          result[symbol].pe = toNum(row[peIdx]);
        }
      }
    }
  }

  return result;
}

module.exports = { fetchFundamentals };
