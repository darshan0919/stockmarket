'use strict';
// Run: node --test skills/equity-research/growth-predictor/scripts/test_scripts.test.js
const test = require('node:test');
const assert = require('node:assert');
const g = require('./gather_inputs.js');
const s = require('./score_prediction.js');
const save = require('./save_prediction.js');

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

test('analyzeShareholdingChange weights Promoter 4x, FII 2x, DII 1x and tracks public decrease', () => {
  const prev = {
    ok: true,
    asOf: '2026-06-30',
    promoterPct: 50.0,
    fpiPct: 10.0,
    diiPct: 5.0,
    publicPct: 35.0,
    retailPct: 20.0,
    totalHolders: 15000,
  };
  // Latest: Promoter +1.5pp (4x), FII +0.5pp (2x), DII +0.5pp (1x), Public down -2.5pp
  const cur = {
    ok: true,
    asOf: '2026-09-30',
    promoterPct: 51.5,
    fpiPct: 10.5,
    diiPct: 5.5,
    publicPct: 32.5,
    retailPct: 18.2,
    totalHolders: 14200,
  };

  const res = g.analyzeShareholdingChange(cur, prev);
  assert.ok(res.available);
  assert.ok(res.hasDeltas);
  assert.equal(res.deltas.promoterDelta, 1.5);
  assert.equal(res.deltas.fiiDelta, 0.5);
  assert.equal(res.deltas.diiDelta, 0.5);
  assert.equal(res.deltas.publicDelta, -2.5);
  assert.equal(res.publicDecrease, 2.5);
  assert.equal(res.deltas.holdersDelta, -800);

  // Weighted scores: Promoter 1.5 * 4 = 6.0, FII 0.5 * 2 = 1.0, DII 0.5 * 1 = 0.5 -> 7.5
  assert.equal(res.scores.promoterWeighted, 6.0);
  assert.equal(res.scores.fiiWeighted, 1.0);
  assert.equal(res.scores.diiWeighted, 0.5);
  assert.equal(res.weightedBuyingScore, 7.5);
  assert.equal(res.totalSmartBuying, 2.5);
  assert.equal(res.effectiveBuyerMultiplier, 3.0); // 7.5 / 2.5 = 3.0x
  assert.equal(res.pattern, 'STRONG_PROMOTER_ACCUMULATION');
  assert.ok(res.summary.includes('Public holding decreased by 2.5pp'));
  assert.ok(res.summary.includes('Promoter (+1.5pp, 4x weight)'));
  assert.ok(res.summary.includes('weighted smart-money buying score of +7.5'));
});

test('analyzeShareholdingChange detects institutional accumulation and distribution', () => {
  // Institutional accumulation: FII +2.0pp (2x = 4.0), DII +1.0pp (1x = 1.0), Promoter flat, Public down -3.0pp
  const prev1 = {
    ok: true,
    promoterPct: 40.0,
    fpiPct: 8.0,
    diiPct: 4.0,
    publicPct: 48.0,
  };
  const cur1 = {
    ok: true,
    promoterPct: 40.0,
    fpiPct: 10.0,
    diiPct: 5.0,
    publicPct: 45.0,
  };
  const inst = g.analyzeShareholdingChange(cur1, prev1);
  assert.equal(inst.deltas.promoterDelta, 0);
  assert.equal(inst.deltas.fiiDelta, 2.0);
  assert.equal(inst.deltas.diiDelta, 1.0);
  assert.equal(inst.publicDecrease, 3.0);
  assert.equal(inst.weightedBuyingScore, 5.0); // 2*2.0 + 1*1.0 = 5.0
  assert.equal(inst.effectiveBuyerMultiplier, 1.67);
  assert.equal(inst.pattern, 'STRONG_INSTITUTIONAL_ACCUMULATION');

  // Distribution: Promoter sells -1.0pp, FII sells -0.5pp, Public up +1.5pp (Public decrease = -1.5pp)
  const cur2 = {
    ok: true,
    promoterPct: 39.0,
    fpiPct: 7.5,
    diiPct: 4.0,
    publicPct: 49.5,
  };
  const dist = g.analyzeShareholdingChange(cur2, prev1);
  assert.equal(dist.deltas.promoterDelta, -1.0);
  assert.equal(dist.deltas.fiiDelta, -0.5);
  assert.equal(dist.publicDecrease, -1.5);
  assert.equal(dist.weightedBuyingScore, 0);
  assert.equal(dist.netWeightedScore, -5.0); // 4*(-1.0) + 2*(-0.5) = -5.0
  assert.equal(dist.pattern, 'DISTRIBUTION_TO_PUBLIC');
  assert.ok(dist.summary.includes('Public holding expanded by +1.5pp'));
});

test('analyzeShareholdingChange handles single filing or missing input gracefully', () => {
  assert.equal(g.analyzeShareholdingChange(null).available, false);
  const single = g.analyzeShareholdingChange({ ok: true, promoterPct: 60, publicPct: 40 }, null);
  assert.equal(single.available, true);
  assert.equal(single.hasDeltas, false);
  assert.equal(single.latest.promoterPct, 60);
});

test('parseStockscansShareholding parses 2D aggregate matrix and feeds analyzeShareholdingChange', () => {
  const data = {
    companyId: 'NSE:RKFORGE',
    aggregate: [
      ['Date', '202603', '202606', '202609'],
      ['Promoter', 43.33, 43.39, 40.93],
      ['FII', 21.74, 20.43, 17.05],
      ['DII', 4.45, 5.09, 5.73],
      ['Public', 30.48, 31.09, 36.3],
      ['No Of Shareholders', 109027, 105810, 106395],
    ],
  };

  const quarters = g.parseStockscansShareholding(data);
  assert.equal(quarters.length, 3);
  assert.equal(quarters[2].date, '202609');
  assert.equal(quarters[2].asOf, '2026-09-30');
  assert.equal(quarters[2].promoterPct, 40.93);
  assert.equal(quarters[2].fiiPct, 17.05);
  assert.equal(quarters[2].diiPct, 5.73);
  assert.equal(quarters[2].publicPct, 36.3);
  assert.equal(quarters[2].totalHolders, 106395);

  const cur = quarters[2];
  const prev = quarters[1];
  const res = g.analyzeShareholdingChange(cur, prev);
  assert.ok(res.available);
  assert.ok(res.hasDeltas);
  assert.equal(res.deltas.promoterDelta, -2.46);
  assert.equal(res.deltas.fiiDelta, -3.38);
  assert.equal(res.deltas.diiDelta, 0.64);
  assert.equal(res.deltas.publicDelta, 5.21);
  assert.equal(res.publicDecrease, -5.21);
  assert.equal(res.scores.diiWeighted, 0.64);
  assert.equal(res.weightedBuyingScore, 0.64);
  assert.equal(res.pattern, 'DISTRIBUTION_TO_PUBLIC');

  // Test malformed/null handling
  assert.equal(g.parseStockscansShareholding(null), null);
  assert.equal(g.parseStockscansShareholding({ aggregate: [] }), null);
  assert.equal(g.parseStockscansShareholding({ aggregate: [['Header']] }), null);
});

test('save_prediction buildBody renders shareholding change with weights and score', () => {
  const dto = {
    targetQuarter: 'Q2FY27',
    projection: {
      fiscalYear: 'FY27',
      bands: { pat: { bear: 50, base: 55, bull: 60 } },
      scenarios: {
        base: {
          target: {
            revenue: 300,
            ebitda_margin_pct: 25,
            ebitda: 75,
            other_income: 5,
            depreciation: 10,
            interest: 2,
            pbt: 68,
            tax_rate_pct: 25,
            pat: 51,
            eps: 15,
          },
          fy: { revenue: 1200, pat: 210, eps: 62 },
          shares_cr: 3.4,
          inputs: [],
          deltas: { yoy: { reported: { revenue: 20, ebitda: 22, pat: 25, eps: 24 } } },
        },
        bear: {
          target: { revenue: 280, pat: 46, eps: 13.5 },
          fy: { revenue: 1100, pat: 190, eps: 56 },
        },
        bull: {
          target: { revenue: 320, pat: 58, eps: 17.0 },
          fy: { revenue: 1300, pat: 235, eps: 69 },
        },
      },
    },
    narrative: { headline: 'Test Headline' },
    shareholding: {
      available: true,
      hasDeltas: true,
      latest: { promoterPct: 45.2, fiiPct: 12.1, diiPct: 6.4, publicPct: 36.3, retailPct: 22.0 },
      deltas: {
        promoterDelta: 1.2,
        fiiDelta: 0.8,
        diiDelta: 0.2,
        publicDelta: -2.2,
        holdersDelta: -520,
      },
      publicDecrease: 2.2,
      scores: { promoterWeighted: 4.8, fiiWeighted: 1.6, diiWeighted: 0.2 },
      weightedBuyingScore: 6.6,
      effectiveBuyerMultiplier: 3.0,
      pattern: 'STRONG_PROMOTER_ACCUMULATION',
      summary:
        'Public holding decreased by 2.2pp, absorbed by Promoter (+1.2pp, 4x) and FII (+0.8pp, 2x).',
    },
  };

  const html = save.buildBody(dto);
  assert.ok(html.includes('LATEST QUARTER SHAREHOLDING CHANGE &amp; SMART-MONEY POSITIONING'));
  assert.ok(html.includes('Promoter Holding (4x wt)'));
  assert.ok(html.includes('FII Holding (2x wt)'));
  assert.ok(html.includes('DII Holding (1x wt)'));
  assert.ok(html.includes('Public &amp; Retail Float'));
  assert.ok(html.includes('Smart-Money Absorption Score:</b> +6.6 pts'));
  assert.ok(html.includes('Effective Buyer Multiplier: <b>3.0x</b>'));
});
