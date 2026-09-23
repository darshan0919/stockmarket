#!/usr/bin/env node
'use strict';

/**
 * extract_income_statement.js — locates the Statement of Profit & Loss in a
 * Result filing's layout-preserving text and parses it into the exact
 * `lineData`/`context` shape `incomeStatementSignals.js`'s `getOrCompute()`
 * expects, deterministically, zero LLM.
 *
 * WHY THIS EXISTS. Step 2 of this skill (income-statement signal scan) has
 * always assumed a caller already hands it `lineData` — "parsed from the
 * Result filing text" — without saying how. In practice that meant an agent
 * reading `pdftotext -layout` output and hand-transcribing three columns of
 * numbers per line (confirmed during the 2026-09-23 SUPRIYA run: the ONE
 * manual, judgment-free step in an otherwise fully-scripted pipeline, in
 * direct tension with conventions.md §17's Extraction-First rule and the
 * repo's script-first convention generally). extract_statements.js (Step
 * 2.6) already solved this exact problem for the balance sheet and cash
 * flow statement — locate section, detect unit scale, parse "label then
 * numbers" rows, map labels to normalized keys. This script is the same
 * pattern applied to the P&L, plus the derived-metric arithmetic
 * (core EBITDA, margins, effective tax rate, EPS dilution gap) that used to
 * be recomputed by hand every run.
 *
 * COLUMN CONVENTION. Indian quarterly Result filings print the P&L table
 * with the current quarter FIRST, then the immediately preceding quarter,
 * then the corresponding quarter of the prior year (YTD/full-year columns,
 * when present, follow after and are ignored here — this script only reads
 * the three quarter-on-quarter/year-on-year columns quarterly-result-
 * analysis needs). That column order is what extract_statements.js's own
 * doc comment relies on ("filings print current-period-first"); this script
 * makes the same assumption explicit by capturing exactly 3 numeric tokens
 * per row instead of extract_statements.js's 2 (BS/CF tables are usually
 * only current + one comparative column).
 *
 * Usage:
 *   node extract_income_statement.js \
 *     --result-text "$DOCS_DIR/result.txt" \
 *     [--ppt-text "$DOCS_DIR/ppt.txt"]
 *
 * Output (stdout, JSON): { found, source, unit, rowsParsed, unmatched,
 * raw: {cur, qoq, yoy}, lineData, context, headline } — `lineData`/`context`
 * are ready to pass straight into incomeStatementSignals.js's getOrCompute();
 * `headline` is ready for compute_headline_financials.js's --current/--prior-q/
 * --prior-y inputs. `unmatched` rows are returned, never dropped silently,
 * for a caller to sanity-check or assign by hand — filings phrase P&L labels
 * inconsistently (same residue-handling contract as extract_statements.js).
 */

const fs = require('fs');
const {
  parseRows,
  detectUnitScale,
  locateSection,
  BS_HEADINGS,
  CF_HEADINGS,
} = require('./extract_statements.js');

// ── args ─────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { resultText: null, pptText: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--result-text') out.resultText = argv[++i];
    else if (a === '--ppt-text') out.pptText = argv[++i];
  }
  return out;
}
function readIfExists(p) {
  if (!p || !fs.existsSync(p)) return null;
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (_) {
    return null;
  }
}

// ── section location ────────────────────────────────────────────────────
// A Result filing's P&L table sits under one of these headings, and (unlike
// BS/CF, which are absent from Q1/Q3 filings under Reg 33(3)) is ALWAYS
// present — every quarterly Result filing has one for the quarter just
// ended, which is exactly why Step 2 has never needed a staleness check the
// way Step 2.6 does.
// Most robust anchor: a P&L table's column header ("Particulars") is ALWAYS
// followed shortly by "Revenue from operations" as the first data row,
// regardless of how the table's own TITLE is worded. Title wording turned
// out to vary far more than expected — confirmed 2026-09-23 testing 7 more
// real filings: "Statement of Consolidated Unaudited Financial Results for
// the Quarter Ended ..." (SUPRIYA) vs "Consolidated Unaudited Financial
// Results for the Quarter June 30, 2026" (ACUTAAS -- no leading "Statement
// of", no "ended") vs other permutations. Worse: a title-wording regex
// broad enough to catch that variance ALSO matches the boilerplate
// AUDITOR'S REPORT sentence ("...consolidated unaudited financial results
// ... for the quarter ended...") that appears earlier in the same PDF,
// and — because locateSection() prefers whichever hit has "consolidated"
// in its own vicinity — that boilerplate sentence can outrank the real
// table (confirmed on OPTIEMUS: the real table has no "consolidated" word
// near its own "Particulars" header, so the WRONG, earlier, auditor's-report
// hit won on the tie-break). A title-wording regex is a losing game across
// ~7000 independently-formatted filings; a structural anchor on the table's
// own content is not, and — critically — it must be tried ALONE first (see
// extractIncomeStatement below), never merged into the same hit pool as the
// wording fallbacks, or the same false-positive class recurs.
// "Revenue from operations" isn't universal -- confirmed 2026-09-23: an IT/
// services filing (EMUDHRA) labels the same line "Income" under an "Income
// from operations" section header, never using the word "revenue" at all;
// and a separate 80-company shadow pass (2026-09-23) found CYIENT (also
// IT/services) labels its top revenue line "Revenue from contracts with
// customers" (Ind AS 115 wording) -- neither "revenue from operations" nor
// "income from operations" ever appears in that filing at all.
const REVENUE_LINE_RE_SRC =
  'revenue\\s+from\\s+operations?|income\\s+from\\s+operations?|revenue\\s+from\\s+contracts\\s+with\\s+customers';

// Window widened 400->800 chars 2026-09-23: the 80-company shadow pass found
// a real filing (PAYTM) whose "Particulars" column header sits 572 chars
// before its "Revenue from operations" row (multiple intervening date-column
// header lines) -- inside the old 400-char budget the anchor simply never
// fired, even though both structural elements were present and correctly
// ordered.
const IS_HEADING_ANCHOR = new RegExp(
  `particulars[\\s\\S]{0,800}?(?:${REVENUE_LINE_RE_SRC})`,
  'i'
);

// Title-wording fallbacks, tried only if the anchor above finds nothing at
// all (e.g. "Particulars" and the revenue line further apart than 800
// chars, or "Particulars" absent altogether). Kept deliberately separate
// from IS_HEADING_ANCHOR.
const IS_HEADINGS_FALLBACK = [
  /statement\s+of\s+(?:standalone\s+|consolidated\s+)?(?:un)?audited\s+(?:financial\s+)?results?\s+for\s+the/i,
  /(?:standalone\s+|consolidated\s+)?(?:un)?audited\s+(?:financial\s+)?results?\s+for\s+the\s+quarter/i,
  /statement\s+of\s+(?:standalone\s+|consolidated\s+)?profit\s+and\s+loss/i,
  /\(?[$%~]?\s*rs\.?\s*in\s*(?:lakh|million|crore)s?\)?\s*\n?\s*particulars/i,
];

// Last-resort structural anchor: the revenue line itself, with NO
// requirement that "particulars" appear anywhere nearby. Confirmed
// necessary 2026-09-23 (WESTLIFE): the real P&L table's revenue row
// ("(a) Revenue from operations") has no "Particulars" heading in its
// vicinity at all in that filing's layout, so IS_HEADING_ANCHOR can never
// match it regardless of window size, and the title-wording fallbacks also
// missed it. This is deliberately the LOWEST-precision, LAST-tried option --
// a bare revenue-line match could in principle hit a narrative sentence
// ("revenue from operations declined...") rather than a real table -- but
// extractIncomeStatement's existing downstream guards (>=6 rows parsed,
// revenue+pbt both present, checkInternalConsistency) already exist
// specifically to catch and reject exactly that kind of false positive
// rather than trust it, so adding a broader-but-guarded anchor only adds
// coverage, it doesn't weaken the checks that protect against wrong output.
const IS_HEADING_ANCHOR_NO_PARTICULARS = new RegExp(`(?:${REVENUE_LINE_RE_SRC})`, 'i');

// Kept for anything external still importing the old combined name.
const IS_HEADINGS = [IS_HEADING_ANCHOR, ...IS_HEADINGS_FALLBACK];
const CONSOLIDATED = /consolidated/i;

// ── label -> normalized key map ─────────────────────────────────────────
// Ordered most-specific-first (same convention as extract_statements.js's
// BS_MAP/CF_MAP): "profit before exceptional items and tax" must be checked
// before the generic "profit before tax" line further down the table, etc.
const IS_MAP = [
  [/total\s+income/i, 'totalIncome'],
  // 'operations?' 2026-09-23: TFCILTD's real filing labels this row
  // "Revenue from Operation" (singular) -- confirmed on a real doc, not a
  // hypothetical -- and the old plural-only regex silently missed it.
  [/revenue\s+from\s+operations?/i, 'revenue'],
  [/revenue\s+from\s+contracts\s+with\s+customers/i, 'revenue'],
  [/^income$|^income\s*\(net\)$/i, 'revenue'],
  [/other\s+income/i, 'otherIncome'],
  [/cost\s+of\s+materials?\s+consumed/i, 'costOfMaterials'],
  [/purchases?\s+of\s+stock[-\s]in[-\s]trade/i, 'purchasesOfStockInTrade'],
  [/changes?\s+in\s+inventor/i, 'changeInInventories'],
  [/employee\s+benefit/i, 'employeeCost'],
  [/finance\s+cost/i, 'interest'],
  [/depreciation.*amorti[sz]ation/i, 'depreciation'],
  [/other\s+expens|other\s+expenditure/i, 'otherExpenses'],
  [/total\s+expens/i, 'totalExpenses'],
  [/(?:profit|loss).*before\s+exceptional\s+items?\s+and\s+tax/i, 'pbtBeforeExceptional'],
  [/exceptional\s+items?/i, 'exceptionalItems'],
  // Leading word made (profit|loss) rather than a mandatory "profit" 2026-09-23:
  // the 80-company shadow pass found several genuinely loss-making companies
  // (RBA confirmed) label this row purely "Loss before tax [...]" with no
  // "profit" substring anywhere in it -- the old profit-only regex silently
  // never matched a real, cleanly-formatted PBT row for any company reporting
  // a quarterly loss, which is a systematic bias (misses loss-makers, not a
  // rare edge case), not a one-off formatting quirk.
  [/(?:profit|loss)(?:\s*\/\s*\(?loss\)?)?.*before\s+tax/i, 'pbt'],
  [/current\s+tax/i, 'currentTax'],
  [/deferred\s+tax/i, 'deferredTax'],
  [/tax\s+expense/i, 'tax'],
  [/(?:profit|loss)(?:\s*\/\s*\(?loss\)?)?.*for\s+the\s+(period|quarter|year)/i, 'pat'],
  [/basic\b/i, 'epsBasic'],
  [/diluted\b/i, 'epsDiluted'],
];

/** Capture up to 3 leading numeric columns per row (current, QoQ, YoY). */
function mapRows3Col(rows, map, toCr) {
  const cur = {};
  const qoq = {};
  const yoy = {};
  // A half-year/full-year filing prints 2 further columns after the 3
  // quarterly ones: the cumulative (YTD or FY) figure for the current period
  // and for the prior year's same window (confirmed 2026-09-23 against a
  // real Q4/FY filing: columns were [Q4 cur, Q3 preceding, Q4 py, FY cur, FY
  // py] -- 5 columns, not 3). These are exactly what a BS/CF context needs
  // (revenueForPeriod, ebitdaForPeriod, ... must cover the SAME window as the
  // statement, per balance-sheet-signals.md/cashflow-signals.md) -- Q1/Q3
  // filings simply won't have them, which is fine, `ytd` stays empty.
  const ytdCur = {};
  const ytdPrior = {};
  const unmatched = [];
  const seen = new Set();
  for (const row of rows) {
    const hit = map.find(([re]) => re.test(row.label));
    if (!hit) {
      unmatched.push({ label: row.label, values: row.values });
      continue;
    }
    const key = hit[1];
    if (seen.has(key)) continue; // first occurrence wins
    seen.add(key);
    const scale = (v) => (toCr == null || key.startsWith('eps') ? v : v * toCr);
    if (row.values[0] != null) cur[key] = scale(row.values[0]);
    if (row.values[1] != null) qoq[key] = scale(row.values[1]);
    if (row.values[2] != null) yoy[key] = scale(row.values[2]);
    if (row.values[3] != null) ytdCur[key] = scale(row.values[3]);
    if (row.values[4] != null) ytdPrior[key] = scale(row.values[4]);
  }
  return { cur, qoq, yoy, ytdCur, ytdPrior, unmatched };
}

// ── derived metrics (same formulas as the manual build script this replaces) ─
function coreEbitda(p) {
  if (
    p.revenue == null ||
    p.costOfMaterials == null ||
    p.employeeCost == null ||
    p.otherExpenses == null
  ) {
    return null;
  }
  const inv = p.changeInInventories || 0;
  return p.revenue - (p.costOfMaterials + inv + p.employeeCost + p.otherExpenses);
}
function taxRate(p) {
  const tax = (p.currentTax || 0) + (p.deferredTax || 0) || p.tax;
  if (tax == null || !p.pbt) return null;
  return (tax / p.pbt) * 100;
}
function pctOfSales(p) {
  if (p.costOfMaterials == null || !p.revenue) return null;
  return (p.costOfMaterials / p.revenue) * 100;
}
function bps(a, b) {
  return a != null && b != null ? Math.round((a - b) * 100) : null;
}
function pct(a, b) {
  return a != null && b != null && b !== 0 ? ((a - b) / b) * 100 : null;
}

function buildLineDataAndContext({ cur, qoq, yoy }) {
  const ebitdaCur = coreEbitda(cur);
  const ebitdaQoq = coreEbitda(qoq);
  const ebitdaYoy = coreEbitda(yoy);
  const marginCur = ebitdaCur != null && cur.revenue ? (ebitdaCur / cur.revenue) * 100 : null;
  const marginQoq = ebitdaQoq != null && qoq.revenue ? (ebitdaQoq / qoq.revenue) * 100 : null;
  const marginYoy = ebitdaYoy != null && yoy.revenue ? (ebitdaYoy / yoy.revenue) * 100 : null;

  const pctSalesCur = pctOfSales(cur);
  const pctSalesQoq = pctOfSales(qoq);
  const pctSalesYoy = pctOfSales(yoy);

  const rateCur = taxRate(cur);
  const rateQoq = taxRate(qoq);
  const rateYoy = taxRate(yoy);

  const revenueYoyPct = pct(cur.revenue, yoy.revenue);
  const revenueQoqPct = pct(cur.revenue, qoq.revenue);
  const pbtDeltaYoY = cur.pbt != null && yoy.pbt != null ? cur.pbt - yoy.pbt : null;

  const epsDilutionGapPct =
    cur.epsDiluted && cur.epsBasic ? ((cur.epsBasic - cur.epsDiluted) / cur.epsBasic) * 100 : 0;

  const lineData = {
    revenue: { value: cur.revenue, qoq: qoq.revenue, yoy: yoy.revenue },
    otherIncome: { value: cur.otherIncome, qoq: qoq.otherIncome, yoy: yoy.otherIncome },
    costOfMaterials: {
      value: cur.costOfMaterials,
      qoq: qoq.costOfMaterials,
      yoy: yoy.costOfMaterials,
      pctOfSalesQoQDeltaBps: bps(pctSalesCur, pctSalesQoq),
    },
    changeInInventories: {
      value: cur.changeInInventories ?? 0,
      qoq: qoq.changeInInventories ?? 0,
      yoy: yoy.changeInInventories ?? 0,
    },
    employeeCost: { value: cur.employeeCost, qoq: qoq.employeeCost, yoy: yoy.employeeCost },
    otherExpenses: { value: cur.otherExpenses, qoq: qoq.otherExpenses, yoy: yoy.otherExpenses },
    ebitdaMarginBps: { value: bps(marginCur, marginYoy) },
    depreciation: { value: cur.depreciation, qoq: qoq.depreciation, yoy: yoy.depreciation },
    interest: { value: cur.interest, qoq: qoq.interest, yoy: yoy.interest },
    exceptionalItems: {
      value: cur.exceptionalItems || 0,
      qoq: qoq.exceptionalItems || 0,
      yoy: yoy.exceptionalItems || 0,
    },
    tax: {
      value: (cur.currentTax || 0) + (cur.deferredTax || 0) || cur.tax,
      qoq: (qoq.currentTax || 0) + (qoq.deferredTax || 0) || qoq.tax,
      yoy: (yoy.currentTax || 0) + (yoy.deferredTax || 0) || yoy.tax,
      effectiveRateDeltaBps: bps(rateCur, rateYoy),
    },
    epsDilutionGapPct: { value: epsDilutionGapPct },
    minorityInterest: { value: null, qoq: null, yoy: null },
  };

  const context = {
    pbt: cur.pbt,
    pbtDelta: pbtDeltaYoY,
    revenueYoyPct,
    trailingAvgGrowthPct: null, // this script reads only 3 periods — a caller with more history can override
  };

  const headline = {
    revenue: {
      value: cur.revenue,
      qoq: qoq.revenue,
      yoy: yoy.revenue,
      qoqPct: revenueQoqPct,
      yoyPct: revenueYoyPct,
    },
    ebitdaMargin: {
      value: marginCur,
      qoq: marginQoq,
      yoy: marginYoy,
      bpsQoQ: bps(marginCur, marginQoq),
      bpsYoY: bps(marginCur, marginYoy),
    },
    ebitda: { value: ebitdaCur, qoq: ebitdaQoq, yoy: ebitdaYoy },
    pat: {
      value: cur.pat,
      qoq: qoq.pat,
      yoy: yoy.pat,
      qoqPct: pct(cur.pat, qoq.pat),
      yoyPct: pct(cur.pat, yoy.pat),
    },
    effectiveTaxRate: {
      value: rateCur,
      qoq: rateQoq,
      yoy: rateYoy,
      bpsQoQ: bps(rateCur, rateQoq),
      bpsYoY: bps(rateCur, rateYoy),
    },
    eps: {
      basic: cur.epsBasic,
      diluted: cur.epsDiluted,
      qoqBasic: qoq.epsBasic,
      yoyBasic: yoy.epsBasic,
    },
    costOfMaterialsPctSales: {
      value: pctSalesCur,
      qoq: pctSalesQoq,
      deltaBpsQoQ: bps(pctSalesCur, pctSalesQoq),
      yoy: pctSalesYoy,
      deltaBpsYoY: bps(pctSalesCur, pctSalesYoy),
    },
  };

  return { lineData, context, headline };
}

/**
 * Cumulative (YTD/FY) EBITDA/tax, for BS/CF context — NOT a full headline
 * (no QoQ/YoY move framing makes sense for a cumulative figure standing
 * alone; that's the whole point of `context.periodLabel` in cashflow-signals.md).
 */
function buildYtdSummary(ytd) {
  if (ytd.revenue == null || ytd.pbt == null) return null;
  return {
    revenue: ytd.revenue,
    ebitda: coreEbitda(ytd),
    pat: ytd.pat != null ? ytd.pat : null,
    taxCharge: (ytd.currentTax || 0) + (ytd.deferredTax || 0) || ytd.tax || null,
    financeCost: ytd.interest != null ? ytd.interest : null,
    // Single-line proxy, not a full COGS build-up (materials only, excludes
    // employee cost / other manufacturing overhead) -- deliberately not
    // presented as more precise than it is. balanceSheetSignals.js's own
    // `ctx.cogsAnnualised ?? ctx.revenueAnnualised` fallback exists for
    // exactly this: pass it through, and inventoryDays/payableDays read
    // against revenue instead when this proxy isn't good enough for the
    // caller's purposes.
    costOfMaterials: ytd.costOfMaterials != null ? ytd.costOfMaterials : null,
  };
}

function locateIncomeStatementSection(text) {
  const stopAt = [...BS_HEADINGS, ...CF_HEADINGS];
  // Tried in strictly descending precision order, each in its OWN unmixed
  // hit pool (never merged -- see IS_HEADINGS_FALLBACK's comment on why
  // mixing pools let a boilerplate auditor's-report sentence outrank a real
  // table on OPTIEMUS): (1) particulars-anchored revenue line, (2) title
  // wording, (3) bare revenue line with no particulars requirement at all.
  return (
    locateSection(text, [IS_HEADING_ANCHOR], { stopAt }) ||
    locateSection(text, IS_HEADINGS_FALLBACK, { stopAt }) ||
    locateSection(text, [IS_HEADING_ANCHOR_NO_PARTICULARS], { stopAt })
  );
}

/**
 * Cross-check the parsed row totals against each other. A layout-preserving
 * text extraction can still hand back individually-plausible-looking but
 * internally INCONSISTENT numbers when the source PDF's own text layer is
 * corrupted (confirmed 2026-09-23 on a real filing: "Revenue from
 * operations" parsed as 127.75 against a "Total income" of 92,395 on the
 * SAME row set -- a >700x mismatch that no label-matching or marker-
 * stripping fix can repair, because the corruption is in the SOURCE
 * document's character data, not in how this script reads it). Rather than
 * silently returning numbers that merely LOOK like a result, checking
 * `totalIncome ≈ revenue + otherIncome` catches this class of failure and
 * lets the caller refuse the extraction instead of analysing garbage.
 */
function checkInternalConsistency({ cur }) {
  if (cur.totalIncome == null || cur.revenue == null) return { reliable: true };
  const expected = cur.revenue + (cur.otherIncome || 0);
  if (expected === 0) return { reliable: true };
  const deltaPct = Math.abs((cur.totalIncome - expected) / expected) * 100;
  if (deltaPct > 15) {
    return {
      reliable: false,
      reason: `Total income (${cur.totalIncome}) does not reconcile with revenue + other income (${expected}) -- off by ${deltaPct.toFixed(0)}%. This usually means the source PDF's text layer is corrupted (garbled characters/digits), not a label-matching miss.`,
    };
  }
  return { reliable: true };
}

function extractIncomeStatement({ resultText, pptText }) {
  for (const [sourceName, text] of [
    ['Result', resultText],
    ['PPT', pptText],
  ]) {
    const sec = locateIncomeStatementSection(text);
    if (!sec) continue;
    const scale = detectUnitScale(sec.body);
    const rows = parseRows(sec.body);
    if (rows.length < 6) continue; // a real P&L table has well over 6 line items
    const { cur, qoq, yoy, ytdCur, ytdPrior, unmatched } = mapRows3Col(rows, IS_MAP, scale.toCr);
    // Fallback: when a filing has no exceptional items in the quarter, some
    // companies print ONLY "Profit/(Loss) before exceptional items and tax"
    // and never a separate "...before tax" line -- confirmed 2026-09-23
    // (MBAPL, KRISHANA) on real filings where pbtBeforeExceptional was
    // cleanly parsed but pbt stayed null purely because that second, no-
    // exceptional-items line doesn't exist in the document at all. In the
    // no-exceptional-items case the two are numerically the same figure, so
    // this is a safe substitution, not a guess -- applied uniformly across
    // cur/qoq/yoy/ytd so tax-rate and delta calculations stay consistent.
    for (const snap of [cur, qoq, yoy, ytdCur, ytdPrior]) {
      if (snap.pbt == null && snap.pbtBeforeExceptional != null) {
        snap.pbt = snap.pbtBeforeExceptional;
      }
    }
    if (cur.revenue == null || cur.pbt == null) continue; // didn't actually find the table
    const consistency = checkInternalConsistency({ cur });
    if (!consistency.reliable) continue; // try the next source (Result -> PPT) rather than trust it
    const derived = buildLineDataAndContext({ cur, qoq, yoy });
    const ytd = {
      current: Object.keys(ytdCur).length ? buildYtdSummary(ytdCur) : null,
      prior: Object.keys(ytdPrior).length ? buildYtdSummary(ytdPrior) : null,
    };
    return {
      found: true,
      source: sourceName,
      consolidated: sec.consolidated,
      unit: scale.unit,
      rowsParsed: rows.length,
      unmatched,
      raw: { cur, qoq, yoy, ytdCur, ytdPrior },
      ytd,
      ...derived,
    };
  }
  return {
    found: false,
    reason:
      'no reliable P&L table located in either source -- either no heading/structural anchor matched, too few rows parsed, revenue/pbt missing, or the parsed totals failed the internal-consistency check (see checkInternalConsistency)',
    raw: { cur: {}, qoq: {}, yoy: {}, ytdCur: {}, ytdPrior: {} },
    ytd: { current: null, prior: null },
  };
}

function emit(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const resultText = readIfExists(args.resultText);
  const pptText = readIfExists(args.pptText);
  if (!resultText && !pptText) {
    emit({
      found: false,
      error: 'no document text supplied — pass --result-text and/or --ppt-text',
    });
    process.exit(1);
  }
  emit(extractIncomeStatement({ resultText, pptText }));
}

if (require.main === module) main();

module.exports = {
  IS_MAP,
  IS_HEADINGS,
  IS_HEADING_ANCHOR,
  IS_HEADING_ANCHOR_NO_PARTICULARS,
  IS_HEADINGS_FALLBACK,
  mapRows3Col,
  buildLineDataAndContext,
  extractIncomeStatement,
  locateIncomeStatementSection,
  checkInternalConsistency,
  coreEbitda,
  taxRate,
  pctOfSales,
};
