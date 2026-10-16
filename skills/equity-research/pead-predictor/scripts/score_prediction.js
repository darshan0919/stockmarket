#!/usr/bin/env node
'use strict';

/**
 * growth-predictor — Step 6 (deterministic, no LLM): score past predictions against the reported result.
 *
 * For every OPEN `growth-prediction` report (or one company), re-reads company-financials; when the
 * prediction's target quarter is now reported, it writes one `growth-prediction-score` validation record
 * (DATA_RULES §2 "Outcome/verdict/score against a prior output" → validation.json via
 * db.appendValidations) and marks the report `status: 'scored'` with the outcome attached.
 *
 * Score = per metric (revenue, ebitda, pat, eps): actual, base, error % vs base, and the band the actual
 * landed in (below_bear | bear_base | base_bull | above_bull). The calibration summary (median absolute
 * error, share of actuals inside bear–bull) is what tells us whether the scenarios are honest — the
 * feedback loop Suresh's "do the maths, then let the result decide" implies.
 *
 * Usage:
 *   node score_prediction.js --all-open [--force]          # e.g. weekly in results season
 *   node score_prediction.js --company NSE:SJS [--force]
 *   node score_prediction.js --summary                      # calibration only, no fetch
 */

const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const req = (p) => require(path.join(REPO, p));

const METRICS = [
  ['revenue', 'revenue'],
  ['ebitda', 'operating_profit'],
  ['pat', 'pat'],
  ['eps', 'eps'],
];

/** Pure: band of an actual vs bear/base/bull (handles bear > bull defensively). */
function band(actual, b) {
  if (actual == null || b == null || b.base == null) return null;
  const lo = Math.min(b.bear ?? b.base, b.bull ?? b.base);
  const hi = Math.max(b.bear ?? b.base, b.bull ?? b.base);
  if (actual < lo) return 'below_bear';
  if (actual > hi) return 'above_bull';
  return actual <= b.base ? 'bear_base' : 'base_bull';
}

/** Pure: score one prediction DTO against the reported quarter row. */
function scoreOne(dto, row) {
  const bands = dto.projection.bands || {};
  const errors = {};
  const detail = {};
  for (const [m, col] of METRICS) {
    const actual = row[col];
    const b = bands[m];
    if (actual == null || !b || b.base == null) continue;
    errors[m] = b.base ? Math.round(((actual - b.base) / Math.abs(b.base)) * 1000) / 10 : null;
    detail[m] = { actual, bear: b.bear, base: b.base, bull: b.bull, band: band(actual, b) };
  }
  return { errors, detail, band: detail.pat ? detail.pat.band : null };
}

function calibration(scores) {
  const med = (a) => {
    const s = a
      .filter((x) => x != null)
      .map(Math.abs)
      .sort((x, y) => x - y);
    if (!s.length) return null;
    const i = Math.floor(s.length / 2);
    return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
  };
  const inBand = (m) => {
    const d = scores.map((s) => s.detail && s.detail[m] && s.detail[m].band).filter(Boolean);
    return d.length
      ? Math.round(
          (d.filter((x) => x === 'bear_base' || x === 'base_bull').length / d.length) * 100
        )
      : null;
  };
  return {
    n: scores.length,
    medianAbsErrPct: {
      revenue: med(scores.map((s) => s.errors && s.errors.revenue)),
      pat: med(scores.map((s) => s.errors && s.errors.pat)),
    },
    pctInsideBearBull: { revenue: inBand('revenue'), pat: inBand('pat') },
  };
}

async function main() {
  const { argValue, hasFlag, loadEnv } = req('packages/jobs-runtime/lib/env.js');
  loadEnv(argValue('--env-file'));
  const db = req('packages/jobs-runtime/lib/db.js');
  const existing = [
    ...(db.find('validation', { type: 'pead-prediction-score' }) || []),
    ...(db.find('validation', { type: 'growth-prediction-score' }) || []),
  ];
  if (hasFlag('--summary')) {
    console.log(JSON.stringify({ calibration: calibration(existing) }));
    return;
  }
  const { resolveJobName } = req('packages/jobs-runtime/lib/scriptJobName.js');
  const { StockscansClient } = req('stock-api/src/clients/StockscansClient.js');
  const { getCompanyFinancials } = req('stock-api/src/analyzers/companyFinancials.js');
  const apiUsageTracker = req('packages/jobs-runtime/lib/apiUsageTracker.js');
  const jobName = resolveJobName('pead-predictor');
  const client = new StockscansClient();
  client.setJobName && client.setJobName(jobName);

  const only = argValue('--company');
  const openReports = [
    ...db.find('reports', { type: 'pead-prediction', ...(only ? { companyId: only } : {}) }),
    ...db.find('reports', { type: 'growth-prediction', ...(only ? { companyId: only } : {}) }),
  ];
  const open = openReports
    .map((r) => db.readReport(r.id))
    .filter((r) => r && r.status !== 'scored');
  const results = [];
  for (const dto of open) {
    const fin = await getCompanyFinancials(dto.companyId, {
      client,
      force: hasFlag('--force'),
    }).catch((e) => ({ error: e.message }));
    if (fin.error) {
      results.push({ id: dto.id, status: 'fetch_error', error: fin.error });
      continue;
    }
    const row = (fin.quarters || []).find((q) => q.fq === dto.targetQuarter);
    if (!row) {
      results.push({ id: dto.id, status: 'not_yet_reported', targetQuarter: dto.targetQuarter });
      continue;
    }
    const s = scoreOne(dto, row);
    const record = {
      type: 'pead-prediction-score',
      creator: 'pead-predictor',
      companyId: dto.companyId,
      date: new Date().toISOString().slice(0, 10),
      insightId: dto.id,
      targetQuarter: dto.targetQuarter,
      predictionDate: dto.date,
      ...s,
    };
    db.appendValidations([record]);
    db.saveReport({ ...dto, status: 'scored', outcome: { scoredOn: record.date, ...s } });
    existing.push(record);
    results.push({
      id: dto.id,
      status: 'scored',
      targetQuarter: dto.targetQuarter,
      errors: s.errors,
      band: s.band,
    });
  }
  apiUsageTracker.flush && apiUsageTracker.flush(jobName);
  console.log(
    JSON.stringify({
      checked: open.length,
      results,
      calibration: calibration(existing),
      touched: db.touchedFiles ? db.touchedFiles() : undefined,
    })
  );
}

module.exports = { band, scoreOne, calibration };

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
