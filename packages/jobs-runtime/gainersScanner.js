#!/usr/bin/env node
'use strict';

/**
 * gainersScanner.js — Node port of gainers_scanner.py (task: daily-gainers-signal).
 *
 * Pre-computes all deterministic inputs for the daily gainers prompt:
 *   1. Top 50 gainers (Stockscans scan)              → @stock/api StockscansClient
 *   2. Quality filters (mcap / delivery / retail)
 *   3. 7-day announcements (batched)
 *   4. Industry-breadth scans
 *   5. Price history + price-action signals          → StockscansClient.ohlcv(tf=1h)
 *   6. Per-symbol delivery: NSE live + BSE position   → NseClient / BseClient
 *   7. Write daily_gainers/{date}_gainers_raw.json and print JSON to stdout
 *
 * The inlined NSE/BSE/Stockscans HTTP that the Python carried is gone — all upstream
 * access now goes through @stock/api (Stockscans = fundamentals/prices; NSE/BSE =
 * price-action delivery). Behaviour is preserved; pure analytics are byte-parity
 * with the Python on non-boundary inputs (see rounding note below).
 *
 * Usage: node gainersScanner.js [--date YYYY-MM-DD] [--env-file <path>]
 */

const fs = require('fs');
const path = require('path');
const { stockscans, nse, bse, S3_BASE_URL } = require('@stock/api');
const taxonomy = require('./lib/announcementTaxonomy');
const { loadEnv, argValue } = require('./lib/env');
const StorageService = require('@stock/cloud-utils').StorageService;
const { sendHtmlEmail } = require('@stock/cloud-utils');
const dbV2 = require('./lib/db');

// Data Ecosystem v2: raw scans → data/runs/, scrip cache → data/cache/ (both
// via StorageService); classified signals → events collection (gainersClassifier).
const OUTPUT_DIR = path.join(dbV2.dataRoot(), 'runs');
const PRICE_HISTORY_CANDLES = 65;
const RATIOS_SCAN_ID = '7f7e2d4044f428e69254ce31';
// Size of the gainers universe pulled each run. Override via `--top-n <n>` (see main()
// below) — e.g. a one-off "top 100 gainers" ask no longer needs a new script.
const DEFAULT_TOP_N = 50;

const QUALITY_FILTERS = {
  min_market_cap_cr: 300,
  min_delivery_value_cr: 5,
  max_retail_holding_pct: 50,
  min_retail_stake_value_cr: 50,
};

const NOISE_KEYWORDS = [
  'closure of trading window',
  'code of conduct',
  'scrutinizer',
  'regulation 47',
  'saksham niveshak',
  'brsr',
  'book closure',
  'corrigendum',
  'cut off date',
  'allotment of esop',
  'allotment of esps',
  'iepf',
  'unclaimed dividend',
  'regulation 74',
  'regulation 57',
  '100 day campaign',
];

// Materiality is no longer a flat keyword list local to this file — it comes from
// lib/announcementTaxonomy.js, which both this scanner and watchlistInsights.js
// share. See that module for why the old boolean was replaced by a
// STRONG/SUPPORTING/ROUTINE strength.

// Delivery thresholds. `high_delivery` (≥50%) is the classic "most of today's
// volume was actually delivered, not intraday churn" flag. DECENT_DELIVERY_PCT is
// the lower bar used for the sector-cluster test: a cluster is only interesting if
// its members are being bought with conviction, not just gapping together.
const HIGH_DELIVERY_PCT = 50;
const DECENT_DELIVERY_PCT = 40;

// ── Pure helpers (exported for parity tests) ──────────────────────────────────

/** round(x, n) — half-up (Python uses half-to-even; differs only on exact .5 ulps). */
function roundTo(x, n) {
  if (x === null || x === undefined || Number.isNaN(x)) return null;
  const f = 10 ** n;
  return Math.round(x * f) / f;
}

/** YYYYMM of the last month of the date's quarter. */
function quarterDate(d) {
  const end = {
    0: '03',
    1: '03',
    2: '03',
    3: '06',
    4: '06',
    5: '06',
    6: '09',
    7: '09',
    8: '09',
    9: '12',
    10: '12',
    11: '12',
  };
  return `${d.getUTCFullYear()}${end[d.getUTCMonth()]}`;
}

/** Most recent weekday strictly before `today`. */
function lastTradingDay(today) {
  const d = new Date(today.getTime());
  d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

/**
 * "Today" as an IST calendar date (returned as a UTC-midnight Date, same shape
 * `--date YYYY-MM-DD` produces) — NOT `new Date()`'s UTC calendar day. The market
 * runs on IST; using the raw UTC day is wrong for ~5.5 hours of every day (any run
 * between 18:30 and 23:59 UTC is already past midnight IST), which silently
 * resolves `lastTradingDay` one day too far back.
 */
function istToday(now = new Date()) {
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

function pick(raw, ...keys) {
  for (const k of keys) {
    const v = raw[k];
    if (v !== undefined && v !== null) return v;
  }
  return null;
}

function toFloat(v, dflt = 0) {
  const n = parseFloat(v);
  return Number.isNaN(n) ? dflt : n;
}

/** Extract canonical fields from a scan row regardless of key casing. */
function normaliseGainer(raw) {
  const ticker = String(
    pick(raw, 'companyId', 'ticker', 'nse_code', 'symbol', 'Ticker', 'NSE Code') || ''
  ).trim();
  return {
    ticker,
    company_id: ticker,
    name: pick(raw, 'Name', 'name', 'company_name', 'companyName') || ticker,
    industry: pick(raw, 'Industry', 'industry', 'industryName') || 'Unknown',
    sector: pick(raw, 'Sector', 'sector', 'sectorName') || 'Unknown',
    return_1d: toFloat(
      pick(raw, 'Returns 1D', 'return_1d', 'returnOneDay', '1DReturn', 'priceChangePct')
    ),
    market_cap_cr: toFloat(pick(raw, 'Market Capitalization', 'market_cap', 'marketCap', 'mcap')),
    close_price: toFloat(pick(raw, 'Close', 'close', 'lastPrice', 'price')),
    raw,
  };
}

function filterNoise(anns) {
  return anns.filter((a) => {
    const combined = `${a.subject} ${a.description}`.toLowerCase();
    return !NOISE_KEYWORDS.some((kw) => combined.includes(kw));
  });
}

function sectorBreadth(companies) {
  const rets = companies.map((c) => c.return_1d).filter((r) => r !== null && r !== undefined);
  if (rets.length === 0) return {};
  const up = rets.filter((r) => r > 0.5).length;
  const down = rets.filter((r) => r < -0.5).length;
  const avg = roundTo(rets.reduce((s, r) => s + r, 0) / rets.length, 2);
  return {
    total: rets.length,
    up_count: up,
    down_count: down,
    pct_up: roundTo((up / rets.length) * 100, 1),
    avg_return_1d: avg,
    broad_move: up / rets.length >= 0.5,
  };
}

/** Compute price-action metrics from OHLCV candles (list-of-dicts). */
function priceActionSignals(candles) {
  if (!candles || candles.length === 0) return { error: 'no data' };
  if (candles[0]._error) return { error: candles[0]._error };

  const fnum = (c, ...keys) => {
    for (const k of keys) {
      const v = c[k];
      if (v !== undefined && v !== null) {
        const n = parseFloat(v);
        if (!Number.isNaN(n)) return n;
      }
    }
    return null;
  };
  const closes = candles.map((c) => fnum(c, 'close', 'c', 'Close')).filter(Boolean);
  const volumes = candles.map((c) => fnum(c, 'volume', 'v', 'Volume')).filter(Boolean);
  const highs = candles.map((c) => fnum(c, 'high', 'h', 'High')).filter(Boolean);
  const lows = candles.map((c) => fnum(c, 'low', 'l', 'Low')).filter(Boolean);
  if (closes.length === 0) return { error: 'empty candles' };

  const cp = closes[closes.length - 1];
  const prev = closes.length >= 2 ? closes[closes.length - 2] : null;
  const h52 = highs.length ? Math.max(...highs) : null;
  const l52 = lows.length ? Math.min(...lows) : null;
  const pctFromHigh = h52 ? roundTo(((cp - h52) / h52) * 100, 2) : null;
  const pctFromLow = l52 ? roundTo(((cp - l52) / l52) * 100, 2) : null;
  const nearBreakout = pctFromHigh !== null && Math.abs(pctFromHigh) <= 2.0;

  const vols20 = volumes.length >= 21 ? volumes.slice(-21, -1) : volumes.slice(0, -1);
  const avgVol = vols20.length ? vols20.reduce((s, v) => s + v, 0) / vols20.length : null;
  const todayV = volumes.length ? volumes[volumes.length - 1] : null;
  const volSpike = avgVol && todayV ? roundTo(todayV / avgVol, 2) : null;

  const closes20 = closes.slice(-20);
  const h20 = Math.max(...closes20);
  const l20 = Math.min(...closes20);
  const pctInRange20 = h20 !== l20 ? roundTo(((cp - l20) / (h20 - l20)) * 100, 1) : 50.0;

  const supportCandidates = lows.length ? [...lows.slice(-10)].sort((a, b) => a - b) : [];
  const supportLevel = supportCandidates.length ? roundTo(supportCandidates[0], 2) : null;
  const pctAboveSupport = supportLevel
    ? roundTo(((cp - supportLevel) / supportLevel) * 100, 2)
    : null;

  // Long-MA trend. The candle window is PRICE_HISTORY_CANDLES (65) sessions, so a
  // true 200-DMA isn't computable here; we use the longest MA the window supports
  // and name the field for what it actually is (`above_long_ma` / `long_ma_days`)
  // rather than mislabelling a 60-day mean as a 200-DMA.
  const longMaDays = Math.min(60, closes.length);
  const longMa = longMaDays
    ? closes.slice(-longMaDays).reduce((s, c) => s + c, 0) / longMaDays
    : null;

  // Wilder RSI(14) over closes. Reported so the classifier can flag exhaustion —
  // a +12% day on RSI 85 is a very different proposition from one on RSI 55.
  const rsi = computeRsi(closes, 14);

  return {
    close: roundTo(cp, 2),
    prev_close: prev ? roundTo(prev, 2) : null,
    high_in_window: h52 ? roundTo(h52, 2) : null,
    low_in_window: l52 ? roundTo(l52, 2) : null,
    pct_from_window_high: pctFromHigh,
    pct_from_window_low: pctFromLow,
    near_high_breakout: nearBreakout,
    vol_spike_ratio: volSpike,
    pct_in_20d_range: pctInRange20,
    support_level_10d: supportLevel,
    pct_above_support: pctAboveSupport,
    candle_window_days: closes.length,
    // ── Derived booleans consumed by gainersClassifier ────────────────────────
    // These exist because the classifier was written against `vol_spike`,
    // `breakout_52w`, `above_200dma` and `rsi` — fields this function never
    // emitted, so EVERY price-action evidence line and the whole PRICE_ACTION
    // scoring branch silently evaluated to false. Emitting them here (rather than
    // recomputing in the classifier) keeps one definition of each signal.
    vol_spike: volSpike !== null && volSpike >= 2.0,
    vol_ratio: volSpike,
    breakout_52w: nearBreakout,
    long_ma: longMa !== null ? roundTo(longMa, 2) : null,
    long_ma_days: longMaDays || null,
    above_long_ma: longMa !== null ? cp > longMa : null,
    rsi,
  };
}

/** Wilder's RSI. Returns null when there aren't enough closes for a full period. */
function computeRsi(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i += 1) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return roundTo(100 - 100 / (1 + rs), 1);
}

/** Apply the four StockTable quality filters. Returns { passed, excluded }. */
function applyQualityFilters(gainers, deliveryMap) {
  const f = QUALITY_FILTERS;
  const passed = [];
  const excluded = [];
  for (const g of gainers) {
    const reasons = [];
    const deliv = deliveryMap[g.ticker] || {};
    const mcap = g.market_cap_cr;
    const retail = g.retail_holding_pct;
    const dvc = deliv.deliv_value_cr;
    g.delivery_value_cr = dvc !== null && dvc !== undefined ? roundTo(dvc, 2) : null;

    if (mcap !== null && mcap !== undefined && mcap < f.min_market_cap_cr) {
      reasons.push(`mcap ${mcap.toFixed(0)} Cr < ${f.min_market_cap_cr} Cr`);
    }
    if (dvc !== null && dvc !== undefined && dvc < f.min_delivery_value_cr) {
      reasons.push(`delivery_value ${dvc.toFixed(2)} Cr < ${f.min_delivery_value_cr} Cr`);
    }
    if (retail !== null && retail !== undefined && retail > f.max_retail_holding_pct) {
      reasons.push(`retail_holding ${retail.toFixed(1)}% > ${f.max_retail_holding_pct}%`);
    }
    if (mcap !== null && mcap !== undefined && retail !== null && retail !== undefined) {
      const stake = (mcap * retail) / 100;
      if (stake < f.min_retail_stake_value_cr) {
        reasons.push(
          `retail_stake_value ${stake.toFixed(0)} Cr < ${f.min_retail_stake_value_cr} Cr`
        );
      }
    }
    if (reasons.length) {
      g.exclusion_reasons = reasons;
      excluded.push(g);
    } else {
      passed.push(g);
    }
  }
  return { passed, excluded };
}

/** Derive NSE delivery dict from a getSymbolData() equityResponse object. */
function deriveNseDelivery(symbolData) {
  const ti = (symbolData && symbolData.tradeInfo) || {};
  const dper = toFloat(ti.deliveryToTradedQuantity);
  const trdQty = toFloat(ti.totalTradedVolume);
  const delivQty = Math.round((trdQty * dper) / 100);
  const trdValCr = toFloat(ti.totalTradedValue) / 1e7;
  const delivValCr = roundTo((trdValCr * dper) / 100, 2);
  return {
    available: true,
    source: 'nse_api',
    deliv_per: roundTo(dper, 2),
    trd_qty: trdQty,
    deliv_qty: delivQty,
    trd_value_cr: roundTo(trdValCr, 2),
    deliv_value_cr: delivValCr,
    high_delivery: dper >= 50,
  };
}

/** Derive BSE delivery dict from getSecurityPosition() + close price. */
function deriveBseDelivery(pos, closePrice, scripCode) {
  const dper = pos.deliveryPct;
  const trdQty = pos.qtyTraded;
  const delivQty = pos.deliverableQty;
  return {
    available: true,
    source: 'bse_api',
    scrip_code: scripCode,
    deliv_per: roundTo(dper, 2),
    trd_qty: trdQty,
    deliv_qty: delivQty,
    trd_value_cr: closePrice ? roundTo((trdQty * closePrice) / 1e7, 2) : null,
    deliv_value_cr: closePrice ? roundTo((delivQty * closePrice) / 1e7, 2) : null,
    high_delivery: dper >= 50,
  };
}

// ── Concurrency helper (no dependency) ────────────────────────────────────────
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

// ── BSE scrip cache (data/cache — regenerable derivable) ─────────────────────
function loadScripCache() {
  try {
    const data = StorageService.readJson('cache/bse-scrip-codes.json');
    if (data) return data;
  } catch {
    /* ignore */
  }
  return {};
}
async function saveScripCache(cache) {
  StorageService.init();
  await StorageService.saveJson('cache/bse-scrip-codes.json', cache);
}

// ── API-bound steps (delegate to @stock/api) ──────────────────────────────────

async function fetchTopGainers(client = stockscans, topN = DEFAULT_TOP_N) {
  const payload = {
    ratiosType: 'Default',
    timePeriod: 'Latest',
    scan: {
      filters: [{ left: 'Market Capitalization', right: '300', sign: '>=' }],
      index: [],
      industry: [],
      sector: [],
      tags: [],
      scanName: `Top ${topN} Gainers`,
      scanDescription: '',
      watchlistIds: [],
    },
    watchlistIds: [],
    order: 'desc',
    orderBy: 'Returns 1D',
    offset: 0,
  };
  const data = await client.runScan(payload);
  let companies;
  if (data.table) {
    const table = data.table;
    if (table.length < 2) return [];
    const headers = table[0];
    companies = table.slice(1).map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
  } else {
    companies = data.companies || data.data || (Array.isArray(data) ? data : []);
  }
  return companies.slice(0, topN);
}

async function fetchRetailHoldings(tickers, client = stockscans) {
  const result = Object.fromEntries(tickers.map((t) => [t, null]));
  if (tickers.length === 0) return result;
  const payload = {
    ratiosType: 'Ratios',
    timePeriod: 'Latest',
    scan: {
      scanId: RATIOS_SCAN_ID,
      filters: [{ left: 'Retail Holdings', sign: '>=', right: '-999999' }],
      index: [],
      industry: [],
      sector: [],
      tags: [],
      watchlistIds: [],
      companyIds: tickers,
      alertFrequency: null,
    },
    watchlistIds: [],
    order: 'desc',
    orderBy: 'Returns 1D',
    offset: 0,
  };
  try {
    const data = await client.runScan(payload);
    const table = data.table;
    if (!Array.isArray(table) || table.length < 2) return result;
    const cidIdx = table[0].indexOf('companyId');
    const retailIdx = table[0].indexOf('Retail Holdings');
    if (cidIdx < 0 || retailIdx < 0) return result;
    for (const row of table.slice(1)) {
      const ticker = row[cidIdx];
      if (!ticker || !(ticker in result)) continue;
      const val = row[retailIdx];
      result[ticker] = val === null || val === '' || val === '-' ? null : toFloat(val, null);
    }
  } catch (e) {
    process.stderr.write(`[WARN] fetchRetailHoldings failed: ${e.message}\n`);
  }
  return result;
}

/** Delivery for all gainers (concurrent): NSE→getSymbolData, BSE→securityPosition. */
async function fetchDeliveryPerSymbol(gainers, { nseClient = nse, bseClient = bse } = {}) {
  const cache = loadScripCache();
  let cacheDirty = false;
  const out = {};
  await mapLimit(gainers, 8, async (g) => {
    const ticker = g.ticker;
    const close = g.close_price || 0;
    try {
      if (ticker.startsWith('NSE:')) {
        const sd = await nseClient.getSymbolData(ticker.slice(4));
        out[ticker] = sd
          ? deriveNseDelivery(sd)
          : { available: false, source: 'nse_api', error: 'no data' };
      } else if (ticker.startsWith('BSE:')) {
        const sym = ticker.slice(4).toUpperCase();
        let scrip = cache[sym];
        if (!scrip) {
          scrip = await bseClient.getScripCode(sym);
          if (scrip) {
            cache[sym] = scrip;
            cacheDirty = true;
          }
        }
        if (!scrip) {
          out[ticker] = { available: false, source: 'bse_api', error: 'scrip code not found' };
        } else {
          const pos = await bseClient.getSecurityPosition(scrip);
          out[ticker] = pos
            ? deriveBseDelivery(pos, close, scrip)
            : { available: false, source: 'bse_api', scrip_code: scrip, error: 'no data' };
        }
      } else {
        out[ticker] = { available: false, source: 'unknown' };
      }
    } catch (e) {
      out[ticker] = { available: false, error: e.message };
    }
  });
  if (cacheDirty) await saveScripCache(cache);
  return out;
}

/**
 * Aggregate intraday OHLCV rows ([isoTs, o, h, l, c, v]) into daily candles.
 * Rows are assumed ascending by timestamp, as the API returns them.
 */
function aggregateToDaily(rows) {
  const byDay = new Map();
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 5) continue;
    const day = String(r[0]).slice(0, 10);
    const [, o, h, l, c, v] = r;
    const cur = byDay.get(day);
    if (!cur) {
      byDay.set(day, { date: day, open: o, high: h, low: l, close: c, volume: v || 0 });
    } else {
      cur.high = Math.max(cur.high, h);
      cur.low = Math.min(cur.low, l);
      cur.close = c; // last bar of the day
      cur.volume += v || 0;
    }
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Daily candles for price-action signals.
 *
 * Uses `ohlcv(tf='1h')` and aggregates to daily rather than the older
 * `prices()` endpoint, which now 404s for every ticker — that outage had
 * silently disabled ALL price-action signals (breakouts, volume spikes,
 * trend) across the whole report. Note `tf='1d'` is rejected with HTTP 400 by
 * this API, so hourly-and-aggregate is the supported path, not a workaround
 * for convenience. One hourly page covers ~80 sessions, comfortably more than
 * the 65 we need, so no pagination is required.
 */
async function fetchPrices(ticker, client = stockscans) {
  try {
    const raw = await client.ohlcv(ticker, { tf: '1h' });
    const rows = (raw && raw.prices) || [];
    if (!rows.length) return [{ _error: 'no candles returned' }];
    const daily = aggregateToDaily(rows);
    if (!daily.length) return [{ _error: 'no daily candles after aggregation' }];
    return daily.slice(-PRICE_HISTORY_CANDLES);
  } catch (e) {
    return [{ _error: e.message }];
  }
}

/** Parse a Stockscans createdAt; naive timestamps are treated as IST. → epoch ms | null */
function parseCreatedMs(str) {
  if (!str) return null;
  let s = String(str).replace('Z', '+00:00').replace(' ', 'T');
  const hasTz = /[+-]\d{2}:\d{2}$/.test(s);
  if (!hasTz) s += '+05:30';
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/** Cutoff epoch ms = (marketDate - 7d) at 00:00 IST. */
function announcementCutoffMs(marketDate) {
  const y = marketDate.getUTCFullYear();
  const mo = marketDate.getUTCMonth();
  const d = marketDate.getUTCDate() - 7;
  return Date.UTC(y, mo, d, 0, 0, 0) - (5 * 60 + 30) * 60 * 1000;
}

/**
 * Fetch last 7 days of announcements for all tickers. → { ticker: [ann] }
 *
 * ── Why a throwaway watchlist ────────────────────────────────────────────────
 * The announcements endpoint IGNORES `scan.companyIds` — verified live: a request
 * naming only NSE:TCS and NSE:INFY comes back full of unrelated tickers. The old
 * implementation passed `companyIds` anyway and filtered client-side, which meant
 * it was paginating the ENTIRE market's announcements 30 rows at a time (with a
 * 300ms courtesy sleep between pages) just to find ~40 companies' filings. On a
 * busy 7-day window that is thousands of requests and many minutes — the single
 * biggest cost in this job.
 *
 * `watchlistIds` DOES filter server-side, and unlike `companyFilters` it has no
 * 10-company cap (see StockscansClient.createWatchlist). So we create one scratch
 * watchlist holding the whole universe, scan it in a handful of pages, and delete
 * it in a `finally` — this creates a REAL watchlist in the account, so the cleanup
 * is not optional.
 *
 * Falls back to the old market-wide sweep if the watchlist can't be created, since
 * a slow scan beats no announcements at all.
 */
async function fetchAnnouncementsBatch(
  tickers,
  marketDate,
  client = stockscans,
  sleep = defaultSleep,
  log = (m) => process.stderr.write(m)
) {
  if (!tickers.length) return {};
  let watchlistId = null;
  try {
    const wl = await client.createWatchlist(
      `_gainers_scan_${marketDate.toISOString().slice(0, 10)}_${Date.now()}`,
      tickers
    );
    watchlistId = wl && (wl.watchlistId || wl.id || (wl.watchlist && wl.watchlist.id));
    if (watchlistId)
      log(`      → scratch watchlist ${watchlistId} (${tickers.length} companies)\n`);
  } catch (e) {
    log(`[WARN] scratch watchlist creation failed (${e.message}) — falling back to full sweep\n`);
  }

  try {
    return await paginateAnnouncements(tickers, marketDate, client, sleep, watchlistId, log);
  } finally {
    if (watchlistId) {
      try {
        await client.deleteWatchlist(watchlistId);
        log(`      → scratch watchlist ${watchlistId} deleted\n`);
      } catch (e) {
        // Loud on purpose: a leaked watchlist is visible clutter in the user's
        // real account and will accumulate one per run if this keeps failing.
        log(`[WARN] failed to delete scratch watchlist ${watchlistId}: ${e.message}\n`);
      }
    }
  }
}

async function paginateAnnouncements(tickers, marketDate, client, sleep, watchlistId, log) {
  const qdate = quarterDate(marketDate);
  const cutoffMs = announcementCutoffMs(marketDate);
  const results = Object.fromEntries(tickers.map((t) => [t, []]));
  const wanted = new Set(tickers);
  let offset = 0;
  let pageSize = null;
  let pages = 0;
  // Safety valve for the fallback path only: without server-side filtering this
  // loop walks the whole market, so it needs a bound. Reaching it means the
  // announcements are incomplete, which the caller reports rather than hides.
  const MAX_PAGES = watchlistId ? 200 : 60;
  let truncated = false;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const payload = {
      scan: {
        scanId: '04706a679c7508e4b17f9565',
        scanName: 'Gainers Announcements',
        filters: [],
        industry: [],
        index: [],
        watchlistIds: watchlistId ? [watchlistId] : [],
        searchFilters: [],
        announcementType: 'All',
        alerts: false,
        searchMode: 'full',
        companyIds: watchlistId ? [] : tickers,
        companyFilters: [],
      },
      offset,
      quarterDate: qdate,
    };
    let data;
    try {
      data = await client.scanAnnouncements(payload);
    } catch (e) {
      process.stderr.write(`[WARN] announcements fetch failed (offset=${offset}): ${e.message}\n`);
      break;
    }
    const page =
      data && typeof data === 'object' && !Array.isArray(data)
        ? data.announcements || []
        : data || [];
    if (!page.length) break;
    if (pageSize === null) pageSize = page.length;
    pages += 1;

    let done = false;
    for (const ann of page) {
      const createdStr = ann.createdAt || ann.date || '';
      const createdMs = parseCreatedMs(createdStr);
      if (createdMs !== null && createdMs < cutoffMs) {
        done = true;
        break;
      }
      const annTicker = ann.companyId || ann.ticker || '';
      if (wanted.has(annTicker)) {
        const ssUrl = ann.ssUrl || ann.fileUrl || '';
        results[annTicker].push(
          // `annotate` stamps category_derived / strength / category_label from the
          // shared taxonomy. `pdfUrl` is the fully-qualified S3 link so the top-20
          // trigger-research step can feed it straight to
          // `watchlistInsights.js read-pdf` — without it that step would have to
          // re-derive the URL, which is how the two pipelines drifted before.
          taxonomy.annotate({
            date: String(createdStr || '').slice(0, 10),
            subject: String(ann.subject || ann.title || '').slice(0, 200),
            category: ann.category || ann.announcementType || '',
            description: String(ann.description || '').slice(0, 400),
            ssUrl,
            pdfUrl: ssUrl ? `${S3_BASE_URL}${ssUrl}` : '',
          })
        );
      }
    }
    if (done || page.length < (pageSize || 1)) break;
    if (pages >= MAX_PAGES) {
      truncated = true;
      log(
        `[WARN] announcements truncated at ${pages} pages (${watchlistId ? 'watchlist' : 'full-sweep fallback'}) — some filings may be missing\n`
      );
      break;
    }
    offset += page.length;
    await sleep(300);
  }
  log(`      → ${pages} announcement page(s)${truncated ? ' (TRUNCATED)' : ''}\n`);
  Object.defineProperty(results, '_meta', {
    value: { pages, truncated, serverFiltered: !!watchlistId },
    enumerable: false,
  });
  return results;
}

async function fetchIndustryScan(industry, client = stockscans) {
  const payload = {
    ratiosType: 'Default',
    timePeriod: 'Latest',
    scan: {
      filters: [],
      index: [],
      industry: [industry],
      sector: [],
      tags: [],
      scanName: industry,
      scanDescription: '',
      watchlistIds: [],
    },
    watchlistIds: [],
    order: 'desc',
    orderBy: 'Market Capitalization',
    offset: 0,
  };
  const data = await client.runScan(payload);
  const companies = data.companies || data.data || (Array.isArray(data) ? data : []);
  return companies.map(normaliseGainer);
}

function hasMaterialAnnouncement(anns) {
  // Retained for backward compatibility with consumers of the raw JSON, but it is
  // now derived from the shared taxonomy rather than a private keyword list.
  // Prefer `ann_strength` (STRONG/SUPPORTING/ROUTINE) — the boolean can't tell an
  // order win apart from a rating reaffirmation.
  return taxonomy.strongestOf(anns) === 'STRONG';
}

function defaultSleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function istNowIso(date = new Date()) {
  const ist = new Date(date.getTime() + (5 * 60 + 30) * 60 * 1000);
  return `${ist.toISOString().slice(0, 19)}+05:30`;
}

// ── Main orchestration (mirrors gainers_scanner.py main step-for-step) ─────────

async function main({
  marketDate,
  clients = { stockscans, nse, bse },
  outputDir = OUTPUT_DIR,
  sleep = defaultSleep,
  log = (m) => process.stderr.write(m),
  topN = DEFAULT_TOP_N,
} = {}) {
  const ss = clients.stockscans;
  const today = istToday();
  const mDate = marketDate || lastTradingDay(today);
  const runTs = istNowIso();
  const mDateStr = mDate.toISOString().slice(0, 10);
  log(`[gainers_scanner] market_date=${mDateStr}  run_ts=${runTs}\n`);

  // 0. Validate auth
  try {
    await ss.validateAuth();
  } catch (e) {
    log(`[ERROR] Auth validation failed: ${e.message}\n`);
    await sendHtmlEmail({
      subject: `Daily Gainers Signal - ❌ Auth Failed [${mDateStr}]`,
      htmlBody: `<p><b>Time:</b> ${runTs}</p><p><b>Error:</b> ${e.message}</p><p>Please update STOCKSCANS_AUTH_TOKEN in .env.</p>`,
    });
    throw e;
  }

  // 1. Top-N gainers
  log(`[1/7] Fetching top ${topN} gainers …\n`);
  const gainers = (await fetchTopGainers(ss, topN)).map(normaliseGainer);
  log(`      → ${gainers.length} gainers\n`);
  const tickersAll = gainers.map((g) => g.ticker).filter(Boolean);

  // 1b. Retail holdings
  log('[1b/7] Fetching retail holdings …\n');
  const retailMap = await fetchRetailHoldings(tickersAll, ss);
  gainers.forEach((g) => {
    g.retail_holding_pct = retailMap[g.ticker];
  });

  // 1c. Per-symbol delivery
  log('[1c/7] Fetching per-symbol delivery (NSE + BSE) …\n');
  const deliveryMapAll = await fetchDeliveryPerSymbol(gainers, {
    nseClient: clients.nse,
    bseClient: clients.bse,
  });
  const nAvail = Object.values(deliveryMapAll).filter((d) => d.available).length;
  log(`      → delivery available for ${nAvail}/${gainers.length}\n`);

  // 1d. Price histories — fetched BEFORE the quality filter on purpose.
  //
  // The gainers scan table carries no `Close` column, so `close_price` is 0 for
  // every row. BSE delivery VALUE is derived from a close price, so without one
  // it stayed null — and a null sailed straight through the `min_delivery_value_cr`
  // floor. Result: BSE micro-caps delivering ₹0.08 Cr were passing a ₹5 Cr filter
  // and consuming slots in the top-20 research budget. Fetching prices first gives
  // every BSE name a close, so the floor applies uniformly across both exchanges.
  // The candles are reused for price-action signals below — this is a reorder,
  // not an extra round of fetching.
  log('[1d/7] Fetching price histories …\n');
  const candlesByTicker = new Map(
    (await mapLimit(gainers, 8, async (g) => [g.ticker, await fetchPrices(g.ticker, ss)])).map(
      ([t, c]) => [t, c]
    )
  );
  const priceSignalsByTicker = new Map(
    [...candlesByTicker].map(([t, c]) => [t, priceActionSignals(c)])
  );
  const priceErrors = [...priceSignalsByTicker.values()].filter((p) => p.error).length;
  log(`      → price signals for ${gainers.length - priceErrors}/${gainers.length}\n`);

  // Backfill BSE delivery value/traded value now that a close price exists.
  for (const g of gainers) {
    const d = deliveryMapAll[g.ticker];
    if (!d || !d.available || d.source !== 'bse_api' || d.deliv_value_cr) continue;
    const ps = priceSignalsByTicker.get(g.ticker);
    const close = ps && !ps.error ? ps.close : null;
    if (!close) continue;
    g.close_price = close;
    if (d.deliv_qty) d.deliv_value_cr = roundTo((d.deliv_qty * close) / 1e7, 2);
    if (d.trd_qty) d.trd_value_cr = roundTo((d.trd_qty * close) / 1e7, 2);
  }

  // 1e. Quality filters
  const { passed: gainersFiltered, excluded: gainersExcluded } = applyQualityFilters(
    gainers,
    deliveryMapAll
  );
  log(`      → ${gainersFiltered.length} passed, ${gainersExcluded.length} excluded\n`);
  const tickers = gainersFiltered.map((g) => g.ticker).filter(Boolean);

  // 2. Announcements
  log('[2/7] Fetching 7-day announcements …\n');
  const annRawMap = await fetchAnnouncementsBatch(tickers, mDate, ss, sleep, log);
  const annMeta = annRawMap._meta || { pages: 0, truncated: false, serverFiltered: false };
  const annMap = Object.fromEntries(Object.entries(annRawMap).map(([t, a]) => [t, filterNoise(a)]));

  // 3. Industry clusters
  log('[3/7] Fetching industry scans …\n');
  const industryCounts = {};
  for (const g of gainersFiltered) {
    if (g.industry !== 'Unknown') (industryCounts[g.industry] ||= []).push(g.ticker);
  }
  const sectorScans = {};
  for (const [ind, indTickers] of Object.entries(industryCounts)) {
    try {
      const companies = await fetchIndustryScan(ind, ss);
      sectorScans[ind] = {
        companies: companies.map((c) => ({
          ticker: c.ticker,
          name: c.name,
          return_1d: c.return_1d,
          market_cap: c.market_cap_cr,
        })),
        breadth: sectorBreadth(companies),
        gainer_tickers: indTickers,
      };
    } catch (e) {
      sectorScans[ind] = { error: e.message, gainer_tickers: indTickers };
    }
    await sleep(400);
  }

  // 5. Price history + signals
  log('[5/7] Assembling signals …\n');
  const enriched = [];
  for (const g of gainersFiltered) {
    // Price signals were computed in step 1d — BEFORE the quality filter, so that
    // BSE delivery values exist in time to be filtered on. Reused here, not refetched.
    const paSigs = priceSignalsByTicker.get(g.ticker) || { error: 'not fetched' };
    const delivery = deliveryMapAll[g.ticker] || {};
    const annRaw = annMap[g.ticker] || [];

    enriched.push({
      ticker: g.ticker,
      name: g.name,
      industry: g.industry,
      sector: g.sector,
      return_1d: g.return_1d,
      market_cap_cr: g.market_cap_cr,
      close_price: g.close_price,
      retail_holding_pct: g.retail_holding_pct,
      delivery_value_cr: g.delivery_value_cr,
      announcements: annRaw,
      ann_count: annRaw.length,
      has_material_ann: hasMaterialAnnouncement(annRaw),
      // Strongest announcement category present in the 7-day window, plus the
      // categories themselves — this is what the classifier links to the price
      // action ("+9.4% on a STRONG order_book filing" vs "+9.4% on nothing").
      ann_strength: taxonomy.strongestOf(annRaw),
      ann_categories: [...new Set(annRaw.map((a) => a.category_derived).filter(Boolean))],
      strong_announcements: annRaw.filter((a) => a.strength === 'STRONG'),
      price_signals: paSigs,
      delivery: {
        available: delivery.available || false,
        source: delivery.source,
        deliv_per: delivery.deliv_per,
        trd_qty: delivery.trd_qty,
        deliv_qty: delivery.deliv_qty,
        trd_value_cr: delivery.trd_value_cr,
        deliv_value_cr: delivery.deliv_value_cr,
        high_delivery: delivery.high_delivery,
        scrip_code: delivery.scrip_code,
      },
      sector_breadth: (sectorScans[g.industry] || {}).breadth || {},
      sector_broad_move: ((sectorScans[g.industry] || {}).breadth || {}).broad_move || false,
    });
    // No sleep here any more — this loop is pure in-memory assembly now that the
    // fetching happens above via mapLimit. Rate-limiting belongs with the calls.
  }

  // 6. Industry summary
  //
  // `qualified_*` counts only cluster members whose move was actually
  // delivery-backed (deliv_per >= DECENT_DELIVERY_PCT). The user's rule is "3-4
  // stocks from the SAME sector doing this = super-strong" — but "this" means
  // gaining WITH decent delivery. Four names co-moving on intraday churn is a
  // sector-wide news pop or an index rebalance, not accumulation, and counting it
  // as super-strong is precisely how a signal report loses credibility.
  const byIndustry = {};
  for (const g of enriched) (byIndustry[g.industry] ||= []).push(g);

  const industrySummary = {};
  for (const [ind, scan] of Object.entries(sectorScans)) {
    const members = byIndustry[ind] || [];
    const qualified = members.filter((m) => {
      const d = m.delivery || {};
      return d.available && (d.deliv_per || 0) >= DECENT_DELIVERY_PCT;
    });
    industrySummary[ind] = {
      gainer_count: (scan.gainer_tickers || []).length,
      gainer_tickers: scan.gainer_tickers || [],
      qualified_count: qualified.length,
      qualified_tickers: qualified.map((m) => m.ticker),
      qualified_delivery_value_cr: roundTo(
        qualified.reduce((s, m) => s + ((m.delivery || {}).deliv_value_cr || 0), 0),
        2
      ),
      breadth: scan.breadth || {},
    };
  }

  const output = {
    schema_version: '2.0',
    market_date: mDateStr,
    run_at_ist: runTs,
    delivery_available: nAvail > 0,
    // Announcement coverage. `truncated: true` means the report must say
    // "announcements incomplete" rather than "no filings found" — those are very
    // different claims and conflating them is how a signal report misleads.
    announcements_meta: annMeta,
    quality_filter: {
      rules: QUALITY_FILTERS,
      raw_count: gainers.length,
      passed_count: enriched.length,
      excluded_count: gainersExcluded.length,
    },
    total_gainers: enriched.length,
    gainers: enriched,
    excluded_by_quality_filter: gainersExcluded.map((g) => ({
      ticker: g.ticker,
      name: g.name,
      return_1d: g.return_1d,
      market_cap_cr: g.market_cap_cr,
      retail_holding_pct: g.retail_holding_pct,
      delivery_value_cr: g.delivery_value_cr,
      exclusion_reasons: g.exclusion_reasons || [],
    })),
    industry_summary: industrySummary,
  };

  // 7. Write raw scan to runs/ (derivable — re-fetchable from APIs; classified
  // signals are the stored output, written by gainersClassifier → events).
  const dtoPaths = StorageService.getEventDtoPaths('gainers_raw', mDate);
  StorageService.init();
  await StorageService.saveJson(dtoPaths.jsonPath, output);
  log(`[gainers_scanner] Written → ${dtoPaths.jsonPath}\n`);
  return output;
}

module.exports = {
  main,
  // pure
  quarterDate,
  lastTradingDay,
  istToday,
  filterNoise,
  sectorBreadth,
  applyQualityFilters,
  deriveNseDelivery,
  deriveBseDelivery,
  priceActionSignals,
  computeRsi,
  hasMaterialAnnouncement,
  HIGH_DELIVERY_PCT,
  DECENT_DELIVERY_PCT,

  // api-bound

  fetchAnnouncementsBatch,
  aggregateToDaily,
  fetchPrices,
  fetchTopGainers,
  // constants
  DEFAULT_TOP_N,
};

if (require.main === module) {
  loadEnv(argValue('--env-file'));
  // v2: no wrap-around Drive sync — run `yarn data:push` (scripts/data.js) after the job.
  (async () => {
    const dateArg = argValue('--date');
    const marketDate = dateArg ? new Date(`${dateArg}T00:00:00Z`) : undefined;
    const topNArg = argValue('--top-n');
    const topN = topNArg ? Number(topNArg) : DEFAULT_TOP_N;
    if (!Number.isFinite(topN) || topN <= 0) {
      throw new Error(`--top-n must be a positive number, got "${topNArg}"`);
    }
    const output = await main({ marketDate, topN });
    process.stdout.write(JSON.stringify(output));
  })().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
