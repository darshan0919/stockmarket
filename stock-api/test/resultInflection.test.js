'use strict';

const ri = require('../src/analyzers/resultInflection');

const headline = [
  { key: 'revenue', value: 739.4, yoyPct: 60.7, qoqPct: 29.2 },
  {
    key: 'ebitdaMargin',
    value: 17.4,
    yoyBpsChange: 622,
    qoqBpsChange: 111,
    priorYValue: 11.2,
    priorQValue: 16.3,
  },
  { key: 'pat', value: 81.4, yoyPct: 117.9 },
  { key: 'eps', value: 2.66, yoyPct: 135.4 },
];

const record = {
  companyId: 'NSE:TEST',
  quarter: '202609',
  date: '2026-10-14',
  headlineFinancials: headline,
  incomeStatementSignals: { combinations: [] },
  statementAvailability: { balanceSheet: { status: 'fresh' } },
  strategicExcerpts: [
    { initiative: 'Plant expansion', detail: 'Adding 23,000 MVA capacity, capex ₹150 Cr' },
    { initiative: 'Board meeting', detail: 'Routine' },
  ],
  kpiExcerpts: [{ label: 'Unexecuted Order Book', value: '₹7,237 Cr', comparison: '+32% YoY' }],
};

const fgPrior = {
  id: 'fg1',
  quarter: 'Q1FY27',
  date: '2026-08-10',
  guidance: [
    {
      metric_category: 'Top Line',
      metric: 'Revenue',
      period_guided: 'FY27',
      relative_pct: 25,
      absolute_unit: null,
      quote: 'growth of 25% and beyond',
    },
    {
      metric_category: 'Margins',
      metric: 'EBITDA Margin',
      period_guided: 'FY27',
      absolute_value: 16,
      absolute_unit: '%',
      quote: '~16%',
    },
    {
      metric_category: 'Key Metrics',
      metric: 'Credit Cost',
      period_guided: 'Q2FY27',
      absolute_value: 3.5,
      absolute_unit: '%',
      quote: 'Credit cost 3.0% - 4.0%',
    },
    {
      metric_category: 'Top Line',
      metric: 'Revenue',
      period_guided: 'FY29',
      absolute_value: 8000,
      absolute_unit: 'cr',
      quote: '$1bn',
    },
  ],
};
const fgCurrent = {
  id: 'fg2',
  quarter: 'Q2FY27',
  date: '2026-10-14',
  guidance: [
    {
      metric: 'Utilisation',
      period_guided: 'FY28',
      absolute_value: 82.5,
      absolute_unit: '%',
      display: '82.5%',
    },
  ],
};

describe('resultInflection — period & range parsing', () => {
  it('parses quarter, half, FY, month and open-ended periods', () => {
    expect(ri.parsePeriod('Q3 FY27')).toMatchObject({ kind: 'Q', endYyyymm: '202612' });
    expect(ri.parsePeriod('H1FY27')).toMatchObject({ kind: 'H', endYyyymm: '202609' });
    expect(ri.parsePeriod('FY27 - FY28')).toMatchObject({ kind: 'FY', label: 'FY28' });
    expect(ri.parsePeriod('June 2026 (CTO)')).toMatchObject({
      endYyyymm: '202606',
      label: 'Q1FY27',
    });
    expect(ri.parsePeriod('Ongoing')).toMatchObject({ kind: 'OPEN', endYyyymm: null });
  });

  it('parses ranges and single values with units', () => {
    expect(ri.parseRange('26%-30%')).toMatchObject({ low: 26, high: 30, mid: 28, unit: '%' });
    expect(ri.parseRange('₹150 - ₹170 Cr')).toMatchObject({ low: 150, high: 170, unit: 'cr' });
    expect(ri.parseRange('~16%')).toMatchObject({ low: 16, high: 16 });
    expect(ri.parseRange('no numbers')).toMatchObject({ mid: null });
  });

  it('normalises DB quarter formats and falls back to the record date', () => {
    expect(ri.normalizeQuarter('Q2 FY27')).toBe('202609');
    expect(ri.normalizeQuarter('Q4 FY26 / FY26')).toBe('202603');
    expect(ri.normalizeQuarter(undefined, '2026-10-11')).toBe('202609');
    expect(ri.normalizeQuarter(undefined, undefined)).toBeNull();
  });
});

describe('resultInflection — walk the talk', () => {
  const prior = ri.collectPriorGuidance({
    currentYyyymm: '202609',
    forwardGuidanceDtos: [fgPrior, fgCurrent],
  });

  it('only collects guidance stated before the current quarter', () => {
    expect(prior.every((r) => r.sourceId === 'fg1')).toBe(true);
    expect(prior).toHaveLength(4);
  });

  it('flags a raise when a later quarter restates a different value', () => {
    const later = {
      id: 'fg0',
      quarter: 'Q4FY26',
      date: '2026-05-10',
      guidance: [
        { metric: 'EBITDA Margin', period_guided: 'FY27', absolute_value: 14, absolute_unit: '%' },
      ],
    };
    const rows = ri.collectPriorGuidance({
      currentYyyymm: '202609',
      forwardGuidanceDtos: [later, fgPrior],
    });
    const em = rows.find((r) => r.metric === 'EBITDA Margin');
    expect(em.revision).toMatchObject({ direction: 'RAISED', from: 14, to: 16 });
    expect(em.firstStated).toBe('Q4FY26');
  });

  it('auto-fills headline actuals and scores interim, final and not-yet rows', () => {
    const ledger = ri.buildWalkTheTalkLedger({
      currentYyyymm: '202609',
      priorGuidance: prior,
      headline,
    });
    const byMetric = (m, p) => ledger.find((r) => r.metric === m && r.period === p);
    expect(byMetric('Revenue', 'FY27')).toMatchObject({ measurability: 'INTERIM', actual: 60.7 });
    expect(byMetric('Credit Cost', 'Q2FY27')).toMatchObject({
      measurability: 'FINAL',
      actual: null,
    });
    expect(byMetric('Revenue', 'FY29').measurability).toBe('NOT_YET');

    byMetric('Credit Cost', 'Q2FY27').actual = 2.4; // lower is better → beat
    const { rows, summary } = ri.scoreWalkTheTalk(ledger, ['DELIVERED']);
    const st = Object.fromEntries(rows.map((r) => [`${r.metric}|${r.period}`, r.status]));
    expect(st['Revenue|FY27']).toBe('AHEAD');
    expect(st['EBITDA Margin|FY27']).toBe('AHEAD');
    expect(st['Credit Cost|Q2FY27']).toBe('BEAT');
    expect(st['Revenue|FY29']).toBe('NOT_YET_MEASURABLE');
    expect(summary).toMatchObject({
      verdict: 'CONFIRMED_AND_BEAT',
      missed: 0,
      consecutiveCleanQuarters: 2,
    });
  });

  it('scores misses, milestones and exclusions', () => {
    const base = { measurability: 'FINAL', unit: '%', kind: 'ratio', metric: 'EBITDA Margin' };
    expect(
      ri.scoreRow({ ...base, guidedLow: 20, guidedHigh: 21, guidedMid: 20.5, actual: 17 }).status
    ).toBe('MISSED');
    expect(
      ri.scoreRow({ ...base, guidedLow: 20, guidedHigh: 21, guidedMid: 20.5, actual: 19 }).status
    ).toBe('MET');
    expect(ri.scoreRow({ ...base, exclude: true }).status).toBe('EXCLUDED');
    expect(ri.scoreRow({ ...base, measurability: 'OVERDUE', actual: 1, guidedMid: 1 }).status).toBe(
      'EXPIRED'
    );
    const ms = { measurability: 'FINAL', kind: 'milestone', metric: 'Plant commissioning' };
    expect(ri.scoreRow({ ...ms, milestoneOutcome: 'DELIVERED' }).status).toBe('MET');
    expect(ri.scoreRow({ ...ms, milestoneOutcome: 'DELAYED' }).status).toBe('MISSED');
    expect(
      ri.scoreRow({ ...ms, measurability: 'INTERIM', milestoneOutcome: 'PENDING' }).status
    ).toBe('ON_TRACK');
    expect(ri.scoreWalkTheTalk([]).summary.verdict).toBe('INSUFFICIENT_DATA');
  });
});

describe('resultInflection — inflection legs & verdict', () => {
  it('passes the margin leg only when significant, rising and not inventory-driven', () => {
    expect(ri.marginLeg(record).status).toBe('PASS');
    const fake = {
      ...record,
      incomeStatementSignals: { combinations: [{ flag: 'INVENTORY_GAIN_DRIVEN' }] },
    };
    expect(ri.marginLeg(fake).status).toBe('PARTIAL');
    expect(ri.marginLeg({ headlineFinancials: [] }).status).toBe('NOT_APPLICABLE');
  });

  it('needs a number and a timeline for a new catalyst to pass', () => {
    expect(ri.catalystLeg([]).status).toBe('FAIL');
    expect(ri.catalystLeg([{ isNew: true, conviction: 'OPTIONALITY', title: 'x' }]).status).toBe(
      'PARTIAL'
    );
    expect(
      ri.catalystLeg([
        {
          isNew: true,
          letter: 'C',
          title: 'Plant',
          conviction: 'HIGH',
          number: '₹150 Cr',
          timeline: 'Q3FY27',
        },
      ]).status
    ).toBe('PASS');
  });

  it('confirms only with margin PASS plus a second leg and flags Q+1', () => {
    const legs = {
      margin: { status: 'PASS' },
      guidanceTrust: { status: 'FAIL' },
      newCatalyst: { status: 'PASS' },
    };
    const v = ri.inflectionVerdict(legs, {
      operatingLeverage: { leverageOrdered: true, revenueYoY: 25, patYoY: 60 },
    });
    expect(v.verdict).toBe('INFLECTION_CONFIRMED');
    expect(v.jCurveStage).toMatch(/Stage 3/);
    expect(v.chips).toEqual(expect.arrayContaining(['Q+1 CONFIRMATION PENDING', 'GUIDANCE MISS']));
    const onlyCatalyst = ri.inflectionVerdict({ ...legs, margin: { status: 'FAIL' } });
    expect(onlyCatalyst.verdict).toBe('INFLECTION_EMERGING');
    expect(onlyCatalyst.jCurveStage).toMatch(/Stage 1/);
  });
});

describe('resultInflection — next inflection & end-to-end', () => {
  it('sorts triggers, assigns trains and computes magnitudes', () => {
    const nx = ri.buildNextInflection(
      [
        {
          type: 'ORDER_BOOK',
          what: 'OB',
          expectedBy: 'FY28',
          conviction: 'HIGH',
          magnitude: { orderBookCr: 7200, quarterInflowCr: 1200 },
        },
        {
          type: 'CAPACITY',
          what: 'Plant',
          expectedBy: 'Q3FY27',
          conviction: 'HIGH',
          magnitude: { currentCapacity: 100, addedCapacity: 50, capexCr: 100, assetTurn: 2 },
        },
        {
          type: 'MARGIN',
          what: 'Mix',
          expectedBy: 'someday',
          conviction: 'OPTIONALITY',
          magnitude: { currentMarginPct: 17, targetMarginPct: 19 },
        },
      ],
      { currentYyyymm: '202609', quarterRevenueCr: 600 }
    );
    expect(nx.triggers.map((t) => t.type)).toEqual(['CAPACITY', 'ORDER_BOOK', 'MARGIN']);
    expect(nx.triggers[0]).toMatchObject({ quartersAway: 1, train: 'B' });
    expect(nx.triggers[0].magnitudeText).toContain('+50% capacity');
    expect(nx.triggers[0].magnitudeText).toContain('₹200 Cr');
    expect(nx.triggers[1].magnitudeText).toContain('3x annualised-quarter');
    expect(nx.triggers[2].train).toBe('A');
    expect(nx.next.type).toBe('CAPACITY');
    expect(nx.checklistSeeds).toHaveLength(2);
  });

  it('prepares and finalizes from explicit inputs only', () => {
    const prep = ri.prepareInflectionContext({ record, forwardGuidanceDtos: [fgPrior, fgCurrent] });
    expect(prep.currentQuarter).toBe('Q2FY27');
    expect(prep.catalystCandidates.map((c) => c.title)).toEqual(['Plant expansion']);
    expect(prep.nextInflectionSeeds.some((s) => s.metric === 'Utilisation')).toBe(true);
    const out = ri.finalizeInflection({ record, prep, agentInput: {} });
    expect(out.inflectionPoint.legs.margin.status).toBe('PASS');
    expect(out.walkTheTalk.summary.needsActual).toBe(1);
    expect(out.nextInflection.triggers).toEqual([]);
    expect(ri.prepareInflectionContext({ record: { quarter: 'x' } }).error).toBeDefined();
  });
});

describe('resultInflection — history pack inputs', () => {
  const digestQ1 = {
    id: 'dg1',
    quarter: '202606',
    guidance: [
      {
        metric: 'Capex',
        period_guided: 'FY27',
        absolute_value: 225,
        absolute_unit: 'cr',
        quote: 'x',
      },
    ],
  };
  const digestQ4 = {
    id: 'dg0',
    quarter: '202603',
    guidance: [{ metric: 'Volume growth', period_guided: 'FY27', relative_pct: 20, quote: 'y' }],
  };

  it('uses digest guidance only for quarters without a forward-guidance DTO', () => {
    const rows = ri.collectPriorGuidance({
      currentYyyymm: '202609',
      forwardGuidanceDtos: [fgPrior],
      callDigests: [digestQ1, digestQ4],
    });
    const sources = rows.map((r) => r.sourceType);
    expect(sources).toContain('concall-digest');
    // Q1FY27 has fgPrior, so dg1 (same quarter) is skipped; dg0 (Q4FY26) is used.
    expect(rows.some((r) => r.sourceId === 'dg1')).toBe(false);
    expect(rows.find((r) => r.sourceId === 'dg0').metric).toBe('Volume growth');
  });

  it('ignores digests from the current quarter or later', () => {
    const rows = ri.collectPriorGuidance({
      currentYyyymm: '202606',
      callDigests: [digestQ1],
    });
    expect(rows).toEqual([]);
  });

  it('prepareInflectionContext uses packed priorGuidance as-is when given', () => {
    const packed = ri.collectPriorGuidance({ currentYyyymm: '202609', callDigests: [digestQ4] });
    const prep = ri.prepareInflectionContext({
      record,
      forwardGuidanceDtos: [fgPrior],
      priorGuidance: packed,
    });
    expect(prep.priorGuidanceSources).toEqual(['dg0']);
    expect(prep.walkTheTalkLedger).toHaveLength(1);
  });
});
