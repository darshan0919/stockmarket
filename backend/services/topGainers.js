/**
 * Top Gainers service — assembles an enriched gainers table from NSE live data.
 *
 * Base list (symbol, price, % day change, volume, traded value) comes from NSE's
 * `live-analysis-variations` endpoint. Each row is then enriched in parallel with
 * P/E (quote-equity) and delivery-to-trade ratio + 1-week price change
 * (price-volume-deliverable history). Results are cached briefly to avoid
 * hammering NSE on every page load.
 *
 * @module services/topGainers
 * @see {@link docs/backend/services/topGainers.md} for documentation
 */

const {
  getLiveVariations,
  getQuoteEquity,
  getPriceVolumeDeliverable,
  formatDate,
  nseGet,
  NSE_HOME_URL,
} = require('../api/nseIndiaApi');
const { getStockScripCode, getCompanyInfo } = require('../api/bseIndiaApi');
const { parseNseDateToObject } = require('../utils/nseHelpers');

const CACHE_TTL_MS = 90 * 1000;
const ENRICH_CONCURRENCY = 6;
const DEFAULT_COUNT = 20;
const MAX_COUNT = 50;

/** Buckets exposed by NSE live-analysis-variations, in preference order. */
const BUCKETS = ['allSec', 'NIFTY', 'NIFTYNEXT50', 'BANKNIFTY', 'SecGtr20', 'SecLwr20', 'FOSec'];

/** @type {Map<string, { expires: number, payload: Object }>} */
const cache = new Map();

const toNumber = (v) => {
  if (v === null || v === undefined || v === '' || v === '-') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/**
 * Run async tasks with a bounded concurrency pool.
 * @template T
 * @param {Array<() => Promise<T>>} tasks
 * @param {number} limit
 * @returns {Promise<T[]>}
 */
const mapWithConcurrency = async (tasks, limit) => {
  const results = new Array(tasks.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor++;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
};

/**
 * Fetch P/E, market cap (in ₹ Cr), and today's delivery % for a symbol.
 * Tries NSE quote-equity first; falls back to BSE when NSE 403s.
 * BSE gives P/E only — market cap and delivery % remain null on BSE fallback.
 * @param {string} symbol
 * @param {number|null} ltp - Last traded price from the base row
 * @returns {Promise<{ pe: number|null, marketCapCr: number|null, deliveryPercent: number|null }>}
 */
const fetchQuoteMetrics = async (symbol, ltp) => {
  try {
    const quote = await getQuoteEquity(symbol);
    const pe = toNumber(quote?.metadata?.pdSymbolPe);
    const issuedSize = toNumber(quote?.securityInfo?.issuedSize);
    const lastPrice = toNumber(quote?.priceInfo?.lastPrice) ?? ltp;
    const marketCapCr =
      issuedSize != null && lastPrice != null ? (issuedSize * lastPrice) / 1e7 : null;
    const deliveryPercent = toNumber(quote?.tradeInfo?.deliveryToTradedQuantity);
    return { pe, marketCapCr, deliveryPercent };
  } catch {
    // fall through to BSE
  }

  try {
    const scripCode = await getStockScripCode(symbol);
    if (!scripCode) return { pe: null, marketCapCr: null, deliveryPercent: null };
    const info = await getCompanyInfo(scripCode);
    return { pe: toNumber(info?.PE), marketCapCr: null, deliveryPercent: null };
  } catch {
    return { pe: null, marketCapCr: null, deliveryPercent: null };
  }
};

/**
 * Fetch latest public/retail shareholding % from NSE.
 * Returns null on failure or when data unavailable.
 * @param {string} symbol
 * @returns {Promise<number|null>}
 */
const fetchRetailHolding = async (symbol) => {
  try {
    const today = new Date();
    const from = new Date(today);
    from.setFullYear(today.getFullYear() - 1);
    const response = await nseGet('/corporate-share-holdings-master', {
      params: {
        symbol,
        series: 'EQ',
        fromDate: formatDate(from),
        toDate: formatDate(today),
        index: 'equities',
      },
      referer: `${NSE_HOME_URL}get-quotes/equity?symbol=${symbol}`,
      symbol,
    });
    const data = Array.isArray(response.data) ? response.data : [];
    // Sort descending by date and take the latest filing
    const sorted = data.filter((r) => r?.date).sort((a, b) => new Date(b.date) - new Date(a.date));
    const latest = sorted[0];
    return toNumber(latest?.public_val);
  } catch {
    return null;
  }
};

/**
 * Compute 1-week price change, T-1 delivery % (fallback), and 30-day average
 * delivery % from NSE security-wise history. Best-effort; resolves nulls on failure.
 *
 * Window is extended to ~45 calendar days to cover ~30 trading sessions.
 * `deliveryPercent` (T-1) is returned as a fallback for callers — the primary
 * today's value comes from quote-equity.tradeInfo.deliveryToTradedQuantity.
 *
 * @param {string} symbol
 * @returns {Promise<{ deliveryPercent: number|null, weekChangePercent: number|null, avgDeliveryPercent30d: number|null }>}
 */
const fetchHistoryMetrics = async (symbol) => {
  const empty = { deliveryPercent: null, weekChangePercent: null, avgDeliveryPercent30d: null };
  try {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - 45); // ~30 trading sessions of headroom

    const rows = await getPriceVolumeDeliverable(symbol, formatDate(from), formatDate(to));
    if (!Array.isArray(rows) || rows.length === 0) return empty;

    const candles = rows
      .map((r) => {
        const dateObj = parseNseDateToObject(r.mTIMESTAMP || r.CH_TIMESTAMP);
        return {
          time: dateObj ? dateObj.getTime() : 0,
          close: toNumber(r.CH_CLOSING_PRICE),
          deliveryPercent: toNumber(r.COP_DELIV_PERC),
        };
      })
      .filter((c) => c.time && c.close)
      .sort((a, b) => a.time - b.time);

    if (candles.length === 0) return empty;

    const latest = candles[candles.length - 1];
    // ~5 trading sessions back for a 1-week change; fall back to the oldest we have.
    const weekAgo = candles[candles.length - 6] || candles[0];
    const weekChangePercent =
      weekAgo && weekAgo.close
        ? Number((((latest.close - weekAgo.close) / weekAgo.close) * 100).toFixed(2))
        : null;

    // Average delivery % over last 30 trading sessions
    const deliveryValues = candles
      .slice(-30)
      .map((c) => c.deliveryPercent)
      .filter((v) => v != null);
    const avgDeliveryPercent30d =
      deliveryValues.length > 0
        ? Number((deliveryValues.reduce((s, v) => s + v, 0) / deliveryValues.length).toFixed(2))
        : null;

    return { deliveryPercent: latest.deliveryPercent, weekChangePercent, avgDeliveryPercent30d };
  } catch {
    return empty;
  }
};

/**
 * Normalize a raw NSE variation row into the base table shape.
 * @param {Object} row
 * @returns {Object}
 */
const mapBaseRow = (row) => {
  const price = toNumber(row.ltp);
  const volume = toNumber(row.trade_quantity);
  const turnover = toNumber(row.turnover);
  // NSE turnover is in ₹ lakhs on this endpoint; convert to absolute ₹. Fall back to
  // volume × price (the spec's "volume × avg price") when turnover is unavailable.
  const value =
    turnover != null ? turnover * 1e5 : volume != null && price != null ? volume * price : null;

  return {
    symbol: row.symbol,
    name: row.symbol,
    series: row.series,
    price,
    changePercent: toNumber(row.net_price),
    previousClose: toNumber(row.prev_price),
    volume,
    value,
    pe: null,
    marketCapCr: null,
    deliveryPercent: null,
    avgDeliveryPercent30d: null,
    weekChangePercent: null,
    retailHoldingPercent: null,
  };
};

/**
 * Select and de-duplicate the top gainer rows from a chosen bucket.
 * @param {Object} variations - Raw live-analysis-variations payload
 * @param {string} bucket
 * @param {number} count
 * @returns {{ rows: Object[], timestamp: string|null, bucket: string }}
 */
const selectRows = (variations, bucket, count) => {
  const resolvedBucket = variations?.[bucket]?.data
    ? bucket
    : BUCKETS.find((b) => variations?.[b]?.data);
  const group = resolvedBucket ? variations[resolvedBucket] : null;
  const data = Array.isArray(group?.data) ? group.data : [];

  const seen = new Set();
  const rows = [];
  for (const row of data) {
    if (!row?.symbol || seen.has(row.symbol)) continue;
    seen.add(row.symbol);
    rows.push(mapBaseRow(row));
    if (rows.length >= count) break;
  }

  return {
    rows,
    timestamp: group?.timestamp || variations?.dateTime || null,
    bucket: resolvedBucket || bucket,
  };
};

/**
 * Get the enriched top gainers table.
 * @param {Object} [options]
 * @param {number} [options.count] - Number of rows (1..50)
 * @param {string} [options.bucket] - NSE bucket name
 * @param {boolean} [options.enrich=true] - Whether to enrich with P/E + delivery + 1W
 * @returns {Promise<{ rows: Object[], timestamp: string|null, bucket: string, count: number }>}
 */
const getTopGainers = async ({ count, bucket = 'allSec', enrich = true } = {}) => {
  const resolvedCount = Math.min(Math.max(parseInt(count, 10) || DEFAULT_COUNT, 1), MAX_COUNT);
  const cacheKey = `${bucket}:${resolvedCount}:${enrich ? 1 : 0}`;

  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.payload;
  }

  const variations = await getLiveVariations('gainers');
  const { rows, timestamp, bucket: resolvedBucket } = selectRows(variations, bucket, resolvedCount);

  if (enrich && rows.length > 0) {
    const tasks = rows.map((row) => async () => {
      const [quoteMetrics, history, retailHoldingPercent] = await Promise.all([
        fetchQuoteMetrics(row.symbol, row.price),
        fetchHistoryMetrics(row.symbol),
        fetchRetailHolding(row.symbol),
      ]);
      row.pe = quoteMetrics.pe;
      row.marketCapCr = quoteMetrics.marketCapCr;
      // Prefer today's live delivery % from quote-equity; fall back to T-1 from history
      row.deliveryPercent = quoteMetrics.deliveryPercent ?? history.deliveryPercent;
      row.avgDeliveryPercent30d = history.avgDeliveryPercent30d;
      row.weekChangePercent = history.weekChangePercent;
      row.retailHoldingPercent = retailHoldingPercent;
    });
    await mapWithConcurrency(tasks, ENRICH_CONCURRENCY);
  }

  const payload = { rows, timestamp, bucket: resolvedBucket, count: rows.length };
  cache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, payload });
  return payload;
};

/** Clear the in-memory cache (used by tests). */
const clearTopGainersCache = () => cache.clear();

module.exports = {
  getTopGainers,
  clearTopGainersCache,
  // exported for tests
  selectRows,
  mapBaseRow,
  mapWithConcurrency,
  BUCKETS,
};
