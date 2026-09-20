'use strict';

/**
 * companyFinancials.js -- deterministic Extraction for a company's historical
 * P&L (12 quarters + ~7 fiscal years + TTM), the "actuals" side of the
 * guidance-vs-actuals growth comparison in pead-surprise-ranker.
 *
 * WHERE THE DATA COMES FROM: the server-rendered company page
 * `https://www.stockscans.in/company/<EXCH:SYMBOL>`. There is no JSON API
 * behind its Financials section (confirmed 2026-09-20: the tables are plain
 * `<table>`s in the SSR HTML) -- so this parses HTML. `StockscansClient.
 * companyPageHtml()` fetches; `parseCompanyPage()` is pure and does the
 * parsing; `getCompanyFinancials()` ties them together with a cache.
 *
 * WHAT IS PARSED (and how it stays robust to Stockscans' CSS-module hashed
 * class names, which change on every deploy): only tag names + visible text.
 *   - Quarterly table  = the first <table> whose first header cell is "Quarter"
 *   - Annual table     = the first <table> whose first header cell is
 *                        "Financial Year" AND that has Revenue + PAT rows
 *                        (the page also has balance-sheet / cash-flow tables
 *                        with the same header cell).
 *   - Every table is rendered twice (mobile + desktop); only the first is used.
 *   - A row's label cell holds 2-3 text nodes ("Growth YoY" (mobile),
 *     "Revenue Growth YoY" (desktop), "%" (unit)); the desktop (long) label
 *     is the one mapped to a stable key below.
 *
 * LAYOUTS: industrial companies have Operating Profit / OPM; banks & NBFCs
 * have Financing Profit / FPM plus an "Interest Expended" row. Both map to
 * `operating_profit` / `opm_pct` (layout is reported so consumers can decide
 * whether an EBITDA-style comparison is even meaningful -- for a bank the
 * "Financing Profit" is frequently NEGATIVE and its growth is not usable).
 *
 * PRECISION: Stockscans shows whole INR Cr (revenue/profit) and 1-decimal %
 * (margins, growth). Small companies therefore carry up to ~1% rounding
 * noise on a single quarter's profit -- consumers must treat derived growth
 * rates as approximate.
 *
 * BASIS: the page defaults to the Consolidated view; `basis` reports what the
 * page said it was showing (or null if undetectable).
 *
 * Extraction only: no LLM, no judgment. Guidance x actuals projection is
 * `pead-surprise-ranker/scripts/compute_growth_deltas.py`.
 */

const { StorageService } = require('@stock/cloud-utils');
const { sanitizeCompanyId } = require('../utils/companyId');

const DEFAULT_TTL_HOURS = 24;

const MONTHS = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
}; // prettier-ignore

/** Desktop row label (lower-cased) -> stable output key. */
const ROW_KEYS = {
  revenue: 'revenue',
  'revenue growth yoy': 'revenue_growth_pct',
  'revenue growth': 'revenue_growth_pct',
  expenses: 'expenses',
  'operating profit': 'operating_profit',
  'financing profit': 'operating_profit',
  opm: 'opm_pct',
  fpm: 'opm_pct',
  'other income': 'other_income',
  'interest expense': 'interest',
  'interest expended': 'interest',
  depreciation: 'depreciation',
  pbt: 'pbt',
  tax: 'tax',
  pat: 'pat',
  'pat growth yoy': 'pat_growth_pct',
  'pat growth': 'pat_growth_pct',
  npm: 'npm_pct',
  eps: 'eps',
};

const ROW_KEY_SET = [...new Set(Object.values(ROW_KEYS))];

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Visible text nodes of an HTML fragment, in order (trimmed, non-empty). */
function textNodes(fragment) {
  return decodeEntities(
    fragment.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, '\u0001')
  )
    .split('\u0001')
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** "1,098" / "3,36,367" / "-12,899" / "48.7" / "" / "-" -> number | null. */
function parseNum(text) {
  if (text == null) return null;
  const t = String(text)
    .replace(/[\s,%₹]/g, '')
    .replace(/−/g, '-'); // unicode minus
  if (!t || /^[-–—]+$/.test(t) || /^(na|n\/a|nan)$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** "Jun 2026" -> { month: 6, year: 2026, yyyymm: "202606" }; "TTM" -> {ttm:true}; else null. */
function parsePeriodHeader(text) {
  const t = String(text || '').trim();
  if (/^TTM$/i.test(t)) return { ttm: true, period: 'TTM' };
  const m = t.match(/^([A-Z][a-z]{2})\s+(\d{4})$/);
  if (!m || !MONTHS[m[1]]) return null;
  const month = MONTHS[m[1]];
  const year = Number(m[2]);
  return { period: t, month, year, yyyymm: `${year}${String(month).padStart(2, '0')}` };
}

/** Indian-FY labelling of a quarter-end month/year. Null for non-quarter-end months. */
function quarterLabel(month, year) {
  const map = { 6: ['Q1', year + 1], 9: ['Q2', year + 1], 12: ['Q3', year + 1], 3: ['Q4', year] };
  const hit = map[month];
  if (!hit) return null;
  return {
    fiscalPeriod: hit[0],
    fiscalYear: hit[1],
    fq: `${hit[0]}FY${String(hit[1]).slice(-2)}`,
  };
}

/** Indian FY a fiscal-year-end month/year belongs to (Mar 2026 -> FY26). */
function yearLabel(month, year) {
  const fiscalYear = month <= 3 ? year : year + 1;
  return { fiscalYear, fy: `FY${String(fiscalYear).slice(-2)}` };
}

/** All <table>...</table> fragments, in document order. */
function allTables(html) {
  return html.match(/<table[\s\S]*?<\/table>/gi) || [];
}

/** Parse one <table> into { header: [cellText...], rows: [{ label, unit, cells: [text...] }] }. */
function parseTable(tableHtml) {
  const trs = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const out = { header: [], rows: [] };
  for (const tr of trs) {
    const cells = tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
    if (!cells.length) continue;
    const isHeader = /^<th/i.test(cells[0]);
    if (isHeader && !out.header.length) {
      out.header = cells.map((c) => textNodes(c).join(' '));
      continue;
    }
    const nodes = textNodes(cells[0]);
    // [mobileLabel, desktopLabel, unit] | [label, unit] | [label]
    const label = nodes.length >= 3 ? nodes[nodes.length - 2] : nodes[0] || '';
    const unit = nodes.length >= 2 ? nodes[nodes.length - 1] : null;
    out.rows.push({ label, unit, cells: cells.slice(1).map((c) => textNodes(c).join(' ')) });
  }
  return out;
}

function isPnlTable(t) {
  const labels = t.rows.map((r) => r.label.toLowerCase());
  return labels.includes('revenue') && labels.includes('pat');
}

/** Table -> { cols: [periodInfo...], series: { key: [num|null...] }, layout } aligned to header[1..]. */
function tableToSeries(t, warnings, tableName) {
  const cols = t.header.slice(1).map(parsePeriodHeader);
  const series = {};
  let layout = 'industrial';
  for (const r of t.rows) {
    const key = ROW_KEYS[r.label.toLowerCase()];
    if (!key) continue;
    if (/^financing profit$/i.test(r.label)) layout = 'financial';
    if (r.cells.length !== cols.length) {
      warnings.push(
        `${tableName}: row "${r.label}" has ${r.cells.length} cells vs ${cols.length} headers -- skipped`
      );
      continue;
    }
    if (series[key]) continue; // first occurrence wins
    series[key] = r.cells.map(parseNum);
  }
  return { cols, series, layout };
}

function buildRecords(cols, series, kind) {
  const recs = [];
  cols.forEach((col, i) => {
    if (!col) return;
    const rec = { period: col.period };
    if (!col.ttm) {
      rec.yyyymm = col.yyyymm;
      Object.assign(
        rec,
        kind === 'quarter' ? quarterLabel(col.month, col.year) : yearLabel(col.month, col.year)
      );
    }
    // Every key is always present (null when the row was absent/skipped) so consumers never see `undefined`.
    for (const k of ROW_KEY_SET) rec[k] = series[k] && series[k][i] != null ? series[k][i] : null;
    recs.push(rec);
  });
  return recs;
}

/**
 * Cheap internal-consistency checks on the (rounded) figures. Warnings only --
 * rounding to whole Cr can legitimately produce +/-2 on small companies.
 */
function sanityWarnings(recs, name, layout) {
  const w = [];
  if (layout !== 'industrial') return w;
  for (const r of recs) {
    if (r.revenue != null && r.expenses != null && r.operating_profit != null) {
      const d = Math.abs(r.revenue - r.expenses - r.operating_profit);
      if (d > 2)
        w.push(`${name} ${r.period}: revenue - expenses != operating_profit (off by ${d})`);
    }
    if (
      [r.pbt, r.operating_profit, r.other_income, r.interest, r.depreciation].every(
        (v) => v != null
      )
    ) {
      const d = Math.abs(r.operating_profit + r.other_income - r.interest - r.depreciation - r.pbt);
      if (d > 3)
        w.push(
          `${name} ${r.period}: OP + other income - interest - depreciation != PBT (off by ${d})`
        );
    }
  }
  return w;
}

/**
 * Pure parser. Throws if the quarterly P&L table can't be found (layout
 * changed, or the page is a login wall / error page) -- a loud failure beats
 * silently ranking on missing actuals.
 *
 * @param {string} html - raw company page HTML.
 * @returns {{layout:'industrial'|'financial', basis:string|null, quarters:Object[], years:Object[], ttm:Object|null, warnings:string[]}}
 */
function parseCompanyPage(html) {
  if (typeof html !== 'string' || !html.length) throw new Error('company page: empty HTML');
  const warnings = [];
  const tables = allTables(html).map(parseTable);

  const qTable = tables.find((t) => t.header[0] === 'Quarter' && isPnlTable(t));
  if (!qTable) {
    throw new Error(
      `company page: quarterly P&L table not found (html ${html.length} bytes, ${tables.length} tables) -- page layout changed, company has no financials, or auth token expired`
    );
  }
  const yTable = tables.find((t) => t.header[0] === 'Financial Year' && isPnlTable(t));
  if (!yTable) warnings.push('annual P&L table not found -- FY baselines unavailable');

  const q = tableToSeries(qTable, warnings, 'quarterly');
  const quarters = buildRecords(q.cols, q.series, 'quarter').filter((r) => r.yyyymm);
  warnings.push(...sanityWarnings(quarters, 'quarterly', q.layout));
  for (let i = 1; i < quarters.length; i++) {
    if (quarters[i].yyyymm <= quarters[i - 1].yyyymm) {
      warnings.push(`quarterly columns not strictly chronological at ${quarters[i].period}`);
      break;
    }
  }

  let years = [];
  let ttm = null;
  if (yTable) {
    const y = tableToSeries(yTable, warnings, 'annual');
    const recs = buildRecords(y.cols, y.series, 'year');
    ttm = recs.find((r) => r.period === 'TTM') || null;
    years = recs.filter((r) => r.yyyymm);
    warnings.push(...sanityWarnings(years, 'annual', y.layout));
    if (y.layout !== q.layout)
      warnings.push('quarterly and annual tables disagree on layout (industrial vs financial)');
  }

  // "activeView" is a substring of the CSS-module class; the visible text is what matters.
  const basisMatch = html.match(/activeView[^>]*>\s*(Consolidated|Standalone)\s*</i);
  const basis = basisMatch ? basisMatch[1].toLowerCase() : null;

  return { layout: q.layout, basis, quarters, years, ttm, warnings };
}

// ── Baseline selection (pure) ────────────────────────────────────────────────

const ORDER = ['Q1', 'Q2', 'Q3', 'Q4'];

function shiftQuarter({ fiscalYear, fiscalPeriod }, n) {
  const idx = fiscalYear * 4 + ORDER.indexOf(fiscalPeriod) + n;
  return { fiscalYear: Math.floor(idx / 4), fiscalPeriod: ORDER[((idx % 4) + 4) % 4] };
}

function findQuarter(quarters, q) {
  return (
    quarters.find((r) => r.fiscalYear === q.fiscalYear && r.fiscalPeriod === q.fiscalPeriod) || null
  );
}

/**
 * Share of full-year revenue that each quarter contributed, for every fiscal
 * year whose four quarters are all present in the 12-quarter window. The
 * default phasing input for compute_growth_deltas.py (seasonality of past
 * results); the LLM may override the weights when guidance says otherwise.
 */
function seasonalShares(quarters) {
  const byFy = {};
  for (const r of quarters) (byFy[r.fiscalYear] ||= {})[r.fiscalPeriod] = r.revenue;
  const out = {};
  for (const [fy, qs] of Object.entries(byFy)) {
    const vals = ORDER.map((p) => qs[p]);
    if (vals.some((v) => v == null || v <= 0)) continue;
    const total = vals.reduce((a, b) => a + b, 0);
    out[`FY${String(fy).slice(-2)}`] = Object.fromEntries(
      ORDER.map((p, i) => [p, +(vals[i] / total).toFixed(4)])
    );
  }
  return out;
}

/**
 * The comparator set for "what is guided vs. what has been delivered":
 *   latest_quarter    last REPORTED quarter (= the QoQ base for the next quarter)
 *   next_quarter      the first NOT-yet-reported quarter (the projection target)
 *   year_ago_quarter  same quarter as next_quarter, one year earlier (YoY base)
 *   latest_year_ago   same quarter as latest_quarter, one year earlier
 *   last_fy           the most recent COMPLETED fiscal year in the annual table (FYoFY base)
 *   ytd_quarters      reported quarters of the FY that next_quarter belongs to
 *                     (empty right after a Q4)
 *   seasonality       per-FY quarterly revenue shares (see seasonalShares)
 *
 * Callers that need a different FY base (guidance for FY28 while FY27 is not
 * yet complete, say) can pick straight from `years` -- this is the common case.
 */
function selectBaselines(parsed) {
  const reported = parsed.quarters.filter((r) => r.revenue != null && r.fiscalYear);
  const latest = reported[reported.length - 1] || null;
  if (!latest) return { latest_quarter: null, warnings: ['no reported quarters'] };

  const next = shiftQuarter(latest, 1);
  const latestCompleteFy = latest.fiscalPeriod === 'Q4' ? latest.fiscalYear : latest.fiscalYear - 1;
  const completeYears = parsed.years.filter(
    (y) => y.fiscalYear <= latestCompleteFy && y.revenue != null
  );

  return {
    latest_quarter: latest,
    next_quarter: { ...next, fq: `${next.fiscalPeriod}FY${String(next.fiscalYear).slice(-2)}` },
    year_ago_quarter: findQuarter(parsed.quarters, shiftQuarter(next, -4)),
    latest_year_ago: findQuarter(parsed.quarters, shiftQuarter(latest, -4)),
    last_fy: completeYears[completeYears.length - 1] || null,
    ytd_quarters: reported.filter((r) => r.fiscalYear === next.fiscalYear),
    seasonality: seasonalShares(parsed.quarters),
  };
}

// ── Cache + fetch ────────────────────────────────────────────────────────────

function cacheRel(companyId) {
  const safe = String(sanitizeCompanyId(companyId)).replace(/[^A-Za-z0-9:_-]+/g, '_');
  return `cache/company-financials/${safe}.json`;
}

/** A cached bundle if it exists and is younger than ttlHours, else null. */
function readCache(companyId, ttlHours = DEFAULT_TTL_HOURS, now = Date.now()) {
  let c;
  try {
    c = StorageService.readJson(cacheRel(companyId));
  } catch (_) {
    return null;
  }
  if (!c || !c.fetchedAt) return null;
  const age = now - Date.parse(c.fetchedAt);
  return Number.isFinite(age) && age <= ttlHours * 3600 * 1000 ? c : null;
}

/**
 * Fetch (or read from the 24h cache) + parse + baselines for one company.
 * Cache = de-dup across skills/runs so two consumers never disagree on the
 * same actuals (conventions.md #17a). Financials only change when a new
 * result is filed, so 24h is safe; pass force=true right after a filing.
 *
 * @param {string} companyId
 * @param {{client: {companyPageHtml: Function}, force?: boolean, ttlHours?: number}} opts
 *   `client` is passed explicitly (a StockscansClient with its job name
 *   already set) -- no ambient global client.
 */
async function getCompanyFinancials(
  companyId,
  { client, force = false, ttlHours = DEFAULT_TTL_HOURS } = {}
) {
  if (!client) throw new Error('getCompanyFinancials: `client` (StockscansClient) is required');
  const id = sanitizeCompanyId(companyId);
  if (!force) {
    const cached = readCache(id, ttlHours);
    if (cached) return { ...cached, fromCache: true };
  }
  const parsed = parseCompanyPage(await client.companyPageHtml(id));
  const payload = {
    companyId: id,
    fetchedAt: new Date().toISOString(),
    ...parsed,
    baselines: selectBaselines(parsed),
  };
  await StorageService.saveJson(cacheRel(id), payload);
  return { ...payload, fromCache: false };
}

module.exports = {
  parseCompanyPage,
  selectBaselines,
  seasonalShares,
  getCompanyFinancials,
  readCache,
  // exported for tests
  parseNum,
  parsePeriodHeader,
  quarterLabel,
  yearLabel,
  shiftQuarter,
  textNodes,
  ROW_KEYS,
};
