'use strict';

const fs = require('fs');
const path = require('path');
const { stockscans } = require('../index');

function parseScanId(arg) {
  const m = arg.match(/\/scans\/saved\/([a-f0-9]{24})/);
  if (m) return m[1];
  if (/^[a-f0-9]{24}$/.test(arg.trim())) return arg.trim();
  throw new Error(
    `Could not parse a scanId from '${arg}'. Expected a URL like https://www.stockscans.in/scans/saved/<24-hex> or the bare id.`
  );
}

function buildRunPayload(definition) {
  return {
    ratiosType: 'Default',
    timePeriod: 'Latest',
    scan: definition,
    watchlistIds: definition.watchlistIds || [],
    order: 'desc',
    orderBy: 'Market Capitalization',
    offset: 0,
  };
}

// ── Column resolution & liquidity gate ────────────────────────────────────────
//
// Stockscans renames/relabels columns across ratiosType configs, so we never
// hardcode one label — we resolve a value across a list of candidate aliases
// (case-insensitive, whitespace-insensitive). This is the same defensive pattern
// scan_api.md documents for column drift; extend the alias arrays if a column
// you need goes missing rather than editing call sites.

/** Case/whitespace-insensitive lookup of the first matching alias in a row. */
function col(row, aliases) {
  const norm = (s) =>
    String(s)
      .toLowerCase()
      .replace(/[\s_]+/g, '');
  const map = {};
  for (const k of Object.keys(row)) map[norm(k)] = row[k];
  for (const a of aliases) {
    const v = map[norm(a)];
    if (v !== undefined && v !== null && v !== '') return { value: v, source: a };
  }
  return { value: undefined, source: null };
}

function parseNum(v) {
  if (v === undefined || v === null || v === '') return NaN;
  if (typeof v === 'number') return v;
  // Strip ₹, commas, % and stray text; keep sign and decimal.
  const n = Number(String(v).replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Normalise a money figure to ₹ Crore. Stockscans is inconsistent: dedicated
 * "…Market Capitalization"/"…Value" columns come in ₹ Cr (small numbers like
 * 5–5000), whereas expression columns like `Volume SMA 50D * SMA 50D` come in
 * absolute rupees (e.g. 5e7 = ₹5 Cr). Heuristic: anything above ₹1e5 is assumed
 * to be absolute rupees and divided by 1e7; smaller values are treated as already
 * in ₹ Cr. The raw value and the assumption are recorded so the analyst can audit
 * — get the unit wrong and the whole liquidity gate is wrong, so we surface it.
 */
function toCrore(raw) {
  const n = parseNum(raw);
  if (!Number.isFinite(n)) return { cr: NaN, assumedUnit: 'unknown' };
  if (Math.abs(n) > 1e5) return { cr: n / 1e7, assumedUnit: 'absolute-rupees→cr' };
  return { cr: n, assumedUnit: 'already-cr' };
}

const ATV_ALIASES = [
  'Average Traded Value 50D',
  'Avg Traded Value 50D',
  '50D Average Traded Value',
  '50D Avg Traded Value',
  'Traded Value SMA 50D',
  'Traded Value 50D',
  'Average Traded Value',
  'Avg Traded Value',
  // expression fallbacks (absolute ₹ — toCrore handles the unit):
  'Volume SMA 50D * SMA 50D',
  'Volume SMA 50 * SMA 50',
];
const FREEFLOAT_ALIASES = [
  'Free Float Market Capitalization',
  'Free Float Mcap',
  'Free Float Market Cap',
  'Free Float',
  'Non Promoter Holdings * Market Capitalization',
];
const PROMOTER_ALIASES = ['Promoter Holdings', 'Promoter Holding', 'Promoters Holdings'];
const MCAP_ALIASES = ['Market Capitalization', 'Market Cap', 'Mcap'];

/**
 * Partition a company universe into liquid (tradeable) names and those excluded
 * for illiquidity. A pre-PEAD signal you cannot act on is worthless: if 50-day
 * average traded value is thin, you can't build a position without moving the
 * price, and if free float is tiny the "surprise" move is dominated by a handful
 * of holders rather than genuine repricing. Both make the drift un-tradeable, so
 * they are a hard gate applied BEFORE any concall work — no point reading a
 * transcript for a name you can't trade.
 *
 * Free-float fallback: if no free-float column is present, estimate it as
 * (1 − promoterHolding%) × marketCap. Flagged as `estimated` so the reader knows.
 *
 * @param {Array<Object>} companies
 * @param {Object} [opts]
 * @param {number} [opts.minAtvCr=5]        50D avg traded value floor, ₹ Cr.
 * @param {number} [opts.minFreeFloatCr=50] free-float floor, ₹ Cr.
 * @returns {{ liquid:Array, excluded:Array, unresolved:Array }}
 *   `unresolved` = names where a required column was missing and no fallback
 *   applied; these are NOT silently passed — the caller must decide (usually:
 *   surface to the analyst to add the ratio to the scan).
 */
function applyLiquidityGate(companies, opts = {}) {
  const minAtvCr = opts.minAtvCr != null ? opts.minAtvCr : 5;
  const minFreeFloatCr = opts.minFreeFloatCr != null ? opts.minFreeFloatCr : 50;

  const liquid = [];
  const excluded = [];
  const unresolved = [];

  for (const c of companies) {
    const atvCol = col(c, ATV_ALIASES);
    const ffCol = col(c, FREEFLOAT_ALIASES);
    const mcapCol = col(c, MCAP_ALIASES);
    const promCol = col(c, PROMOTER_ALIASES);

    // 50D average traded value.
    const atv = toCrore(atvCol.value);

    // Free float: direct column, else (1 − promoter%) × mcap.
    let ff;
    let ffEstimated = false;
    if (ffCol.value !== undefined) {
      ff = toCrore(ffCol.value);
    } else {
      const mcapCr = toCrore(mcapCol.value).cr;
      const prom = parseNum(promCol.value);
      if (Number.isFinite(mcapCr) && Number.isFinite(prom)) {
        ff = { cr: mcapCr * (1 - prom / 100), assumedUnit: 'estimated: (1−promoter%)×mcap' };
        ffEstimated = true;
      } else {
        ff = { cr: NaN, assumedUnit: 'unresolved' };
      }
    }

    const liq = {
      atvCr: round2(atv.cr),
      atvSource: atvCol.source,
      atvUnit: atv.assumedUnit,
      freeFloatCr: round2(ff.cr),
      freeFloatSource: ffEstimated ? 'estimated' : ffCol.source,
      freeFloatUnit: ff.assumedUnit,
      freeFloatEstimated: ffEstimated,
    };

    // If either metric is unresolvable, don't guess a pass/fail.
    if (!Number.isFinite(atv.cr) || !Number.isFinite(ff.cr)) {
      unresolved.push({
        ...c,
        _liquidity: liq,
        _liquidityNote: 'traded-value or free-float column not found in scan output',
      });
      continue;
    }

    const failAtv = atv.cr < minAtvCr;
    const failFf = ff.cr < minFreeFloatCr;
    if (failAtv || failFf) {
      const reasons = [];
      if (failAtv) reasons.push(`50D avg traded value ₹${round2(atv.cr)} Cr < ₹${minAtvCr} Cr`);
      if (failFf)
        reasons.push(
          `free float ₹${round2(ff.cr)} Cr < ₹${minFreeFloatCr} Cr${ffEstimated ? ' (est.)' : ''}`
        );
      excluded.push({
        ...c,
        _liquidity: liq,
        _exclusionReason: `illiquid — ${reasons.join('; ')}`,
      });
    } else {
      liquid.push({ ...c, _liquidity: liq });
    }
  }

  return { liquid, excluded, unresolved };
}

function round2(n) {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function flattenTable(runResp) {
  const table = runResp.table;
  if (!table || table.length < 1) {
    return { rows: [], total: runResp.total || 0 };
  }
  const header = table[0];
  const rows = [];
  for (let i = 1; i < table.length; i++) {
    const raw = table[i];
    const rowObj = {};
    for (let j = 0; j < Math.min(header.length, raw.length); j++) {
      rowObj[header[j]] = raw[j];
    }
    rows.push(rowObj);
  }
  return { rows, total: runResp.total || rows.length };
}

/**
 * Resolves a saved scan into its current company universe.
 */
async function resolveUniverse(scanArg, options = {}) {
  const {
    jsonOut,
    listOnly = false,
    // Liquidity gate — on by default; the whole point of the scanner is a
    // tradeable surprise. Pass `liquidityGate:false` to inspect the raw universe.
    liquidityGate = true,
    minAtvCr = 5,
    minFreeFloatCr = 50,
  } = options;
  const scanId = parseScanId(scanArg);

  const definition = await stockscans.getScanMetadata(scanId);
  const scanName = definition.scanName || scanId;

  const payload = buildRunPayload(definition);

  // Handle pagination until we get all results
  const allRows = [];
  let total = null;
  let offset = 0;

  while (total === null || offset < total) {
    payload.offset = offset;
    const runResp = await stockscans.runScan(payload, scanId);
    const { rows, total: currentTotal } = flattenTable(runResp);

    total = currentTotal;
    if (rows.length === 0) break;

    allRows.push(...rows);
    offset += rows.length;
  }

  const universe = {
    scanId,
    scanName,
    filters: definition.filters || [],
    total,
    fetched_at: new Date().toISOString(),
    companies: allRows,
  };

  if (liquidityGate) {
    const { liquid, excluded, unresolved } = applyLiquidityGate(allRows, {
      minAtvCr,
      minFreeFloatCr,
    });
    universe.liquidityGate = { minAtvCr, minFreeFloatCr };
    universe.companies = liquid; // downstream steps only see tradeable names
    universe.excluded_illiquid = excluded; // reported, never silently dropped
    universe.unresolved_liquidity = unresolved; // columns missing → analyst must add ratio
    universe.raw_total = allRows.length;
  }

  if (jsonOut) {
    fs.writeFileSync(path.resolve(jsonOut), JSON.stringify(universe, null, 2), 'utf-8');
  }

  return universe;
}

module.exports = {
  resolveUniverse,
  parseScanId,
  buildRunPayload,
  flattenTable,
  applyLiquidityGate,
  col,
  toCrore,
  parseNum,
};
