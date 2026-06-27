/**
 * Live quote enrichment — price, volume, delivery, and order-log (bids/offers)
 * for a batch of NSE symbols.
 *
 * Wraps getSymbolData with bounded concurrency and a short TTL cache so
 * repeated calls within a refresh cycle don't hammer NSE.
 *
 * @module services/liveQuotes
 */

const { getSymbolData } = require('../api/nseIndiaApi');

const CACHE_TTL_MS = 20 * 1000;
const CONCURRENCY = 6;

/** @type {Map<string, { expires: number, data: Object }>} */
const cache = new Map();

const toNumber = (v) => {
  if (v === null || v === undefined || v === '' || v === '-') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/**
 * Count populated levels in an order-book side (each entry has a non-zero price).
 * NSE marketDeptOrderBook.buy / .sell are arrays of { price, quantity, numberOfOrders }.
 * @param {Array|undefined} levels
 * @returns {number}
 */
const countOrderLevels = (levels) => {
  if (!Array.isArray(levels)) return 0;
  return levels.filter((l) => toNumber(l?.price) > 0).length;
};

/**
 * Sum total quantity across populated order-book levels.
 * @param {Array|undefined} levels
 * @returns {number|null}
 */
const sumOrderQty = (levels) => {
  if (!Array.isArray(levels)) return null;
  let total = 0;
  let found = false;
  for (const l of levels) {
    const q = toNumber(l?.quantity);
    if (q != null) { total += q; found = true; }
  }
  return found ? total : null;
};

/**
 * Fetch live quote data for a single symbol.
 * @param {string} symbol - NSE symbol (e.g. "RELIANCE")
 * @returns {Promise<Object>}
 */
const fetchSymbolLiveData = async (symbol) => {
  const empty = {
    price: null,
    changePercent: null,
    volume: null,
    value: null,
    deliveryPercent: null,
    bidLevels: null,
    offerLevels: null,
    totalBidQty: null,
    totalOfferQty: null,
  };
  try {
    const data = await getSymbolData(symbol);
    if (!data) return empty;

    const orderBook = data.marketDeptOrderBook || {};
    const buyLevels = orderBook.buy;
    const sellLevels = orderBook.sell;

    // NSE also provides aggregate totals on the same object
    const bidQty = toNumber(orderBook.totalBuyQuantity) != null
      ? toNumber(orderBook.totalBuyQuantity)
      : sumOrderQty(buyLevels);
    const offerQty = toNumber(orderBook.totalSellQuantity) != null
      ? toNumber(orderBook.totalSellQuantity)
      : sumOrderQty(sellLevels);

    return {
      price: toNumber(data.tradeInfo?.lastPrice),
      changePercent: toNumber(data.metaData?.pChange),
      volume: toNumber(data.tradeInfo?.totalTradedVolume),
      value: toNumber(data.tradeInfo?.totalTradedValue),
      deliveryPercent: toNumber(data.tradeInfo?.deliveryToTradedQuantity),
      bidLevels: countOrderLevels(buyLevels),
      offerLevels: countOrderLevels(sellLevels),
      totalBidQty: bidQty,
      totalOfferQty: offerQty,
    };
  } catch {
    return empty;
  }
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
 * Fetch live quotes for a batch of NSE symbols with caching.
 * @param {string[]} symbols
 * @returns {Promise<Record<string, Object>>} symbol → live data
 */
const fetchLiveQuotes = async (symbols) => {
  if (!Array.isArray(symbols) || symbols.length === 0) return {};

  const now = Date.now();
  const toFetch = [];
  const result = {};

  for (const sym of symbols) {
    const cached = cache.get(sym);
    if (cached && cached.expires > now) {
      result[sym] = cached.data;
    } else {
      toFetch.push(sym);
    }
  }

  if (toFetch.length > 0) {
    const tasks = toFetch.map((sym) => async () => {
      const data = await fetchSymbolLiveData(sym);
      cache.set(sym, { expires: now + CACHE_TTL_MS, data });
      return { sym, data };
    });
    const fetched = await mapWithConcurrency(tasks, CONCURRENCY);
    for (const { sym, data } of fetched) {
      result[sym] = data;
    }
  }

  return result;
};

const clearLiveQuotesCache = () => cache.clear();

module.exports = {
  fetchLiveQuotes,
  clearLiveQuotesCache,
  mapWithConcurrency,
  countOrderLevels,
  sumOrderQty,
};
