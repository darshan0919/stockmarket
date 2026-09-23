#!/usr/bin/env node
'use strict';

/**
 * run_statement_signals.js — Step 2.6's second half: turns
 * extract_statements.js's output into the actual balanceSheetSignals.js /
 * cashflowSignals.js calls, building the `bsContext`/`cfContext` objects
 * those analyzers need along the way.
 *
 * WHY THIS EXISTS. The SKILL.md documented this step as two inline `node -e`
 * heredocs with `bsContext`/`cfContext`/`companyId`/`bsPeriod`/`cfPeriod`
 * left as free variables — i.e. "an agent builds these by hand each run".
 * That was tolerable for `companyId`/period (trivial), but `bsContext` and
 * `cfContext` are NOT trivial: cashflow-signals.md is explicit that
 * `ebitdaForPeriod`/`patForPeriod`/`revenueForPeriod`/`taxChargeForPeriod`
 * must cover EXACTLY the same window as the cash-flow statement (H1 vs H1,
 * FY vs FY, never annualised), and getting that wrong makes every
 * conversion ratio silently wrong — exactly the kind of derived-number
 * judgment call conventions.md §17 says a script must make, not a model
 * re-deriving it from memory each run.
 *
 * SOURCE OF THE CONTEXT FIGURES: extract_income_statement.js now captures
 * the filing's own 4th/5th P&L columns (the YTD/FY cumulative figures a
 * half-year or full-year filing prints alongside the 3 quarterly ones --
 * confirmed 2026-09-23 against a real Q4 FY26 filing) as `ytd.current`/
 * `ytd.prior`. Those cumulative figures are, by construction, the SAME
 * window the balance sheet/cash flow statement covers (Reg 33(3) requires
 * both to be disclosed together, at the same half-year/full-year boundary),
 * so this script pulls context straight from `ytd` rather than computing
 * anything itself.
 *
 * Usage:
 *   node run_statement_signals.js \
 *     --companyId NSE:X \
 *     --statements "$DOCS_DIR/statements.json" \
 *     --income-statement "$DOCS_DIR/income_statement.json" \
 *     --period 2026FY \
 *     --out-dir "$DOCS_DIR"
 *
 * `--period` should be the STATEMENT's own date/window tag (e.g. "2026FY",
 * "2026H1"), not the quarter being discussed -- see extract_statements.js's
 * own doc comment on why (cache hit across quarters that repeat the same
 * half-yearly disclosure).
 *
 * Output: balance_sheet_signals.json / cashflow_signals.json in --out-dir,
 * each `{ skipped: true, reason }` when that statement isn't `analysable`
 * (absent/stale — see extract_statements.js), never a crash or a silent
 * empty-but-misleading result.
 */

const fs = require('fs');
const path = require('path');
const bsSignals = require('../../../../stock-api/src/analyzers/balanceSheetSignals.js');
const cfSignals = require('../../../../stock-api/src/analyzers/cashflowSignals.js');

function parseArgs(argv) {
  const out = {
    companyId: null,
    statements: null,
    incomeStatement: null,
    period: null,
    outDir: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--companyId') out.companyId = argv[++i];
    else if (a === '--statements') out.statements = argv[++i];
    else if (a === '--income-statement') out.incomeStatement = argv[++i];
    else if (a === '--period') out.period = argv[++i];
    else if (a === '--out-dir') out.outDir = argv[++i];
  }
  return out;
}

function readJson(p) {
  if (!p || !fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

/**
 * annualise: a half-year window needs x2 to become a run-rate annual figure
 * for the days()/turns() ratios balanceSheetSignals.js computes; a full-year
 * window is already annual.
 *
 * A balance sheet is disclosed AS AT a point in time, not FOR a period, so
 * extract_statements.js's `detectCoverage()` (built for the P&L/CF headings,
 * which say "for the quarter/half-year/year ended...") almost never finds
 * period language in a BS heading -- confirmed 2026-09-23: a real filing's
 * BS heading was just "Standalone Balance Sheet as at March 31, 2026", no
 * "year ended" anywhere, so `coverage` came back 'unknown' for every real BS
 * and this function returned null every time. The reliable signal for an
 * Indian filing (April-March fiscal year, SEBI LODR Reg 33(3)) is the AS-AT
 * month itself: September close is always a half-year statement, March
 * close is always a full-year one.
 */
function annualiseFactor(coverage, asOfDate) {
  if (coverage === 'half-year') return 2;
  if (coverage === 'full-year') return 1;
  const month = asOfDate ? parseInt(String(asOfDate).slice(5, 7), 10) : null;
  if (month === 9) return 2; // half-year (H1) close
  if (month === 3) return 1; // full-year (FY) close
  return null;
}

function buildBsContext(statements, ytdCurrent) {
  const bsAsOf = statements.balanceSheet.asOfDate;
  const factor = annualiseFactor(statements.balanceSheet.coverage, bsAsOf);
  if (!ytdCurrent || factor == null) {
    return {
      note: 'revenueAnnualised/cogsAnnualised unavailable — no YTD P&L columns, or the as-at date is not a recognised March/September fiscal close; day-count ratios will be skipped, not guessed.',
    };
  }
  return {
    revenueAnnualised: ytdCurrent.revenue * factor,
    cogsAnnualised: ytdCurrent.costOfMaterials != null ? ytdCurrent.costOfMaterials * factor : null,
    priorLabel: `as at ${bsAsOf || 'unknown date'} (${factor === 1 ? 'full-year' : 'half-year'} close)`,
  };
}

function buildCfContext(statements, ytdCurrent) {
  // NOT annualised — cashflowSignals.js's ratios (cfoToEbitda, cfoToPat, ...)
  // compare the cash-flow statement's own cumulative figure against a P&L
  // figure covering the identical window, per cashflow-signals.md. The cash
  // flow statement's OWN heading usually does say "for the period ended..."
  // (unlike the BS), so `coverage` is more often useful here — but the label
  // is cosmetic either way; only the raw ytd figures feed the analyzer.
  if (!ytdCurrent) {
    return {
      note: 'ebitdaForPeriod/patForPeriod/etc unavailable — no YTD P&L columns found; conversion-ratio checks will be skipped, not guessed.',
    };
  }
  const coverage =
    statements.cashflow.coverage !== 'unknown' ? statements.cashflow.coverage : 'period';
  return {
    ebitdaForPeriod: ytdCurrent.ebitda,
    patForPeriod: ytdCurrent.pat,
    revenueForPeriod: ytdCurrent.revenue,
    taxChargeForPeriod: ytdCurrent.taxCharge,
    financeCostForPeriod: ytdCurrent.financeCost,
    periodLabel: `${coverage} ended ${statements.cashflow.asOfDate || 'unknown date'}`,
  };
}

function runOne({ kind, analyzer, statements, ytd, companyId, period }) {
  const st = statements[kind];
  if (!statements.analysable[kind]) {
    // `notAnalysable`, not `skipped` -- the analyzer's own return object
    // (below) always carries a `skipped` array of per-check skip reasons,
    // which is truthy even on a fully-computed result. Reusing that name
    // here made every real run look skipped in the summary (found
    // 2026-09-23 testing against a real filing: material/combinations were
    // populated but the top-level summary still said skipped:true).
    return {
      notAnalysable: true,
      reason: st.staleness ? st.staleness.reason : `${kind} not analysable this period`,
      status: st.staleness ? st.staleness.status : 'absent',
    };
  }
  const context =
    kind === 'balanceSheet'
      ? buildBsContext(statements, ytd.current)
      : buildCfContext(statements, ytd.current);
  const result = analyzer.getOrCompute(companyId, period, st.current, st.priorColumn, context);
  return { ...result, contextUsed: context, source: st.source, unit: st.unit };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.companyId || !args.statements || !args.period || !args.outDir) {
    process.stdout.write(
      JSON.stringify({ error: '--companyId, --statements, --period and --out-dir are required' }) +
        '\n'
    );
    process.exit(1);
  }
  const statements = readJson(args.statements);
  if (!statements) {
    process.stdout.write(
      JSON.stringify({ error: `could not read --statements at ${args.statements}` }) + '\n'
    );
    process.exit(1);
  }
  const incomeStatement = readJson(args.incomeStatement) || { ytd: { current: null, prior: null } };
  const ytd = incomeStatement.ytd || { current: null, prior: null };

  const bs = runOne({
    kind: 'balanceSheet',
    analyzer: bsSignals,
    statements,
    ytd,
    companyId: args.companyId,
    period: `${args.period}-bs`,
  });
  const cf = runOne({
    kind: 'cashflow',
    analyzer: cfSignals,
    statements,
    ytd,
    companyId: args.companyId,
    period: `${args.period}-cf`,
  });

  fs.mkdirSync(args.outDir, { recursive: true });
  fs.writeFileSync(
    path.join(args.outDir, 'balance_sheet_signals.json'),
    JSON.stringify(bs, null, 2)
  );
  fs.writeFileSync(path.join(args.outDir, 'cashflow_signals.json'), JSON.stringify(cf, null, 2));

  process.stdout.write(
    JSON.stringify(
      {
        balanceSheet: { written: 'balance_sheet_signals.json', notAnalysable: !!bs.notAnalysable },
        cashflow: { written: 'cashflow_signals.json', notAnalysable: !!cf.notAnalysable },
      },
      null,
      2
    ) + '\n'
  );
}

if (require.main === module) main();

module.exports = { buildBsContext, buildCfContext, annualiseFactor, runOne };
