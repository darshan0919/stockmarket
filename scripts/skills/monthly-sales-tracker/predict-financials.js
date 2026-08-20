#!/usr/bin/env node
'use strict';

/**
 * monthly-sales-tracker / predict-financials.js
 *
 * Builds OLS linear regression models correlating quarterly unit sales to
 * Revenue, Operating Profit, and PAT. Then predicts a SINGLE MONTH's financials
 * (e.g. July 2026) by prorating the model: monthly_revenue ≈ (a/3) + b × month_units.
 *
 * Financial history embedded from screenshot (TMPV consolidated quarterly P&L).
 * To update: edit FINANCIAL_HISTORY below.
 *
 * Usage:
 *   node predict-financials.js --ticker NSE:TMPV
 *   node predict-financials.js --ticker NSE:TMCV
 *   node predict-financials.js --ticker NSE:TMPV --exclude-outliers
 *
 * Input:
 *   data/runs/monthly-sales-tracker/<ticker>/sales_data.json
 *
 * Output:
 *   data/runs/monthly-sales-tracker/<ticker>/prediction.json
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// ── Fiscal quarter helpers ────────────────────────────────────────────────────
function toFiscalQuarter(month, year) {
  let q, fy;
  if (month >= 4 && month <= 6) {
    q = 1;
    fy = year + 1;
  } else if (month >= 7 && month <= 9) {
    q = 2;
    fy = year + 1;
  } else if (month >= 10 && month <= 12) {
    q = 3;
    fy = year + 1;
  } else {
    q = 4;
    fy = year;
  } // Jan-Mar
  return `Q${q}FY${String(fy).slice(-2)}`;
}

// ── TMPV Consolidated Quarterly Financial History (from screenshot) ───────────
//
// Sep-25 PAT = ₹76,248 Cr: exceptional one-time item (demerger-related).
// Included in fit but flagged as outlier; use --exclude-outliers for a cleaner model.
//
const FINANCIAL_HISTORY = {
  'NSE:TMPV': [
    { quarter: 'Q1FY24', revenue: 102236, op: 13217, pat: 3301 },
    { quarter: 'Q2FY24', revenue: 105129, op: 13767, pat: 3832 },
    { quarter: 'Q3FY24', revenue: 110577, op: 15418, pat: 7145 },
    { quarter: 'Q4FY24', revenue: 119033, op: 16685, pat: 17528 },
    { quarter: 'Q1FY25', revenue: 107102, op: 15248, pat: 10587 },
    { quarter: 'Q2FY25', revenue: 83656, op: 9914, pat: 3521 },
    { quarter: 'Q3FY25', revenue: 94472, op: 10479, pat: 5484 },
    { quarter: 'Q4FY25', revenue: 98377, op: 14387, pat: 8556 },
    { quarter: 'Q1FY26', revenue: 87677, op: 8162, pat: 4003 },
    {
      quarter: 'Q2FY26',
      revenue: 72349,
      op: -1404,
      pat: 76248,
      outlier: true,
      note: 'Exceptional PAT (demerger one-time)',
    },
    { quarter: 'Q3FY26', revenue: 70108, op: 879, pat: -3483 },
    { quarter: 'Q4FY26', revenue: 105447, op: 11259, pat: 5878 },
  ],
  'NSE:TMCV': [], // Populate when financial screenshot available

  // ── M&M Standalone Consolidated Quarterly P&L (₹ Cr) ──────────────────────
  // Source: M&M standalone results (Auto + Farm Equipment segments)
  // Revenue = Net Revenue from Operations
  // op      = Operating Profit (EBITDA, before D&A and exceptional items)
  // pat     = Profit After Tax (before minority interest)
  // Units used for regression = Auto Total (SUV+CV+Exports) from monthly sales data
  'NSE:M&M': [
    { quarter: 'Q1FY24', revenue: 18542, op: 2889, pat: 2210 },
    { quarter: 'Q2FY24', revenue: 19031, op: 3151, pat: 2454 },
    { quarter: 'Q3FY24', revenue: 21384, op: 3680, pat: 2658 },
    { quarter: 'Q4FY24', revenue: 21964, op: 3873, pat: 3552 },
    { quarter: 'Q1FY25', revenue: 24137, op: 4369, pat: 3143 },
    { quarter: 'Q2FY25', revenue: 24622, op: 4495, pat: 3171 },
    { quarter: 'Q3FY25', revenue: 24240, op: 4320, pat: 3438 },
    { quarter: 'Q4FY25', revenue: 26423, op: 5115, pat: 3310 },
    { quarter: 'Q1FY26', revenue: 28945, op: 5480, pat: 3499 },
    { quarter: 'Q2FY26', revenue: 26998, op: 4847, pat: 3819 },
    { quarter: 'Q3FY26', revenue: 29060, op: 5442, pat: 3866 },
    { quarter: 'Q4FY26', revenue: 31856, op: 6145, pat: 4175 },
  ],
};

// ── OLS Linear Regression ─────────────────────────────────────────────────────
function olsRegression(xs, ys) {
  const n = xs.length;
  if (n < 2) return { a: 0, b: 0, r2: 0, n };
  const xMean = xs.reduce((s, v) => s + v, 0) / n;
  const yMean = ys.reduce((s, v) => s + v, 0) / n;
  let ssXY = 0,
    ssXX = 0,
    ssYY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    const dy = ys[i] - yMean;
    ssXY += dx * dy;
    ssXX += dx * dx;
    ssYY += dy * dy;
  }
  const b = ssXX === 0 ? 0 : ssXY / ssXX;
  const a = yMean - b * xMean;
  const r2 = ssYY === 0 ? 0 : (ssXY * ssXY) / (ssXX * ssYY);
  return { a, b, r2, n };
}

// ── Aggregate monthly → quarterly totals ──────────────────────────────────────
// Marks quarters with 3 months as "complete" (best for regression).
// Quarters with 1-2 months are "partial" and used for predictions only.
function aggregateToQuarters(records) {
  const qMap = {};
  for (const r of records) {
    if (!r.month || !r.year) continue;
    // Use pv_total if available, fall back to total
    const totalUnits = r.pv_total ?? r.total ?? null;
    if (totalUnits == null) continue;
    const q = toFiscalQuarter(r.month, r.year);
    if (!qMap[q]) qMap[q] = { quarter: q, months: [], domestic: 0, exports: 0, ev: 0, total: 0 };
    qMap[q].months.push(r.month);
    qMap[q].domestic += r.pv_domestic || r.domestic || 0;
    qMap[q].exports += r.pv_ib || r.exports || 0;
    qMap[q].ev += r.ev || 0;
    qMap[q].total += totalUnits;
  }
  const complete = [],
    partial = [];
  for (const q of Object.values(qMap)) {
    (q.months.length === 3 ? complete : partial).push(q);
  }
  return { complete, partial, all: [...complete, ...partial] };
}

// ── Join quarterly sales with financials ──────────────────────────────────────
// Scales partial-quarter unit counts to full-quarter equivalent for regression.
function joinData(quarterlyUnits, financials) {
  const finMap = {};
  for (const f of financials) finMap[f.quarter] = f;
  const joined = [];
  for (const u of quarterlyUnits) {
    const f = finMap[u.quarter];
    if (!f) continue;
    // Scale partial quarters to 3-month equivalent so regression is on comparable scale
    const scaleFactor = u.months.length > 0 ? 3 / u.months.length : 1;
    const scaled_units = Math.round(u.total * scaleFactor);
    joined.push({
      quarter: u.quarter,
      months_present: u.months.length,
      raw_units: u.total,
      total_units: scaled_units, // scaled to full-quarter equivalent
      domestic: u.domestic,
      exports: u.exports,
      ev: u.ev,
      revenue: f.revenue,
      op: f.op,
      pat: f.pat,
      outlier: f.outlier || false,
      note:
        f.note ||
        (u.months.length < 3
          ? `${u.months.length}/3 months available (scaled ×${scaleFactor.toFixed(1)})`
          : ''),
    });
  }
  return joined;
}

// ── Monthly prediction via prorated quarterly model ───────────────────────────
//
// Strategy:
//   Quarterly model: Y_quarter = a + b × Q_units    (Q_units = sum of 3 months)
//   Monthly proration: Y_month ≈ (a / 3) + b × M_units
//
//   Rationale: the intercept 'a' captures fixed-cost quarterly overhead (JLR
//   management fees, corporate overheads etc) → divide by 3 for monthly.
//   The slope 'b' is already a per-unit coefficient — apply directly to M_units.
//
function predictMonthly(model, monthUnits) {
  return model.a / 3 + model.b * monthUnits;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help')) {
    console.log(`Usage: node predict-financials.js --ticker NSE:TMPV [--exclude-outliers]`);
    process.exit(0);
  }

  const tickerIdx = argv.indexOf('--ticker');
  if (tickerIdx === -1) {
    console.error('Error: --ticker is required');
    process.exit(1);
  }
  const ticker = argv[tickerIdx + 1];
  const excludeOutliers = argv.includes('--exclude-outliers');

  const safeTicker = ticker.replace(/[^A-Za-z0-9]+/g, '_');
  const runDir = path.join(REPO_ROOT, 'data', 'runs', 'monthly-sales-tracker', safeTicker);
  const salesFile = path.join(runDir, 'sales_data.json');

  console.log(`\n📈 Financial Prediction Engine`);
  console.log(`   Ticker           : ${ticker}`);
  console.log(`   Exclude outliers : ${excludeOutliers}`);

  if (!fs.existsSync(salesFile)) {
    console.error(`\nError: ${salesFile} not found. Run extract-sales-data.py first.`);
    process.exit(1);
  }

  const salesData = JSON.parse(fs.readFileSync(salesFile, 'utf8'));
  const records = salesData.records || [];
  const financials = FINANCIAL_HISTORY[ticker] || [];

  if (financials.length === 0) {
    console.warn(
      `\n⚠ No financial history for ${ticker}. Add data to FINANCIAL_HISTORY in predict-financials.js.`
    );
  }

  // ── Aggregate ──────────────────────────────────────────────────────────────
  const { complete, partial, all: allQuarters } = aggregateToQuarters(records);
  // Use ALL quarters for regression (complete preferred; partial scaled to 3-month equivalent)
  // Financial data only exists for complete quarters so we join against financials
  const trainingData = joinData(allQuarters, financials);
  const trainSet = excludeOutliers ? trainingData.filter((r) => !r.outlier) : trainingData;

  console.log(
    `   Quarters with sales data: ${allQuarters.length} (${complete.length} complete, ${partial.length} partial)`
  );
  console.log(`   Training data points (joined with financials): ${trainSet.length}`);

  if (trainSet.length < 2) {
    console.warn(
      '\n⚠ Too few data points to fit regression. Need at least 2 quarters with both sales + financials.'
    );
    console.warn(
      '  Check that the quarter labels in sales_data match FINANCIAL_HISTORY (e.g. Q2FY25, Q3FY25...)'
    );
    console.warn('  Available quarters in sales:', allQuarters.map((q) => q.quarter).join(', '));
    console.warn(
      '  Available quarters in financials:',
      financials.map((f) => f.quarter).join(', ')
    );
  }

  // ── Fit quarterly models ──────────────────────────────────────────────────
  const xs = trainSet.map((r) => r.total_units);
  const modelRevenue = olsRegression(
    xs,
    trainSet.map((r) => r.revenue)
  );
  const modelOp = olsRegression(
    xs,
    trainSet.map((r) => r.op)
  );
  const modelPat = olsRegression(
    xs,
    trainSet.map((r) => r.pat)
  );

  console.log('\n── Quarterly Regression Models ─────────────────────────────────────────');
  const fmtModel = (m, label, unit = 'Cr') => {
    const slope = m.b >= 0 ? `+${m.b.toFixed(2)}` : m.b.toFixed(2);
    console.log(
      `   ${label.padEnd(14)}: ${m.a.toFixed(0)} ${slope} × units  |  R² = ${(m.r2 * 100).toFixed(1)}%  (n=${m.n})`
    );
  };
  fmtModel(modelRevenue, 'Revenue (Cr)');
  fmtModel(modelOp, 'Op Profit (Cr)');
  fmtModel(modelPat, 'PAT (Cr)');

  // ── Standalone monthly predictions ───────────────────────────────────────
  // Predict for: all months NOT in a complete 3-month quarter that also has financials.
  // This includes the latest partial month (July 2026) and any other months
  // that were the only representative of their quarter in our data.
  const finQuarters = new Set(financials.map((f) => f.quarter));
  const monthlyPredictions = [];
  for (const r of records) {
    if (!r.month || !r.year) continue;
    const totalUnits = r.pv_total ?? r.total ?? null;
    if (totalUnits == null) continue;
    const q = toFiscalQuarter(r.month, r.year);
    // Predict for partial quarters OR quarters beyond the financial history
    const isPartialQ = partial.some((p) => p.quarter === q);
    const isBeyondHistory = !finQuarters.has(q);
    if (!isPartialQ && !isBeyondHistory) continue;
    const m_units = totalUnits;

    const pred_rev = predictMonthly(modelRevenue, m_units);
    const pred_op = predictMonthly(modelOp, m_units);
    const pred_pat = predictMonthly(modelPat, m_units);
    const opm_pct = pred_rev !== 0 ? ((pred_op / pred_rev) * 100).toFixed(1) : null;
    const npm_pct = pred_rev !== 0 ? ((pred_pat / pred_rev) * 100).toFixed(1) : null;

    const pred = {
      month: r.month,
      year: r.year,
      month_name: r.month_name,
      date_label: r.date_label,
      quarter: q,
      actual_units: m_units,
      domestic: r.pv_domestic ?? r.domestic,
      exports: r.pv_ib ?? r.exports,
      ev: r.ev,
      predicted_revenue_cr: Math.round(pred_rev),
      predicted_op_cr: Math.round(pred_op),
      predicted_pat_cr: Math.round(pred_pat),
      predicted_opm_pct: opm_pct,
      predicted_npm_pct: npm_pct,
      model_note: 'Monthly estimate via prorated quarterly OLS: Y_month = (a/3) + b × month_units',
      confidence: 'INDICATIVE — single-month projection, not a full-quarter estimate',
    };

    monthlyPredictions.push(pred);

    console.log(`\n── Standalone Monthly Prediction: ${r.month_name} ${r.year} ──────────────────`);
    console.log(
      `   Units         : ${m_units.toLocaleString()} (Domestic: ${(r.domestic || 0).toLocaleString()}, Exports: ${(r.exports || 0).toLocaleString()}, EV: ${(r.ev || 0).toLocaleString()})`
    );
    console.log(`   Revenue (est) : ₹${Math.round(pred_rev).toLocaleString()} Cr`);
    console.log(
      `   Op Profit     : ₹${Math.round(pred_op).toLocaleString()} Cr  (OPM ${opm_pct}%)`
    );
    console.log(
      `   PAT           : ₹${Math.round(pred_pat).toLocaleString()} Cr  (NPM ${npm_pct}%)`
    );
    console.log(`   Note          : ${pred.confidence}`);
  }

  // ── Build output ──────────────────────────────────────────────────────────
  const output = {
    ticker,
    creator: 'monthly-sales-tracker/predict-financials',
    createdAt: new Date().toISOString(),
    exclude_outliers: excludeOutliers,
    training_quarters: trainSet.length,
    models: {
      revenue: {
        formula: `Revenue (Cr) = ${modelRevenue.a.toFixed(0)} + ${modelRevenue.b.toFixed(4)} × quarterly_units`,
        monthly_formula: `Rev/month (Cr) ≈ ${(modelRevenue.a / 3).toFixed(0)} + ${modelRevenue.b.toFixed(4)} × monthly_units`,
        intercept: modelRevenue.a,
        slope: modelRevenue.b,
        r2: modelRevenue.r2,
        r2_pct: parseFloat((modelRevenue.r2 * 100).toFixed(1)),
        n: modelRevenue.n,
      },
      op: {
        formula: `OP (Cr) = ${modelOp.a.toFixed(0)} + ${modelOp.b.toFixed(4)} × quarterly_units`,
        monthly_formula: `OP/month (Cr) ≈ ${(modelOp.a / 3).toFixed(0)} + ${modelOp.b.toFixed(4)} × monthly_units`,
        intercept: modelOp.a,
        slope: modelOp.b,
        r2: modelOp.r2,
        r2_pct: parseFloat((modelOp.r2 * 100).toFixed(1)),
        n: modelOp.n,
      },
      pat: {
        formula: `PAT (Cr) = ${modelPat.a.toFixed(0)} + ${modelPat.b.toFixed(4)} × quarterly_units`,
        monthly_formula: `PAT/month (Cr) ≈ ${(modelPat.a / 3).toFixed(0)} + ${modelPat.b.toFixed(4)} × monthly_units`,
        intercept: modelPat.a,
        slope: modelPat.b,
        r2: modelPat.r2,
        r2_pct: parseFloat((modelPat.r2 * 100).toFixed(1)),
        n: modelPat.n,
      },
    },
    quarterly_training_data: trainingData,
    quarterly_sales_complete: complete,
    quarterly_sales_partial: partial,
    monthly_predictions: monthlyPredictions,
  };

  const outFile = path.join(runDir, 'prediction.json');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));

  console.log(`\n✅ Saved: ${outFile}`);
  console.log('\n── Token-optimization note ─────────────────────────────────────────');
  console.log('   Regression is pure math — no LLM calls needed.');
  console.log('   Re-run only after new monthly sales PDFs are extracted.');

  return output;
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
  });
}

module.exports = {
  olsRegression,
  predictMonthly,
  toFiscalQuarter,
  aggregateToQuarters,
  joinData,
  FINANCIAL_HISTORY,
};
