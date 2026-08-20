#!/usr/bin/env node
'use strict';

/**
 * Computes the ALWAYS-ON headline financial snapshot for a quarter —
 * Revenue/EBITDA-margin/PAT/tax-rate/EPS, current vs QoQ vs YoY — with NO
 * materiality filtering. This is the KPI-strip's deterministic backbone
 * (quarterly-result-analysis's "bird's-eye view" cards): the reader wants
 * to SEE these numbers regardless of whether they clear a materiality bar,
 * unlike `incomeStatementSignals.js`'s `getOrCompute()`, which deliberately
 * suppresses anything unremarkable. The two scripts are complementary, not
 * duplicative — this one always answers "what were the 4-5 standard
 * numbers", that one answers "what's unusual enough to write about".
 *
 * Input: three normalized P&L snapshots (current quarter, same quarter
 * prior year, immediately preceding quarter), each shaped per
 * incomeStatementSignals.js's documented convention:
 *   { revenue, ebitda, pat, tax, pbt, epsBasic, epsDiluted, ... }
 * Pass a field as `null` (not 0) if the filing doesn't disclose it — this
 * script treats `null` as "not applicable" and omits that card rather than
 * reporting a false 0%/0bps move, same rule as incomeStatementSignals.js.
 *
 * Usage:
 *   node compute_headline_financials.js \
 *     --current /tmp/.../current_period.json \
 *     --prior-q /tmp/.../prior_q_period.json \
 *     --prior-y /tmp/.../prior_y_period.json
 *
 * Output (stdout, JSON): { cards: [{key, label, value, qoq, yoy, unit}] }
 * — this is the RAW numeric backbone, not the final rendered KPI-strip
 * cards. quarterly-result-analysis (Phase 2) selects 4-8 of these (plus
 * kpiExcerpts candidates) and writes the label/value/subtext/tone strings
 * that actually go on the widget — that selection is judgment, not
 * something this script should predetermine.
 */
const fs = require('fs');

function parseArgs(argv) {
  const out = { current: null, priorQ: null, priorY: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--current') out.current = argv[++i];
    else if (a === '--prior-q') out.priorQ = argv[++i];
    else if (a === '--prior-y') out.priorY = argv[++i];
  }
  return out;
}

function readJsonIfExists(p) {
  if (!p || !fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

function pctChange(curr, prev) {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function ebitdaMarginPct(snap) {
  if (!snap || snap.ebitda == null || snap.revenue == null || snap.revenue === 0) return null;
  return (snap.ebitda / snap.revenue) * 100;
}

function effectiveTaxRatePct(snap) {
  if (!snap || snap.tax == null || snap.pbt == null || snap.pbt === 0) return null;
  return (snap.tax / snap.pbt) * 100;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.current) {
    console.error(
      'Usage: compute_headline_financials.js --current <file> [--prior-q <file>] [--prior-y <file>]'
    );
    process.exit(1);
  }
  const current = readJsonIfExists(args.current);
  const priorQ = readJsonIfExists(args.priorQ);
  const priorY = readJsonIfExists(args.priorY);
  if (!current) {
    console.error(`Could not read --current snapshot at ${args.current}`);
    process.exit(1);
  }

  const cards = [];

  const revYoY = pctChange(current.revenue, priorY && priorY.revenue);
  const revQoQ = pctChange(current.revenue, priorQ && priorQ.revenue);
  if (revYoY != null || revQoQ != null) {
    cards.push({
      key: 'revenue',
      label: 'Revenue',
      value: current.revenue,
      unit: 'Rs Cr',
      yoyPct: revYoY,
      qoqPct: revQoQ,
    });
  }

  const marginNow = ebitdaMarginPct(current);
  const marginQ = ebitdaMarginPct(priorQ);
  const marginY = ebitdaMarginPct(priorY);
  if (marginNow != null) {
    cards.push({
      key: 'ebitdaMargin',
      label: 'EBITDA margin',
      value: marginNow,
      unit: '%',
      qoqBpsChange: marginQ != null ? Math.round((marginNow - marginQ) * 100) : null,
      yoyBpsChange: marginY != null ? Math.round((marginNow - marginY) * 100) : null,
      priorQValue: marginQ,
      priorYValue: marginY,
    });
  }

  const patYoY = pctChange(current.pat, priorY && priorY.pat);
  const patQoQ = pctChange(current.pat, priorQ && priorQ.pat);
  if (patYoY != null || patQoQ != null) {
    cards.push({
      key: 'pat',
      label: 'PAT',
      value: current.pat,
      unit: 'Rs Cr',
      yoyPct: patYoY,
      qoqPct: patQoQ,
    });
  }

  const taxNow = effectiveTaxRatePct(current);
  const taxY = effectiveTaxRatePct(priorY);
  const taxQ = effectiveTaxRatePct(priorQ);
  if (taxNow != null) {
    cards.push({
      key: 'effectiveTaxRate',
      label: 'Effective tax rate',
      value: taxNow,
      unit: '%',
      priorYValue: taxY,
      priorQValue: taxQ,
    });
  }

  const epsNow = current.epsBasic != null ? current.epsBasic : current.epsDiluted;
  const epsY = priorY && (priorY.epsBasic != null ? priorY.epsBasic : priorY.epsDiluted);
  const epsQ = priorQ && (priorQ.epsBasic != null ? priorQ.epsBasic : priorQ.epsDiluted);
  if (epsNow != null) {
    cards.push({
      key: 'eps',
      label: 'EPS',
      value: epsNow,
      unit: 'Rs',
      yoyPct: pctChange(epsNow, epsY),
      qoqPct: pctChange(epsNow, epsQ),
      priorYValue: epsY,
      priorQValue: epsQ,
    });
  }

  console.log(JSON.stringify({ cards }, null, 2));
}

main();
