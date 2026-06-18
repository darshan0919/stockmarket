/**
 * Top Gainers service — assembles an enriched gainers table from NSE live data.
 *
 * Base list (symbol, price, % day change, volume, traded value) comes from NSE's
 * `live-analysis-variations` endpoint. Each row is then enriched in parallel with
 * delivery % from quote-equity (today) + history (T-1 fallback + 30D avg + 1W change).
 * Fundamental metrics (Market Cap, P/E, PAT Growth TTM, Retail Holdings) are fetched
 * in a single batch from Stockscans. Results are cached briefly to avoid hammering
 * NSE on every page load.
 *
 * @module services/topGainers
 */

const {
  getLiveVariations,
  getSymbolData,
  getPriceVolumeDeliverable,
  formatDate,
} = require('../api/nseIndiaApi');
const { parseNseDateToObject } = require('../utils/nseHelpers');
const { fetchFundamentals } = require('./stockscansMetrics');

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
 * Fetch today's delivery % for a symbol from NSE quote-equity.
 * Returns null on failure; caller falls back to T-1 from history.
 * @param {string} symbol
 * @returns {Promise<number|null>}
 */
const fetchSymbolMetrics = async (symbol) => {
  const empty = { price: null, changePercent: null, volume: null, value: null, marketCapCr: null, deliveryPercent: null };
  try {
    const data = await getSymbolData(symbol);
    if (!data) return empty;
    const totalMarketCap = toNumber(data.tradeInfo?.totalMarketCap);
    return {
      price: toNumber(data.tradeInfo?.lastPrice),
      changePercent: toNumber(data.metaData?.pChange),
      volume: toNumber(data.tradeInfo?.totalTradedVolume),
      value: toNumber(data.tradeInfo?.totalTradedValue),
      marketCapCr: totalMarketCap != null ? totalMarketCap / 1e7 : null,
      deliveryPercent: toNumber(data.tradeInfo?.deliveryToTradedQuantity),
    };
  } catch {
    return empty;
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
  // NSE turnover is in rupees lakhs on this endpoint; convert to absolute rupees. Fall back to
  // volume x price (the spec's "volume x avg price") when turnover is unavailable.
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
    patGrowthTtm: null,
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
 * @param {'nse'|'bse'} [options.exchange='nse'] - Exchange segment
 * @returns {Promise<{ rows: Object[], timestamp: string|null, bucket: string, count: number, exchange: string }>}
 */
const getTopGainers = async ({
  count,
  bucket = 'allSec',
  enrich = true,
  exchange = 'nse',
} = {}) => {
  const resolvedCount = Math.min(Math.max(parseInt(count, 10) || DEFAULT_COUNT, 1), MAX_COUNT);
  const exchSeg = exchange === 'bse' ? 'bse' : '';
  const cacheKey = `${exchSeg || 'nse'}:${bucket}:${resolvedCount}:${enrich ? 1 : 0}`;

  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.payload;
  }

  const variations = await getLiveVariations('gainers', exchSeg);
  const { rows, timestamp, bucket: resolvedBucket } = selectRows(variations, bucket, resolvedCount);

  if (enrich && rows.length > 0) {
    // Batch-fetch fundamentals (Market Cap, P/E, PAT Growth TTM, Retail Holdings) from Stockscans
    const symbols = rows.map((r) => r.symbol);
    let batchMetrics = {};
    try { batchMetrics = await fetchFundamentals(symbols); } catch { /* best-effort */ }

    // Per-symbol: delivery % (today from quote-equity, T-1 fallback) + history
    const tasks = rows.map((row) => async () => {
      const [symbolMetrics, history] = await Promise.all([
        fetchSymbolMetrics(row.symbol),
        fetchHistoryMetrics(row.symbol),
      ]);
      const fm = batchMetrics[row.symbol] ?? {};
      // Live fields from getSymbolData override base row values
      if (symbolMetrics.price != null) row.price = symbolMetrics.price;
      if (symbolMetrics.changePercent != null) row.changePercent = symbolMetrics.changePercent;
      if (symbolMetrics.volume != null) row.volume = symbolMetrics.volume;
      if (symbolMetrics.value != null) row.value = symbolMetrics.value;
      // Market cap: prefer live NSE value, fall back to Stockscans
      row.marketCapCr = symbolMetrics.marketCapCr ?? fm.marketCapCr ?? null;
      row.pe = fm.pe ?? null;
      row.retailHoldingPercent = fm.retailHoldingsPercent ?? null;
      row.patGrowthTtm = fm.patGrowthTtm ?? null;
      // Prefer today's live delivery %; fall back to T-1 from history
      row.deliveryPercent = symbolMetrics.deliveryPercent ?? history.deliveryPercent;
      row.avgDeliveryPercent30d = history.avgDeliveryPercent30d;
      row.weekChangePercent = history.weekChangePercent;
    });
    await mapWithConcurrency(tasks, ENRICH_CONCURRENCY);
  }

  const payload = {
    rows,
    timestamp,
    bucket: resolvedBucket,
    count: rows.length,
    exchange: exchSeg || 'nse',
  };
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
