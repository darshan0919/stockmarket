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
 *   5. Price history + price-action signals          → StockscansClient.prices
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
const { stockscans, nse, bse } = require('@stock/api');
const { loadEnv, argValue } = require('./lib/env');
const { withDriveDataSync } = require('./lib/driveDataStore');

const OUTPUT_DIR = process.env.GAINERS_OUTPUT_DIR || path.join(process.cwd(), 'daily_gainers');
const SCRIP_CACHE_FILE =
  process.env.BSE_SCRIP_CACHE ||
  path.join(process.cwd(), 'delivery_cache', 'bse_scrip_codes.json');
const PRICE_HISTORY_CANDLES = 65;
const RATIOS_SCAN_ID = '7f7e2d4044f428e69254ce31';

const QUALITY_FILTERS = {
  min_market_cap_cr: 300,
  min_delivery_value_cr: 5,
  max_retail_holding_pct: 50,
  min_retail_stake_value_cr: 50,
};

const NOISE_KEYWORDS = [
  'closure of trading window', 'code of conduct', 'scrutinizer', 'regulation 47',
  'saksham niveshak', 'brsr', 'book closure', 'corrigendum', 'cut off date',
  'allotment of esop', 'allotment of esps', 'iepf', 'unclaimed dividend',
  'regulation 74', 'regulation 57', '100 day campaign',
];

const MATERIAL_KEYWORDS = [
  'order', 'contract', 'win', 'award', 'result', 'profit', 'revenue', 'pat',
  'fda', 'pli', 'capacity', 'expansion', 'merger', 'acquisition', 'demerger',
  'buyback', 'qip', 'preferential', 'warrant', 'stake', 'sast',
];

// ── Pure helpers (exported for parity tests) ──────────────────────────────────

/** round(x, n) — half-up (Python uses half-to-even; differs only on exact .5 ulps). */
function roundTo(x, n) {
  if (x === null || x === undefined || Number.isNaN(x)) return null;
  const f = 10 ** n;
  return Math.round(x * f) / f;
}

/** YYYYMM of the last month of the date's quarter. */
function quarterDate(d) {
  const end = { 0: '03', 1: '03', 2: '03', 3: '06', 4: '06', 5: '06', 6: '09', 7: '09', 8: '09', 9: '12', 10: '12', 11: '12' };
  return `${d.getUTCFullYear()}${end[d.getUTCMonth()]}`;
}

/** Most recent weekday strictly before `today`. */
function lastTradingDay(today) {
  const d = new Date(today.getTime());
  d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d;
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
    return_1d: toFloat(pick(raw, 'Returns 1D', 'return_1d', 'returnOneDay', '1DReturn', 'priceChangePct')),
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
  const pctAboveSupport = supportLevel ? roundTo(((cp - supportLevel) / supportLevel) * 100, 2) : null;

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
  };
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
        reasons.push(`retail_stake_value ${stake.toFixed(0)} Cr < ${f.min_retail_stake_value_cr} Cr`);
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

// ── BSE scrip cache (disk) ────────────────────────────────────────────────────
function loadScripCache() {
  try {
    if (fs.existsSync(SCRIP_CACHE_FILE)) return JSON.parse(fs.readFileSync(SCRIP_CACHE_FILE, 'utf8'));
  } catch { /* ignore */ }
  return {};
}
function saveScripCache(cache) {
  fs.mkdirSync(path.dirname(SCRIP_CACHE_FILE), { recursive: true });
  fs.writeFileSync(SCRIP_CACHE_FILE, JSON.stringify(cache, null, 2));
}

// ── API-bound steps (delegate to @stock/api) ──────────────────────────────────

async function fetchTopGainers(client = stockscans) {
  const payload = {
    ratiosType: 'Default',
    timePeriod: 'Latest',
    scan: {
      filters: [{ left: 'Market Capitalization', right: '300', sign: '>=' }],
      index: [], industry: [], sector: [], tags: [],
      scanName: 'Top 50 Gainers', scanDescription: '', watchlistIds: [],
    },
    watchlistIds: [], order: 'desc', orderBy: 'Returns 1D', offset: 0,
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
  return companies.slice(0, 50);
}

async function fetchRetailHoldings(tickers, client = stockscans) {
  const result = Object.fromEntries(tickers.map((t) => [t, null]));
  if (tickers.length === 0) return result;
  const payload = {
    ratiosType: 'Ratios', timePeriod: 'Latest',
    scan: {
      scanId: RATIOS_SCAN_ID,
      filters: [{ left: 'Retail Holdings', sign: '>=', right: '-999999' }],
      index: [], industry: [], sector: [], tags: [], watchlistIds: [],
      companyIds: tickers, alertFrequency: null,
    },
    watchlistIds: [], order: 'desc', orderBy: 'Returns 1D', offset: 0,
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
        out[ticker] = sd ? deriveNseDelivery(sd) : { available: false, source: 'nse_api', error: 'no data' };
      } else if (ticker.startsWith('BSE:')) {
        const sym = ticker.slice(4).toUpperCase();
        let scrip = cache[sym];
        if (!scrip) {
          scrip = await bseClient.getScripCode(sym);
          if (scrip) { cache[sym] = scrip; cacheDirty = true; }
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
  if (cacheDirty) saveScripCache(cache);
  return out;
}

async function fetchPrices(ticker, client = stockscans) {
  try {
    const raw = await client.prices(ticker);
    let candles = Array.isArray(raw) ? raw : raw.prices || raw.data || raw.candles || [];
    if (candles.length && Array.isArray(candles[0])) {
      candles = candles.map((c) => ({
        date: c[0], open: c[1], high: c[2], low: c[3], close: c[4],
        volume: c.length > 5 ? c[5] : null,
      }));
    }
    return candles.slice(-PRICE_HISTORY_CANDLES);
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

/** Fetch last 7 days of announcements for all tickers (paginated). → { ticker: [ann] } */
async function fetchAnnouncementsBatch(tickers, marketDate, client = stockscans, sleep = defaultSleep) {
  const qdate = quarterDate(marketDate);
  const cutoffMs = announcementCutoffMs(marketDate);
  const results = Object.fromEntries(tickers.map((t) => [t, []]));
  let offset = 0;
  let pageSize = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const payload = {
      scan: {
        scanId: '04706a679c7508e4b17f9565',
        scanName: 'Gainers Announcements',
        filters: [], industry: [], index: [], watchlistIds: [], searchFilters: [],
        announcementType: 'All', alerts: false, searchMode: 'full',
        companyIds: tickers, companyFilters: [],
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
    const page = data && typeof data === 'object' && !Array.isArray(data) ? data.announcements || [] : data || [];
    if (!page.length) break;
    if (pageSize === null) pageSize = page.length;

    let done = false;
    for (const ann of page) {
      const createdStr = ann.createdAt || ann.date || '';
      const createdMs = parseCreatedMs(createdStr);
      if (createdMs !== null && createdMs < cutoffMs) { done = true; break; }
      const annTicker = ann.companyId || ann.ticker || '';
      if (annTicker in results) {
        results[annTicker].push({
          date: String(createdStr || '').slice(0, 10),
          subject: String(ann.subject || ann.title || '').slice(0, 200),
          category: ann.category || ann.announcementType || '',
          description: String(ann.description || '').slice(0, 400),
          ssUrl: ann.ssUrl || ann.fileUrl || '',
        });
      }
    }
    if (done || page.length < (pageSize || 1)) break;
    offset += page.length;
    await sleep(300);
  }
  return results;
}

async function fetchIndustryScan(industry, client = stockscans) {
  const payload = {
    ratiosType: 'Default', timePeriod: 'Latest',
    scan: {
      filters: [], index: [], industry: [industry], sector: [], tags: [],
      scanName: industry, scanDescription: '', watchlistIds: [],
    },
    watchlistIds: [], order: 'desc', orderBy: 'Market Capitalization', offset: 0,
  };
  const data = await client.runScan(payload);
  const companies = data.companies || data.data || (Array.isArray(data) ? data : []);
  return companies.map(normaliseGainer);
}

function hasMaterialAnnouncement(anns) {
  return anns.some((a) => {
    const text = `${a.subject} ${a.description}`.toLowerCase();
    return MATERIAL_KEYWORDS.some((kw) => text.includes(kw));
  });
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
} = {}) {
  const ss = clients.stockscans;
  const today = new Date();
  const mDate = marketDate || lastTradingDay(today);
  const runTs = istNowIso();
  const mDateStr = mDate.toISOString().slice(0, 10);
  log(`[gainers_scanner] market_date=${mDateStr}  run_ts=${runTs}\n`);

  // 1. Top 50 gainers
  log('[1/7] Fetching top 50 gainers …\n');
  const gainers = (await fetchTopGainers(ss)).map(normaliseGainer);
  log(`      → ${gainers.length} gainers\n`);
  const tickersAll = gainers.map((g) => g.ticker).filter(Boolean);

  // 1b. Retail holdings
  log('[1b/7] Fetching retail holdings …\n');
  const retailMap = await fetchRetailHoldings(tickersAll, ss);
  gainers.forEach((g) => { g.retail_holding_pct = retailMap[g.ticker]; });

  // 1c. Per-symbol delivery
  log('[1c/7] Fetching per-symbol delivery (NSE + BSE) …\n');
  const deliveryMapAll = await fetchDeliveryPerSymbol(gainers, { nseClient: clients.nse, bseClient: clients.bse });
  const nAvail = Object.values(deliveryMapAll).filter((d) => d.available).length;
  log(`      → delivery available for ${nAvail}/${gainers.length}\n`);

  // 1d. Quality filters
  const { passed: gainersFiltered, excluded: gainersExcluded } = applyQualityFilters(gainers, deliveryMapAll);
  log(`      → ${gainersFiltered.length} passed, ${gainersExcluded.length} excluded\n`);
  const tickers = gainersFiltered.map((g) => g.ticker).filter(Boolean);

  // 2. Announcements
  log('[2/7] Fetching 7-day announcements …\n');
  let annMap = await fetchAnnouncementsBatch(tickers, mDate, ss, sleep);
  annMap = Object.fromEntries(Object.entries(annMap).map(([t, a]) => [t, filterNoise(a)]));

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
        companies: companies.map((c) => ({ ticker: c.ticker, name: c.name, return_1d: c.return_1d, market_cap: c.market_cap_cr })),
        breadth: sectorBreadth(companies),
        gainer_tickers: indTickers,
      };
    } catch (e) {
      sectorScans[ind] = { error: e.message, gainer_tickers: indTickers };
    }
    await sleep(400);
  }

  // 5. Price history + signals
  log('[5/7] Fetching price histories …\n');
  const enriched = [];
  for (const g of gainersFiltered) {
    const candles = await fetchPrices(g.ticker, ss);
    const paSigs = priceActionSignals(candles);
    const delivery = deliveryMapAll[g.ticker] || {};
    const annRaw = annMap[g.ticker] || [];
    enriched.push({
      ticker: g.ticker, name: g.name, industry: g.industry, sector: g.sector,
      return_1d: g.return_1d, market_cap_cr: g.market_cap_cr, close_price: g.close_price,
      retail_holding_pct: g.retail_holding_pct, delivery_value_cr: g.delivery_value_cr,
      announcements: annRaw, ann_count: annRaw.length, has_material_ann: hasMaterialAnnouncement(annRaw),
      price_signals: paSigs,
      delivery: {
        available: delivery.available || false, source: delivery.source, deliv_per: delivery.deliv_per,
        trd_qty: delivery.trd_qty, deliv_qty: delivery.deliv_qty, trd_value_cr: delivery.trd_value_cr,
        deliv_value_cr: delivery.deliv_value_cr, high_delivery: delivery.high_delivery, scrip_code: delivery.scrip_code,
      },
      sector_breadth: (sectorScans[g.industry] || {}).breadth || {},
      sector_broad_move: ((sectorScans[g.industry] || {}).breadth || {}).broad_move || false,
    });
    await sleep(200);
  }

  // 6. Industry summary
  const industrySummary = {};
  for (const [ind, scan] of Object.entries(sectorScans)) {
    industrySummary[ind] = {
      gainer_count: (scan.gainer_tickers || []).length,
      gainer_tickers: scan.gainer_tickers || [],
      breadth: scan.breadth || {},
    };
  }

  const output = {
    schema_version: '2.0',
    market_date: mDateStr,
    run_at_ist: runTs,
    delivery_available: nAvail > 0,
    quality_filter: {
      rules: QUALITY_FILTERS, raw_count: gainers.length,
      passed_count: enriched.length, excluded_count: gainersExcluded.length,
    },
    total_gainers: enriched.length,
    gainers: enriched,
    excluded_by_quality_filter: gainersExcluded.map((g) => ({
      ticker: g.ticker, name: g.name, return_1d: g.return_1d, market_cap_cr: g.market_cap_cr,
      retail_holding_pct: g.retail_holding_pct, delivery_value_cr: g.delivery_value_cr,
      exclusion_reasons: g.exclusion_reasons || [],
    })),
    industry_summary: industrySummary,
  };

  // 7. Write + stdout
  fs.mkdirSync(outputDir, { recursive: true });
  const outPath = path.join(outputDir, `${mDateStr}_gainers_raw.json`);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  log(`[gainers_scanner] Written → ${outPath}\n`);
  return output;
}

module.exports = {
  main,
  // pure
  roundTo, quarterDate, lastTradingDay, normaliseGainer, filterNoise, sectorBreadth,
  priceActionSignals, applyQualityFilters, deriveNseDelivery, deriveBseDelivery, mapLimit,
  parseCreatedMs, announcementCutoffMs, hasMaterialAnnouncement,
  // api-bound
  fetchTopGainers, fetchRetailHoldings, fetchDeliveryPerSymbol, fetchPrices,
  fetchAnnouncementsBatch, fetchIndustryScan,
  // constants
  QUALITY_FILTERS, NOISE_KEYWORDS, MATERIAL_KEYWORDS, PRICE_HISTORY_CANDLES,
};

if (require.main === module) {
  loadEnv(argValue('--env-file'));
  withDriveDataSync('gainersScanner', async () => {
    const dateArg = argValue('--date');
    const marketDate = dateArg ? new Date(`${dateArg}T00:00:00Z`) : undefined;
    const output = await main({ marketDate });
    process.stdout.write(JSON.stringify(output));
  }).catch((e) => { console.error(e.message); process.exit(1); });
}
