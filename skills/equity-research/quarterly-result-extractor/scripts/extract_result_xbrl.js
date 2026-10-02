#!/usr/bin/env node
'use strict';

/**
 * extract_result_xbrl.js — XBRL-first replacement for Step 2 / Step 2.6 inputs.
 *
 * Pulls the company's results XBRL from NSE (then BSE) for the current quarter,
 * the prior quarter and the year-ago quarter, maps them onto the SAME
 * `lineData` / `context` / `headline` / statements shapes the PDF scripts emit,
 * and falls back to the PDF path per period whenever XBRL is missing:
 *   - current period missing  -> the whole output is the PDF result (found via
 *     extract_income_statement.js) and `usePdfStatements` is true;
 *   - prior/year-ago missing  -> that period is filled from the PDF's printed
 *     comparative column (needs --result-text) and tagged source "pdf".
 * Every value carries provenance; every gap is an entry in `issues`.
 *
 * Usage:
 *   node extract_result_xbrl.js --companyId NSE:X [--quarter-end 2026-06-30] [--bse-scrip 500325]
 *     [--basis auto|consolidated|standalone] [--result-text f] [--ppt-text f]
 *     [--out-dir dir]   (writes income_statement.json, statements.json, xbrl_issues.json)
 *
 * stdout: the income-statement object (same shape as extract_income_statement.js
 * plus `provenance`, `issues`). Never throws on missing XBRL.
 */

const fs = require('fs');
const path = require('path');
const { NseClient } = require('../../../../stock-api/src/clients/NseClient.js');
const { BseClient } = require('../../../../stock-api/src/clients/BseClient.js');
const { createIssueLog } = require('../../../../packages/jobs-runtime/lib/xbrl/issues.js');
const { NON_INDUSTRIAL } = require('../../../../packages/jobs-runtime/lib/xbrl/resultsFamilies.js');
const {
  resolveResultPeriods,
} = require('../../../../packages/jobs-runtime/lib/xbrl/resultsResolver.js');
const {
  buildLineDataAndContext,
  buildYtdSummary,
  extractIncomeStatement,
} = require('./extract_income_statement.js');

function parseArgs(argv) {
  const o = {
    companyId: null,
    quarterEnd: null,
    basis: 'auto',
    resultText: null,
    pptText: null,
    outDir: null,
    bseScrip: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--companyId') o.companyId = argv[++i];
    else if (a === '--quarter-end') o.quarterEnd = argv[++i];
    else if (a === '--basis') o.basis = argv[++i];
    else if (a === '--result-text') o.resultText = argv[++i];
    else if (a === '--ppt-text') o.pptText = argv[++i];
    else if (a === '--out-dir') o.outDir = argv[++i];
    else if (a === '--bse-scrip') o.bseScrip = argv[++i];
  }
  return o;
}

const readIf = (p) => (p && fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
const near = (a, b, tol = 0.005) =>
  a != null && b != null && Math.abs(a - b) <= Math.max(0.06, Math.abs(b) * tol);

/** Coverage label from cumulative window length in days. */
function coverageOf(days) {
  if (days == null) return 'unknown';
  if (days > 300) return 'full-year';
  if (days > 240) return 'nine-month';
  if (days > 150) return 'half-year';
  return 'quarter';
}

/**
 * Build the income-statement and statements outputs from resolved periods.
 * Pure (no I/O) so it can be unit-tested.
 * @param {Object} r - Result of resolveResultPeriods (cur ok).
 * @param {Object|null} pdf - extractIncomeStatement() result, or null.
 * @param {ReturnType<createIssueLog>} issues
 * @returns {{incomeStatement: Object, statements: Object}}
 */
function assemble(r, pdf, issues) {
  const symbol = r.symbol;
  const log = (i) => issues.add({ symbol, filingType: 'results', ...i });
  const provenance = {
    cur: {
      source: `xbrl-${r.cur.exchange.toLowerCase()}`,
      file: r.cur.file,
      broadcast: r.cur.broadcast,
    },
  };
  const pick = (period, name) => {
    if (period?.ok) {
      provenance[name] = {
        source: `xbrl-${period.exchange.toLowerCase()}`,
        file: period.file,
        broadcast: period.broadcast,
      };
      return period.is;
    }
    if (pdf?.found && pdf.raw?.[name] && Object.keys(pdf.raw[name]).length) {
      provenance[name] = { source: 'pdf', reason: period?.reason || 'not-found' };
      log({
        category: 'FALLBACK_USED',
        severity: 'info',
        period: r.quarterEnd,
        message: `${name} comparative taken from PDF (XBRL ${period?.reason || 'missing'})`,
      });
      return pdf.raw[name];
    }
    provenance[name] = { source: 'missing', reason: period?.reason || 'not-found' };
    log({
      category: 'MISSING_FILING',
      severity: 'major',
      period: r.quarterEnd,
      message: `${name} comparative unavailable from XBRL and PDF`,
    });
    return {};
  };
  const cur = r.cur.is;
  const qoq = pick(r.qoq, 'qoq');
  const yoy = pick(r.yoy, 'yoy');

  // Where both XBRL priors and the PDF's printed comparatives exist, flag restatements.
  if (pdf?.found) {
    for (const name of ['qoq', 'yoy']) {
      const x = name === 'qoq' ? r.qoq : r.yoy;
      const p = pdf.raw?.[name];
      if (x?.ok && p) {
        for (const k of ['revenue', 'pat']) {
          if (p[k] != null && x.is[k] != null && !near(x.is[k], p[k])) {
            log({
              category: 'RESTATED_COMPARATIVE',
              severity: 'minor',
              period: r.quarterEnd,
              message: `${name} ${k}: prior XBRL ${x.is[k]} vs current filing's printed comparative ${p[k]}`,
            });
          }
        }
      }
    }
  }

  const derived = buildLineDataAndContext({ cur, qoq, yoy });
  const longCur = r.cur.cumulativeDays > 100;
  const ytdCurRaw = longCur ? r.cur.cum : {};
  const ytdPriorRaw =
    longCur &&
    r.yoy?.ok &&
    r.yoy.cumulativeDays > 100 &&
    Math.abs(r.yoy.cumulativeDays - r.cur.cumulativeDays) <= 10
      ? r.yoy.cum
      : {};
  const ytd = {
    current: Object.keys(ytdCurRaw).length ? buildYtdSummary(ytdCurRaw) : null,
    prior: Object.keys(ytdPriorRaw).length ? buildYtdSummary(ytdPriorRaw) : null,
  };
  const incomeStatement = {
    found: true,
    source: 'XBRL',
    exchange: r.cur.exchange,
    consolidated: r.basis === 'consolidated',
    unit: 'Rs Cr',
    family: r.cur.family,
    quarterEnd: r.quarterEnd,
    // Banks and insurers: `revenue` is total income and there is no EBITDA/inventory/COGS structure, so the
    // industrial income-statement signal scan does not apply; read `familyMetrics` (NII, PPOP, provisions,
    // premiums, claims, ratios) instead.
    signalScanApplicable: !NON_INDUSTRIAL.includes(r.cur.family),
    familyMetrics: NON_INDUSTRIAL.includes(r.cur.family) ? { cur, qoq, yoy } : null,
    rowsParsed: Object.keys(cur).length,
    unmatched: [],
    raw: { cur, qoq, yoy, ytdCur: ytdCurRaw, ytdPrior: ytdPriorRaw },
    ytd,
    provenance,
    ...derived,
  };

  const asOf = r.quarterEnd;
  const bsPresent = !!r.cur.bs;
  const cfPresent = !!r.cur.cf;
  const bsPrior = r.bsComparative?.ok && r.bsComparative.bs ? r.bsComparative.bs : {};
  const cfPrior =
    r.yoy?.ok &&
    r.yoy.cf &&
    Math.abs((r.yoy.cumulativeDays || 0) - (r.cur.cumulativeDays || 0)) <= 10
      ? r.yoy.cf
      : {};
  if (bsPresent && !Object.keys(bsPrior).length) {
    log({
      category: 'MISSING_FILING',
      severity: 'minor',
      period: asOf,
      message: 'comparative balance sheet not available from XBRL; balance-sheet deltas skipped',
    });
  }
  const absent = (kind) => ({
    found: false,
    source: null,
    kind,
    staleness: {
      status: 'absent',
      reason: `${kind} not in the XBRL filing (half-yearly disclosure; normal in Q1/Q3)`,
    },
  });
  const statements = {
    companyId: `NSE:${symbol}`,
    quarterEnd: asOf,
    extractedAt: new Date().toISOString(),
    balanceSheet: bsPresent
      ? {
          found: true,
          source: `XBRL-${r.cur.exchange}`,
          consolidated: r.basis === 'consolidated',
          unit: 'Rs Cr',
          unitScaleToCr: 1,
          asOfDate: asOf,
          coverage: 'unknown',
          current: r.cur.bs,
          priorColumn: bsPrior,
          unmatched: [],
          kind: 'balance sheet',
          staleness: { status: 'fresh' },
        }
      : absent('balance sheet'),
    cashflow: cfPresent
      ? {
          found: true,
          source: `XBRL-${r.cur.exchange}`,
          consolidated: r.basis === 'consolidated',
          unit: 'Rs Cr',
          unitScaleToCr: 1,
          asOfDate: asOf,
          coverage: coverageOf(r.cur.cumulativeDays),
          current: r.cur.cf,
          priorColumn: cfPrior,
          unmatched: [],
          kind: 'cash flow statement',
          staleness: { status: 'fresh' },
        }
      : absent('cash flow statement'),
  };
  statements.analysable = {
    balanceSheet: statements.balanceSheet.staleness.status === 'fresh',
    cashflow: statements.cashflow.staleness.status === 'fresh',
  };
  return { incomeStatement, statements };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.companyId) {
    process.stdout.write(JSON.stringify({ found: false, error: '--companyId required' }) + '\n');
    process.exit(1);
  }
  const symbol = args.companyId.replace(/^(NSE|BSE):/i, '').toUpperCase();
  const issues = createIssueLog(`xbrl-results-${symbol}-${Date.now()}`);
  const resultText = readIf(args.resultText);
  const pptText = readIf(args.pptText);
  const pdf = resultText || pptText ? extractIncomeStatement({ resultText, pptText }) : null;

  let r;
  try {
    r = await resolveResultPeriods({
      symbol,
      quarterEnd: args.quarterEnd || undefined,
      basis: args.basis,
      nse: new NseClient(),
      bse: new BseClient(),
      issues,
      bseScrip: args.bseScrip || undefined,
    });
  } catch (e) {
    issues.add({
      symbol,
      category: 'PARSE_ERROR',
      severity: 'major',
      message: `resolver crashed: ${e.message}`,
    });
    r = { symbol, cur: { ok: false, reason: 'resolver-error' } };
  }

  let out;
  let statements = null;
  if (r.cur?.ok) {
    ({ incomeStatement: out, statements } = assemble(r, pdf, issues));
  } else {
    issues.add({
      symbol,
      category: 'FALLBACK_USED',
      severity: 'major',
      message: `current period XBRL unavailable (${r.cur?.reason}); using PDF path`,
    });
    out =
      pdf && pdf.found
        ? { ...pdf, provenance: { cur: { source: 'pdf' } } }
        : {
            found: false,
            reason: 'XBRL unavailable and no usable PDF text supplied',
            provenance: { cur: { source: 'missing' } },
          };
    out.usePdfStatements = true;
  }
  out.issues = issues.all();
  out.issueSummary = issues.summary();

  if (args.outDir) {
    fs.mkdirSync(args.outDir, { recursive: true });
    fs.writeFileSync(path.join(args.outDir, 'income_statement.json'), JSON.stringify(out, null, 2));
    if (statements)
      fs.writeFileSync(
        path.join(args.outDir, 'statements.json'),
        JSON.stringify(statements, null, 2)
      );
    fs.writeFileSync(
      path.join(args.outDir, 'xbrl_issues.json'),
      JSON.stringify(issues.all(), null, 2)
    );
  }
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

if (require.main === module) main();

module.exports = { assemble, coverageOf };
