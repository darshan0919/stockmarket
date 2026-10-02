'use strict';

/**
 * Bulk filing scan — list every filing of given announcement types, for an
 * arbitrary (large) set of companies and release quarters, WITHOUT per-company
 * calls and without tripping Stockscans rate limits.
 *
 * Why this exists: `documents(companyId)` is one call per company and gets
 * 429-blocked after ~150 calls. `scans/announcement/search` with a throwaway
 * watchlist + `announcementType` returns ~30 rows per call for the whole
 * watchlist, so a 1,700-company × 8-quarter listing is hundreds of calls, not
 * tens of thousands. See `docs/BULK_FILING_SCAN.md`.
 *
 * Design: pure helpers + one orchestrator (`runBulkScan`) with an injected
 * client/sleep/clock so it is unit-testable with no network. All state is
 * keyed and passed explicitly (per-run `outDir`, per-unit keys) — no globals,
 * so concurrent runs against different outDirs cannot interfere.
 *
 * @module utils/bulkFilingScan
 */

const fs = require('fs');
const path = require('path');

/** Server-side enum of `scan.announcementType` (Stockscans UI filter dropdown). */
const FILING_TYPES = [
  'Financial Results',
  'Earnings Call',
  'Presentation',
  'Annual Report',
  'M&A / Restructuring',
  'Promoter Reg 31/31A',
  'Orders / Contracts',
  'Fund Raising',
  'Management Changes',
  'Press Release',
  'Credit Rating',
  'Insolvency / CIRP',
];

/** `announcements/scan` returns at most this many rows per call. */
const PAGE_SIZE = 30;

/** A real saved scan id must be echoed back (see stockscans-api-schemas.md). */
const DEFAULT_SCAN_ID = '59822b15a2859d183df3770d';
const DEFAULT_SCAN_NAME = 'Recordings';

const WATCHLIST_PREFIX = '__bulk_scan_';

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Calendar-quarter-end keys (YYYYMM) from `from` to `to` inclusive.
 * `quarterDate` is the RELEASE quarter of the filing, not the reporting period.
 * @param {string} from - e.g. '202409'
 * @param {string} to - e.g. '202609'
 * @returns {string[]} newest first
 */
function expandQuarters(from, to) {
  const ok = (s) => /^\d{4}(03|06|09|12)$/.test(s);
  if (!ok(from) || !ok(to))
    throw new Error(`quarters must be YYYYMM with month 03/06/09/12: ${from}..${to}`);
  const out = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(4));
  const end = Number(to.slice(0, 4)) * 12 + Number(to.slice(4));
  while (y * 12 + m <= end) {
    out.push(`${y}${String(m).padStart(2, '0')}`);
    m += 3;
    if (m > 12) {
      m = 3;
      y += 1;
    }
  }
  return out.reverse();
}

/** Validate requested types against the enum (the server silently treats unknown values as "All"). */
function assertTypes(types) {
  const bad = types.filter((t) => !FILING_TYPES.includes(t));
  if (bad.length)
    throw new Error(
      `unknown announcementType: ${bad.join(', ')}. Valid: ${FILING_TYPES.join(' | ')}`
    );
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Retry-After header (seconds or HTTP date) -> ms, or null. */
function retryAfterMs(err, now = Date.now()) {
  const h = err && err.response && err.response.headers && err.response.headers['retry-after'];
  if (!h) return null;
  const s = Number(h);
  if (Number.isFinite(s)) return s * 1000;
  const d = Date.parse(h);
  return Number.isNaN(d) ? null : Math.max(d - now, 0);
}

/** Retryable = HTTP 429, 5xx, or a network error with no response. Other 4xx (400/401/403/404) are not. */
function isRetryable(err) {
  const status = err && err.response && err.response.status;
  if (status === undefined) return true;
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * Run `fn` with exponential backoff + full jitter; honours Retry-After.
 * Throws the last error (annotated `err.attempts`) when attempts run out or the
 * error is not retryable.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {Object} [o]
 * @param {number} [o.baseMs=2000]
 * @param {number} [o.maxMs=300000] - cap per wait (5 min)
 * @param {number} [o.maxAttempts=7]
 * @param {(ms:number)=>Promise<void>} [o.sleep]
 * @param {() => number} [o.random]
 * @param {(ms:number)=>boolean} [o.canWait] - return false to give up instead of sleeping `ms`
 * @param {(info:{attempt:number, waitMs:number, status:(number|undefined)})=>void} [o.onRetry]
 * @returns {Promise<T>}
 */
async function withBackoff(fn, o = {}) {
  const {
    baseMs = 2000,
    maxMs = 300000,
    maxAttempts = 7,
    sleep = defaultSleep,
    random = Math.random,
    onRetry,
    canWait,
  } = o;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      err.attempts = attempt;
      if (!isRetryable(err) || attempt >= maxAttempts) throw err;
      const exp = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      const floor = retryAfterMs(err);
      const waitMs = Math.min(
        maxMs,
        Math.max(floor || 0, Math.round(exp / 2 + random() * (exp / 2)))
      );
      if (canWait && !canWait(waitMs)) throw err; // the wait would outlive the run budget
      if (onRetry) onRetry({ attempt, waitMs, status: err.response && err.response.status });
      await sleep(waitMs);
    }
  }
}

/**
 * Pace controller: widens the gap between calls after a 429, narrows it again
 * after a run of successes. Instance state only.
 */
function createPacer({ baseMs = 800, maxMs = 30000, sleep = defaultSleep } = {}) {
  let cur = baseMs;
  let ok = 0;
  return {
    get delayMs() {
      return cur;
    },
    hit429() {
      ok = 0;
      cur = Math.min(maxMs, cur * 2);
    },
    success() {
      ok += 1;
      if (ok >= 10 && cur > baseMs) {
        cur = Math.max(baseMs, Math.round(cur * 0.75));
        ok = 0;
      }
    },
    wait: () => sleep(cur),
  };
}

/** `scan` object for `scans/announcement/search`, scoped to watchlists, with an announcementType. */
function buildScan({ watchlistIds, announcementType, searchFilters = [] }) {
  return {
    scanId: DEFAULT_SCAN_ID,
    scanName: DEFAULT_SCAN_NAME,
    filters: [],
    industry: [],
    index: [],
    searchFilters,
    announcementType,
    alerts: false,
    searchMode: 'full',
    companyIds: [],
    companyFilters: [],
    watchlistIds,
  };
}

/** Normalize one response row; original fields are kept under `raw` only if `keepRaw`. */
function normalizeRow(row, { type, quarterDate, assetsBase }, keepRaw = false) {
  const ssUrl = row.ssUrl || row.transcriptSsUrl || null;
  const [, symbol = ''] = String(row.companyId || '').split(':');
  const out = {
    companyId: row.companyId,
    symbol,
    name: row.name || symbol,
    title: row.title || '',
    description: row.description || '',
    date: row.date || (row.createdAt || '').split(' ')[0] || '',
    createdAt: row.createdAt || null,
    ssUrl,
    url: ssUrl && assetsBase ? `${assetsBase}/${ssUrl}` : null,
    type,
    quarterDate,
  };
  if (keepRaw) out.raw = row;
  return out;
}

/**
 * Page through one (watchlist, type, quarter) scan. Does NOT trust the
 * response `total` (it self-inflates). Stops on an empty/short page, on a page
 * whose rows were all already seen (server ignoring offset), or at maxPages.
 *
 * @returns {Promise<{rows:Object[], nextOffset:number, complete:boolean}>}
 */
async function scanUnit(
  client,
  { watchlistId, type, quarterDate, startOffset = 0, maxPages = 400, searchFilters },
  hooks = {}
) {
  const { pacer, backoff = {}, onPage, shouldStop } = hooks;
  const rows = [];
  const seen = new Set();
  let offset = startOffset;
  for (let page = 0; page < maxPages; page++) {
    if (shouldStop && shouldStop()) return { rows, nextOffset: offset, complete: false };
    const res = await withBackoff(
      () =>
        client.scanAnnouncements(
          {
            scan: buildScan({ watchlistIds: [watchlistId], announcementType: type, searchFilters }),
            offset,
            quarterDate,
          },
          { referer: `${client.baseUrl || 'https://www.stockscans.in'}/announcement-scans` }
        ),
      {
        ...backoff,
        onRetry: (i) => {
          if (i.status === 429 && pacer) pacer.hit429();
          if (backoff.onRetry) backoff.onRetry(i);
        },
      }
    );
    const items = (res && (res.announcements || res.documents || res.items)) || [];
    if (!Array.isArray(items) || (items.length === 0 && res && res.status === 'error')) {
      throw Object.assign(new Error(`unexpected response: ${JSON.stringify(res).slice(0, 200)}`), {
        attempts: 1,
      });
    }
    const fresh = items.filter((r) => {
      const k = `${r.companyId}|${r.ssUrl || r.title}|${r.date}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    rows.push(...fresh);
    offset += items.length;
    if (onPage) onPage({ type, quarterDate, offset, got: items.length });
    if (pacer) pacer.success();
    if (items.length < PAGE_SIZE || fresh.length === 0)
      return { rows, nextOffset: offset, complete: true };
    if (pacer) await pacer.wait();
  }
  return { rows, nextOffset: offset, complete: false };
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, obj) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1));
  fs.renameSync(tmp, file);
}

/** Delete watchlists recorded in state that a crashed run left behind. */
async function cleanupWatchlists(client, outDir, { backoff, log = () => {} } = {}) {
  const stateFile = path.join(outDir, 'state.json');
  const state = readJson(stateFile, { watchlists: [], units: {} });
  const left = [];
  for (const wl of state.watchlists || []) {
    try {
      await withBackoff(() => client.deleteWatchlist(wl.id), backoff);
      log(`deleted watchlist ${wl.id}`);
    } catch (err) {
      left.push(wl);
      log(`could not delete watchlist ${wl.id}: ${err.message}`);
    }
  }
  state.watchlists = left;
  writeJsonAtomic(stateFile, state);
  return left.length;
}

/**
 * Orchestrate: create throwaway watchlist(s) -> scan every (watchlist × type ×
 * quarter) unit resumably -> append rows to `<outDir>/rows.jsonl` -> always
 * delete the watchlists. Safe to re-run: finished units are skipped, a
 * partially-paged unit resumes at its saved offset, and rows are de-duplicated.
 *
 * Output files in `outDir`:
 *   rows.jsonl   one normalized filing per line (see normalizeRow)
 *   state.json   { watchlists:[{id,name}], units:{ "<wl#>|<type>|<quarter>": {offset,complete} } }
 *   errors.jsonl one line per unit that hit a non-retryable error or exhausted backoff
 *
 * @param {Object} o
 * @param {Object} o.client - StockscansClient-like (scanAnnouncements, createWatchlist, deleteWatchlist)
 * @param {string[]} o.companyIds - 'NSE:SYMBOL' ids
 * @param {string[]} o.types - subset of FILING_TYPES
 * @param {string[]} o.quarters - YYYYMM release-quarter keys
 * @param {string} o.outDir
 * @param {number} [o.watchlistSize=500] - companies per throwaway watchlist
 * @param {number} [o.budgetSec=0] - stop cleanly after this many seconds (0 = unlimited)
 * @param {number} [o.delayMs=800] - base gap between page calls (auto-widens on 429)
 * @param {number} [o.maxPages=400]
 * @param {boolean} [o.keepRaw=false]
 * @param {string} [o.assetsBase]
 * @param {Object} [o.backoff] - withBackoff options
 * @param {(m:string)=>void} [o.log]
 * @param {(ms:number)=>Promise<void>} [o.sleep]
 * @param {()=>number} [o.now]
 * @returns {Promise<{rows:number, unitsDone:number, unitsTotal:number, stopped:(null|'budget'|'blocked'), perType:Object}>}
 */
async function runBulkScan(o) {
  const {
    client,
    companyIds,
    types,
    quarters,
    outDir,
    watchlistSize = 500,
    budgetSec = 0,
    delayMs = 800,
    maxPages = 400,
    keepRaw = false,
    assetsBase,
    backoff = {},
    log = () => {},
    sleep = defaultSleep,
    now = Date.now,
  } = o;
  assertTypes(types);
  fs.mkdirSync(outDir, { recursive: true });
  const rowsFile = path.join(outDir, 'rows.jsonl');
  const stateFile = path.join(outDir, 'state.json');
  const errFile = path.join(outDir, 'errors.jsonl');
  const state = readJson(stateFile, { watchlists: [], units: {} });
  const started = now();
  const shouldStop = () => budgetSec > 0 && (now() - started) / 1000 >= budgetSec;

  const have = new Set();
  if (fs.existsSync(rowsFile)) {
    for (const line of fs.readFileSync(rowsFile, 'utf8').split('\n')) {
      if (!line) continue;
      const r = JSON.parse(line);
      have.add(`${r.type}|${r.quarterDate}|${r.companyId}|${r.ssUrl || r.title}|${r.date}`);
    }
  }

  const groups = chunk(companyIds, watchlistSize);
  const units = [];
  groups.forEach((_, g) =>
    quarters.forEach((q) => types.forEach((t) => units.push({ g, q, t, key: `${g}|${t}|${q}` })))
  );
  const pending = units.filter((u) => !(state.units[u.key] && state.units[u.key].complete));
  const pacer = createPacer({ baseMs: delayMs, sleep });
  const perType = {};
  let rowsAdded = 0;
  let stopped = null;
  const ids = [];

  const bo = {
    ...backoff,
    sleep,
    onRetry: (i) =>
      log(`retry ${i.attempt} in ${Math.round(i.waitMs / 1000)}s (HTTP ${i.status || 'net'})`),
  };
  // Scan calls must not sleep past the budget (leave 10 s to delete watchlists); cleanup calls may.
  const boScan = {
    ...bo,
    canWait: (ms) => budgetSec <= 0 || now() - started + ms <= (budgetSec + 10) * 1000,
  };
  try {
    if (pending.length) {
      const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const needed = new Set(pending.map((u) => u.g));
      for (const g of needed) {
        if (shouldStop()) {
          stopped = 'budget';
          break;
        }
        const name = `${WATCHLIST_PREFIX}${stamp}_${g}`;
        const created = await withBackoff(() => client.createWatchlist(name, groups[g]), bo);
        if (!created || !created.watchlistId)
          throw new Error(`createWatchlist returned no id for group ${g}`);
        ids[g] = created.watchlistId;
        state.watchlists.push({ id: created.watchlistId, name });
        writeJsonAtomic(stateFile, state); // persisted BEFORE use so --cleanup can find it after a crash
        log(`watchlist ${name}: ${groups[g].length} companies`);
        if (await pacerWait(pacer, shouldStop)) break;
      }
    }

    for (const u of pending) {
      if (stopped || !ids[u.g]) continue;
      if (shouldStop()) {
        stopped = 'budget';
        break;
      }
      const prev = state.units[u.key] || { offset: 0, complete: false };
      let res;
      try {
        res = await scanUnit(
          client,
          {
            watchlistId: ids[u.g],
            type: u.t,
            quarterDate: u.q,
            startOffset: prev.offset,
            maxPages,
          },
          {
            pacer,
            backoff: boScan,
            shouldStop,
            onPage: (p) => log(`${u.t} ${u.q} wl${u.g} offset=${p.offset}`),
          }
        );
      } catch (err) {
        fs.appendFileSync(
          errFile,
          `${JSON.stringify({ key: u.key, status: err.response && err.response.status, attempts: err.attempts, message: err.message, at: new Date().toISOString() })}\n`
        );
        const status = err.response && err.response.status;
        if (status === 429 || status === undefined || status >= 500) {
          stopped = 'blocked'; // backoff exhausted: stop rather than hammer a blocked endpoint
          log(
            `backoff exhausted on ${u.key} (HTTP ${status || 'net'}) — stopping; re-run later to resume`
          );
          break;
        }
        log(`unit ${u.key} failed (HTTP ${status}): ${err.message} — skipping`);
        continue;
      }
      const lines = [];
      for (const r of res.rows) {
        const n = normalizeRow(r, { type: u.t, quarterDate: u.q, assetsBase }, keepRaw);
        const k = `${n.type}|${n.quarterDate}|${n.companyId}|${n.ssUrl || n.title}|${n.date}`;
        if (have.has(k)) continue;
        have.add(k);
        lines.push(JSON.stringify(n));
      }
      if (lines.length) fs.appendFileSync(rowsFile, `${lines.join('\n')}\n`);
      rowsAdded += lines.length;
      perType[u.t] = (perType[u.t] || 0) + lines.length;
      state.units[u.key] = { offset: res.nextOffset, complete: res.complete };
      writeJsonAtomic(stateFile, state);
      if (!res.complete) {
        stopped = 'budget';
        break;
      }
    }
  } finally {
    for (const g of Object.keys(ids)) {
      try {
        await withBackoff(() => client.deleteWatchlist(ids[g]), bo);
        state.watchlists = state.watchlists.filter((w) => w.id !== ids[g]);
        log(`deleted watchlist ${ids[g]}`);
      } catch (err) {
        log(`WARNING: could not delete watchlist ${ids[g]} (${err.message}); run with --cleanup`);
      }
    }
    writeJsonAtomic(stateFile, state);
  }

  const unitsDone = units.filter((u) => state.units[u.key] && state.units[u.key].complete).length;
  return { rows: rowsAdded, unitsDone, unitsTotal: units.length, stopped, perType };
}

async function pacerWait(pacer, shouldStop) {
  await pacer.wait();
  return shouldStop();
}

module.exports = {
  FILING_TYPES,
  PAGE_SIZE,
  expandQuarters,
  assertTypes,
  withBackoff,
  isRetryable,
  retryAfterMs,
  createPacer,
  buildScan,
  normalizeRow,
  scanUnit,
  runBulkScan,
  cleanupWatchlists,
};
