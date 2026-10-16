'use strict';
// Run: node --test skills/equity-research/growth-predictor/scripts/test_scripts.test.js
const test = require('node:test');
const assert = require('node:assert');
const g = require('./gather_inputs.js');
const s = require('./score_prediction.js');

test('parseTablesUnder reads Stockscans concall-notes guidance tables', () => {
  const md = [
    '## Overview',
    'text',
    '## Guidance & Commitments',
    '| Commitment | Specifics | Timeline |',
    '| --- | --- | --- |',
    '| **EBITDA margin** | Maintain 27%-28% | FY27 |',
    '| Exports | 14-15% of revenue | By FY28 |',
    '## Key Metrics',
    '| Metric | Q1 FY27 |',
    '|---|---|',
    '| Revenue | ₹261 cr |',
  ].join('\n');
  const rows = g.parseTablesUnder(md, /guidance|commitment/i);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].Commitment, 'EBITDA margin');
  assert.equal(rows[1].Timeline, 'By FY28');
  assert.equal(g.parseTablesUnder(md, /key metrics/i)[0].Metric, 'Revenue');
});

test('dotTags maps filings to P&L levers; ESG/routine filings are not debt', () => {
  assert.deepEqual(g.dotTags('Intimation Of Capacity Expansion By The Company.', ''), ['capacity']);
  assert.ok(g.dotTags('Allotment of ESOP / ESPS', '').includes('dilution'));
  assert.ok(g.dotTags('Prepayment of term loan of Rs 225 cr', '').includes('debt'));
  assert.ok(!g.dotTags('ESG Rating- CRISIL', '').includes('debt'));
  assert.ok(g.ROUTINE_RE.test('Closure of Trading Window'));
});

test('impliedShares flags a >1% share-count step', () => {
  const r = g.impliedShares([
    { fq: 'Q1', pat: 100, eps: 10 },
    { fq: 'Q2', pat: 110, eps: 10 },
  ]);
  assert.equal(r.latestCr, 11);
  assert.equal(r.changes.length, 1);
});

test('quarterEndIso and basketFor', () => {
  assert.equal(g.quarterEndIso({ yyyymm: '202606' }), '2026-06-30');
  const basket = {
    always: ['brent'],
    instruments: {},
    industries: [{ match: 'Cables', inputs: ['copper'] }],
  };
  assert.deepEqual(g.basketFor(basket, 'Capital Goods', 'Cables Power').keys, ['brent', 'copper']);
  assert.deepEqual(g.basketFor(basket, 'IT', 'Software').keys, ['brent']);
});

test('macroRead computes spot vs SMA approximations', () => {
  const m = g.macroRead({ price: 110, perf3M: 10, sma50: 100, sma100: 95 }, { key: 'brent' });
  assert.equal(m.spotVsSma50Pct, 10);
  assert.equal(m.sma50VsSma100Pct, 5.3);
  assert.equal(g.macroRead(null, { key: 'x' }).available, false);
});

test('keywordWindows keeps guidance paragraphs with neighbours', () => {
  const text = [
    'Hello and welcome to the call everyone, thank you all for joining.',
    'We expect EBITDA margin to stay in the 27-28% range for FY27 and capacity utilisation to rise.',
    'Weather was nice in Pune this quarter, nothing to add here really.',
  ].join('\n\n');
  const r = g.keywordWindows(text);
  assert.equal(r.paragraphsKept, 3);
  assert.ok(r.excerpt.includes('27-28%'));
});

test('score band + scoreOne', () => {
  const b = { bear: 49, base: 55, bull: 61 };
  assert.equal(s.band(45, b), 'below_bear');
  assert.equal(s.band(52, b), 'bear_base');
  assert.equal(s.band(58, b), 'base_bull');
  assert.equal(s.band(70, b), 'above_bull');
  const dto = { projection: { bands: { revenue: { bear: 270, base: 290, bull: 305 }, pat: b } } };
  const r = s.scoreOne(dto, { revenue: 300, pat: 56, operating_profit: 80, eps: 17 });
  assert.equal(r.errors.revenue, 3.4);
  assert.equal(r.band, 'base_bull');
  const c = s.calibration([
    r,
    { errors: { revenue: -10, pat: -20 }, detail: { pat: { band: 'below_bear' } } },
  ]);
  assert.equal(c.n, 2);
  assert.equal(c.pctInsideBearBull.pat, 50);
});

test('analyzePreResultPriceAction detects Onward Tech massive accumulation run-up', () => {
  // 25 days, newest first
  const rows = [];
  // Latest 5 days: price 295 -> 360 (+22%), volume 200k-700k
  const recentPrices = [360, 350, 330, 310, 300];
  const recentVols = [500000, 400000, 300000, 200000, 150000];
  for (let i = 0; i < 5; i++) {
    rows.push({
      mTIMESTAMP: `Day-${i}`,
      CH_CLOSING_PRICE: recentPrices[i],
      CH_TOT_TRADED_QTY: recentVols[i],
      COP_DELIV_QTY: Math.round(recentVols[i] * 0.5),
      COP_DELIV_PERC: 50,
    });
  }
  // Prior 20 days: price 280-295, volume 30k
  for (let i = 5; i < 25; i++) {
    rows.push({
      mTIMESTAMP: `Day-${i}`,
      CH_CLOSING_PRICE: 290,
      CH_TOT_TRADED_QTY: 30000,
      COP_DELIV_QTY: 18000,
      COP_DELIV_PERC: 60,
    });
  }

  const res = g.analyzePreResultPriceAction(rows);
  assert.ok(res);
  assert.equal(res.pattern, 'MASSIVE_PRE_RESULT_ACCUMULATION_RUN_UP');
  assert.equal(res.expectationHurdle, 'VERY_HIGH');
  assert.equal(res.sellTheNewsRisk, 'HIGH');
  assert.equal(res.requiredForPead, 'BULL_CASE_BLOWOUT + GUIDANCE_RAISE');
  assert.ok(res.volumeMultiplier5d > 5);
  assert.ok(res.return10dPct > 20);
});

test('analyzePreResultPriceAction detects tight accumulation base (asymmetric springboard)', () => {
  const rows = [];
  // 25 days flat around 100 with high delivery
  for (let i = 0; i < 25; i++) {
    rows.push({
      mTIMESTAMP: `Day-${i}`,
      CH_CLOSING_PRICE: 100 + (i % 2),
      CH_TOT_TRADED_QTY: 50000,
      COP_DELIV_QTY: 32000,
      COP_DELIV_PERC: 64,
    });
  }
  const res = g.analyzePreResultPriceAction(rows);
  assert.ok(res);
  assert.equal(res.pattern, 'TIGHT_ACCUMULATION_BASE');
  assert.equal(res.expectationHurdle, 'LOW');
  assert.equal(res.sellTheNewsRisk, 'LOW');
  assert.equal(res.requiredForPead, 'BASE_CASE_BEAT');
});
