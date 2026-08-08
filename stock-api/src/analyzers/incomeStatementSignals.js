'use strict';

/**
 * incomeStatementSignals.js — deterministic Extraction-First engine for
 * `skills/_shared/income-statement-signals.md`.
 *
 * WHY THIS EXISTS: every skill that reads a P&L (quarterly-result-analysis,
 * forensic-accounting, consecutive-filings-diff, announcement-insights,
 * concall-analysis, stock-report, financial-model, rerating-catalysts,
 * pre-pead-scanner) needs the same QoQ/YoY delta arithmetic and the same
 * materiality-bar filtering on the same 15 P&L lines. Before this script
 * existed, each skill re-derived that arithmetic inside an LLM reasoning
 * pass — burning tokens on pure subtraction/division, and risking two
 * skills reaching different numbers for the identical quarter because the
 * "materiality bar" judgment was re-litigated in prose every time.
 *
 * Extraction First: this script takes raw P&L line items (already extracted
 * from the Result filing via stock-documents-fetcher — this module does NOT
 * fetch documents) and returns ONLY the lines/combinations that clear the
 * materiality bar, pre-computed and pre-filtered. Analysis Second: the
 * calling skill's LLM pass reasons ONLY over that short, pre-filtered JSON —
 * deciding what it MEANS (sustainable vs cyclical vs temporary, what belongs
 * in the verdict chips), never re-deriving whether a line moved or by how
 * much.
 *
 * De-duplication: results are cached per (companyId, period) at
 * data/cache/income-statement-signals/<safeCompanyId>/<period>.json. Any
 * second skill (or a second run of the same skill) analysing the same
 * quarter for the same company reads the cached scan instead of recomputing
 * it — so a company covered by, say, quarterly-result-analysis AND
 * concall-analysis AND announcement-insights in the same session (e.g. via
 * equity-research-master) gets the arithmetic done exactly once.
 *
 * Callers MUST go through `getOrCompute()` rather than calling `compute()`
 * directly, so the cache is always consulted first.
 */

const fs = require('fs');
const path = require('path');
const db = require('../../../packages/jobs-runtime/lib/db');
const { sanitizeCompanyId } = require('../utils/companyId');

const CACHE_COLLECTION = 'income-statement-signals';

function safeName(id) {
  return String(id || '').replace(/[^A-Za-z0-9:_-]+/g, '_');
}

function cacheDir(companyId) {
  return path.join(db.cachePath(CACHE_COLLECTION), safeName(sanitizeCompanyId(companyId)));
}

/** period: a stable key for the quarter being analysed, e.g. "2026Q1" or "202603". */
function cacheFile(companyId, period) {
  return path.join(cacheDir(companyId), `${safeName(period)}.json`);
}

// ── Line definitions: label, key in the caller's normalized P&L object, bar ──
//
// Callers pass a normalized P&L snapshot per period:
//   { revenue, otherIncome, costOfMaterials, changeInInventories, employeeCost,
//     otherExpenses, ebitda, depreciation, interest, exceptionalItems, pbt,
//     tax, pat, epsBasic, epsDiluted, minorityInterest }
// Any field the filing doesn't disclose should be passed as `null`, not 0 —
// this module treats `null` as "not applicable" and skips that line's checks
// rather than reporting a false 0% move.

const LINES = [
  {
    key: 'revenue',
    label: 'Revenue / Net Sales',
    // Materiality bar checked against the trailing-4Q average growth rate,
    // not a fixed %, because "5% deviation from trend" is inherently
    // relative — pass `trailingAvgGrowthPct` in `context` to enable it.
    bar: (d, ctx) => {
      if (ctx.trailingAvgGrowthPct == null || d.yoyPct == null) return false;
      return Math.abs(d.yoyPct - ctx.trailingAvgGrowthPct) > 5;
    },
  },
  {
    key: 'otherIncome',
    label: 'Other Income',
    bar: (d, ctx) =>
      (ctx.pbt && Math.abs(d.value) / Math.abs(ctx.pbt) > 0.10) ||
      (d.qoqPct != null && Math.abs(d.qoqPct) > 50) ||
      (d.yoyPct != null && Math.abs(d.yoyPct) > 50),
    note: 'Classify composition (treasury/interest, FV gain, forex, one-off) before citing.',
  },
  {
    key: 'costOfMaterials',
    label: 'Cost of materials consumed / Purchases of stock-in-trade',
    bar: (d) => d.pctOfSalesQoQDeltaBps != null && Math.abs(d.pctOfSalesQoQDeltaBps) > 150,
  },
  {
    key: 'changeInInventories',
    label: 'Changes in inventories of finished goods, WIP and stock-in-trade',
    bar: (d, ctx) =>
      ctx.pbtDelta && Math.abs(d.qoqDelta || d.yoyDelta || 0) / Math.abs(ctx.pbtDelta) > 0.3,
    note: 'Negative = inventory build-up (profit-inflating tailwind); positive = drawdown (cost headwind).',
  },
  {
    key: 'employeeCost',
    label: 'Employee benefit expense',
    bar: (d, ctx) =>
      d.yoyPct != null && ctx.revenueYoyPct != null && Math.abs(d.yoyPct - ctx.revenueYoyPct) > 10,
  },
  {
    key: 'otherExpenses',
    label: 'Other expenses',
    bar: (d) => (d.yoyPct != null && Math.abs(d.yoyPct) > 15) || (d.qoqPct != null && Math.abs(d.qoqPct) > 15),
  },
  {
    key: 'ebitdaMarginBps',
    label: 'EBITDA / Operating Profit (OPM%)',
    bar: (d) => Math.abs(d.value || 0) > 100, // value = bps move, precomputed by caller
  },
  {
    key: 'depreciation',
    label: 'Depreciation & Amortisation',
    bar: (d) => (d.yoyPct != null && Math.abs(d.yoyPct) > 15) || (d.qoqPct != null && Math.abs(d.qoqPct) > 15),
  },
  {
    key: 'interest',
    label: 'Finance costs / Interest',
    bar: (d) => d.yoyPct != null && Math.abs(d.yoyPct) > 10,
    note: 'Flag only if inconsistent with the known gross-debt trend — pass debtTrend in context.',
  },
  {
    key: 'exceptionalItems',
    label: 'Exceptional / Extraordinary items',
    bar: (d) => d.value != null && d.value !== 0, // any non-zero value is always reportable
  },
  {
    key: 'tax',
    label: 'Tax expense / effective tax rate',
    bar: (d) => d.effectiveRateDeltaBps != null && Math.abs(d.effectiveRateDeltaBps) > 300,
  },
  {
    key: 'epsDilutionGapPct',
    label: 'EPS (basic vs diluted)',
    bar: (d) => d.value != null && Math.abs(d.value) > 3, // value = % gap, precomputed by caller
  },
  {
    key: 'minorityInterest',
    label: 'Minority interest / share of associates',
    bar: (d) => (d.yoyPct != null && Math.abs(d.yoyPct) > 15) || (d.qoqPct != null && Math.abs(d.qoqPct) > 15),
  },
];

function pctChange(curr, prev) {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

/**
 * Pure computation — no I/O, no cache. Exported for tests; callers should
 * use `getOrCompute` in real runs.
 *
 * @param {object} lineData - map of line key -> { value, qoq, yoy, ...extra }
 *   where `qoq`/`yoy` are the prior-period comparable values already
 *   resolved by the caller (this module does no fetching).
 * @param {object} context - cross-line context used by some bars:
 *   { pbt, pbtDelta, revenueYoyPct, trailingAvgGrowthPct, debtTrend }
 * @returns {{material: object[], skipped: object[]}}
 */
function compute(lineData, context = {}) {
  const material = [];
  const skipped = [];

  for (const def of LINES) {
    const raw = lineData[def.key];
    if (raw == null || raw.value == null) {
      skipped.push({ key: def.key, label: def.label, reason: 'not disclosed' });
      continue;
    }
    const d = {
      value: raw.value,
      qoqDelta: raw.qoq != null ? raw.value - raw.qoq : null,
      yoyDelta: raw.yoy != null ? raw.value - raw.yoy : null,
      qoqPct: raw.qoq != null ? pctChange(raw.value, raw.qoq) : null,
      yoyPct: raw.yoy != null ? pctChange(raw.value, raw.yoy) : null,
      // pass-through for bars that need a precomputed derived figure
      pctOfSalesQoQDeltaBps: raw.pctOfSalesQoQDeltaBps ?? null,
      effectiveRateDeltaBps: raw.effectiveRateDeltaBps ?? null,
    };

    let clears = false;
    try {
      clears = !!def.bar(d, context);
    } catch (_) {
      clears = false; // a bar that can't evaluate (missing context) is never forced material
    }

    if (clears) {
      material.push({
        key: def.key,
        label: def.label,
        ...d,
        note: def.note || null,
      });
    } else {
      skipped.push({ key: def.key, label: def.label, reason: 'below materiality bar', ...d });
    }
  }

  // Combination reads — evaluated only over lines that individually cleared
  // the bar, so a combination flag never fires on noise.
  const byKey = Object.fromEntries(material.map((m) => [m.key, m]));
  const combinations = [];

  if (byKey.otherIncome && !byKey.ebitdaMarginBps) {
    combinations.push({
      flag: 'NON_OPERATING_BEAT',
      note: 'Other Income moved materially while operating profit did not — PBT/PAT move is non-operating.',
    });
  }
  if (byKey.changeInInventories && byKey.costOfMaterials) {
    combinations.push({
      flag: 'INVENTORY_GAIN_DRIVEN',
      note: 'RM-cost improvement coincides with an inventory build — classic inventory-gain margin, tag TEMPORARY.',
    });
  }
  if (byKey.depreciation && byKey.interest) {
    combinations.push({
      flag: 'CAPEX_COMMISSIONED_NOT_YET_CONTRIBUTING',
      note: 'D&A and interest both stepped up — check whether revenue reflects the new capacity yet.',
    });
  }
  if (byKey.tax) {
    combinations.push({
      flag: 'TAX_RATE_EFFECT',
      note: 'Effective tax rate swung materially — net this out before citing PAT growth as an operating signal.',
    });
  }
  if (byKey.exceptionalItems) {
    combinations.push({
      flag: 'EXCEPTIONAL_ITEM_PRESENT',
      note: 'Restate PAT ex-exceptional and confirm whether management commentary addressed it.',
    });
  }

  return { material, combinations, skipped };
}

/** Read a cached scan for (companyId, period), or null on a miss/corrupt entry. */
function readCache(companyId, period) {
  const f = cacheFile(companyId, period);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeCache(companyId, period, result) {
  const d = cacheDir(companyId);
  fs.mkdirSync(d, { recursive: true });
  const f = cacheFile(companyId, period);
  const tmp = `${f}.tmp.${process.pid}`;
  fs.writeFileSync(
    tmp,
    JSON.stringify({ companyId: sanitizeCompanyId(companyId), period, computedAt: new Date().toISOString(), ...result }, null, 2)
  );
  fs.renameSync(tmp, f);
}

/**
 * The entry point every skill should call. De-duplicates work across skills
 * and across repeat runs: a cache hit costs zero LLM tokens and zero
 * recomputation.
 *
 * @param {string} companyId
 * @param {string} period - stable period key, e.g. "202603" (YYYYMM of quarter end)
 * @param {object} lineData - see `compute()`
 * @param {object} context - see `compute()`
 * @param {boolean} [force=false] - bypass cache (use when the filing was
 *   revised/restated)
 */
function getOrCompute(companyId, period, lineData, context = {}, force = false) {
  if (!force) {
    const cached = readCache(companyId, period);
    if (cached) return { ...cached, fromCache: true };
  }
  const result = compute(lineData, context);
  writeCache(companyId, period, result);
  return { ...result, fromCache: false };
}

module.exports = { compute, getOrCompute, readCache, writeCache, LINES };
