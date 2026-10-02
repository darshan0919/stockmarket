'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const A = require('../resultsAdapter');
const R = require('../resultsResolver');
const { parseXbrl } = require('../parse');
const { createIssueLog } = require('../issues');
const {
  assemble,
  coverageOf,
} = require('../../../../../skills/equity-research/quarterly-result-extractor/scripts/extract_result_xbrl');

/** Build a minimal Ind-AS results XBRL for one quarter (values in INR). */
function mk({ start, end, rev, pbt = rev * 0.1, extra = '' }) {
  const f = (name, v, ctx = 'OneD') =>
    `<in-capmkt:${name} contextRef="${ctx}" unitRef="INR" decimals="-5">${v}</in-capmkt:${name}>`;
  return `<xbrli:xbrl>
<xbrli:context id="OneD"><xbrli:entity/><xbrli:period><xbrli:startDate>${start}</xbrli:startDate><xbrli:endDate>${end}</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:context id="OneI"><xbrli:entity/><xbrli:period><xbrli:instant>${end}</xbrli:instant></xbrli:period></xbrli:context>
${f('RevenueFromOperations', rev)}${f('OtherIncome', 0)}${f('Income', rev)}${f('Expenses', rev - pbt)}
${f('ProfitBeforeExceptionalItemsAndTax', pbt)}${f('ExceptionalItemsBeforeTax', 0)}${f('ProfitBeforeTax', pbt)}
${f('TaxExpense', pbt * 0.25)}${f('ProfitLossForPeriod', pbt * 0.75)}${extra}</xbrli:xbrl>`;
}

const CR = 1e7;
const q = (start, end, revCr) => mk({ start, end, rev: revCr * CR });
const URL_INDAS = (n) => `https://x/INTEGRATED_FILING_INDAS_${n}_WEB.xml`;

describe('resultsAdapter', () => {
  it('picks contexts by date and maps to Rs Cr', () => {
    const p = parseXbrl(q('2026-04-01', '2026-06-30', 100));
    const c = A.pickContexts(p);
    expect(c).toMatchObject({ quarter: 'OneD', periodEnd: '2026-06-30', instantCur: 'OneI' });
    const is = A.incomeSnapshot(p, c.quarter);
    expect(is.revenue).toBeCloseTo(100);
    expect(A.sumChecks({ is })).toEqual([]);
  });

  it('flags a broken sum check', () => {
    const bad = A.sumChecks({ is: { revenue: 100, otherIncome: 5, totalIncome: 200 } });
    expect(bad[0].check).toBe('revenue+otherIncome=totalIncome');
  });

  it('maps cash flow with outflows negative', () => {
    const cf = (n, v) => `<in-capmkt:${n} contextRef="FourD" unitRef="INR">${v}</in-capmkt:${n}>`;
    const xml = `<xbrli:xbrl>
<xbrli:context id="FourD"><xbrli:entity/><xbrli:period><xbrli:startDate>2025-04-01</xbrli:startDate><xbrli:endDate>2026-03-31</xbrli:endDate></xbrli:period></xbrli:context>
${cf('CashFlowsFromUsedInOperatingActivities', 654500000)}${cf('IncomeTaxesPaidRefundClassifiedAsOperatingActivities', 412100000)}
${cf('PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities', 1462200000)}${cf('RepaymentsOfBorrowingsClassifiedAsFinancingActivities', 890200000)}</xbrli:xbrl>`;
    const p = parseXbrl(xml);
    const out = A.cashFlowSnapshot(p, A.pickContexts(p));
    expect(out.cfo).toBeCloseTo(65.45);
    expect(out.taxPaid).toBeCloseTo(-41.21);
    expect(out.capex).toBeCloseTo(-146.22);
    expect(out.repaymentOfBorrowings).toBeCloseTo(-89.02);
  });
});

describe('resolver helpers', () => {
  it('shifts month ends and parses dates and codes', () => {
    expect(R.shiftMonthEnd('2026-06-30', -3)).toBe('2026-03-31');
    expect(R.shiftMonthEnd('2026-03-31', -12)).toBe('2025-03-31');
    expect(R.shiftMonthEnd('2026-03-31', -1)).toBe('2026-02-28');
    expect(R.nseDateToIso('30-JUN-2026')).toBe('2026-06-30');
    expect(R.bseQuarterEnd('JQ2026-2027')).toBe('2026-06-30');
    expect(R.bseQuarterEnd('MQ2025-2026')).toBe('2026-03-31');
    expect(R.bseQuarterEnd('MC2025-2026')).toBeNull();
    expect(R.bseQuarterEnd('SH2025-2026')).toBeNull();
  });

  it('prefers the latest NSE revision and the html BSE file', () => {
    const rows = [
      {
        xbrl: 'a',
        qe_Date: '30-JUN-2026',
        consolidated: 'Consolidated',
        broadcast_Date: '01-Aug-2026 10:00:00',
      },
      {
        xbrl: 'b',
        qe_Date: '30-JUN-2026',
        consolidated: 'Consolidated',
        broadcast_Date: '05-Aug-2026 10:00:00',
      },
      {
        xbrl: 'c',
        qe_Date: '30-JUN-2026',
        consolidated: 'Standalone',
        broadcast_Date: '01-Aug-2026 10:00:00',
      },
    ];
    expect(R.pickNseRow(rows, '2026-06-30', 'consolidated')).toMatchObject({
      count: 2,
      row: { xbrl: 'b' },
    });
    const brows = [
      { quarter_code: 'JQ2026-2027', XMLName: 'old.xml', Fld_CreateDate: '2026-08-05T00:00:00' },
      { quarter_code: 'JQ2026-2027', XMLName: 'new.html', Fld_CreateDate: '2026-08-01T00:00:00' },
    ];
    expect(R.pickBseFile(brows, '2026-06-30', 'standalone').file).toBe('new.html');
  });
});

describe('resolveResultPeriods', () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xbrl-test-'));
  const nseRow = (n, qe, basis = 'Consolidated') => ({
    xbrl: URL_INDAS(n),
    qe_Date: qe,
    consolidated: basis,
    broadcast_Date: '01-Aug-2026 10:00:00',
  });
  const files = {
    [URL_INDAS(1)]: q('2026-04-01', '2026-06-30', 120),
    [URL_INDAS(2)]: q('2026-01-01', '2026-03-31', 110),
  };
  const nse = {
    getIntegratedFilings: async () => [nseRow(1, '30-JUN-2026'), nseRow(2, '31-MAR-2026')],
    fetchArchiveXml: async (u) => files[u] || null,
  };
  const bse = {
    getScripCode: async () => '123456',
    getResultXbrlRows: async () => [
      {
        quarter_code: 'JQ2025-2026',
        Consol_XMLName: 'Integrated_Finance_Ind_As_123456_x_IFIndAs.html',
        Fld_CreateDate: '2025-08-01T00:00:00',
      },
    ],
    fetchXbrlFile: async () => q('2025-04-01', '2025-06-30', 100),
  };

  it('uses NSE for current/prior and BSE for the year-ago quarter', async () => {
    const issues = createIssueLog('t1');
    const r = await resolveResultPeriodsWith(issues);
    expect(r.basis).toBe('consolidated');
    expect(r.cur).toMatchObject({ ok: true, exchange: 'NSE' });
    expect(r.qoq).toMatchObject({ ok: true, exchange: 'NSE' });
    expect(r.yoy).toMatchObject({ ok: true, exchange: 'BSE' });
    expect(r.cur.is.revenue).toBeCloseTo(120);
    expect(r.yoy.is.revenue).toBeCloseTo(100);
  });

  it('reports a missing period and falls back per period', async () => {
    const issues = createIssueLog('t2');
    const r = await R.resolveResultPeriods({
      symbol: 'X',
      nse,
      bse: { ...bse, getResultXbrlRows: async () => [] },
      issues,
      cache: R.makeTextCache(cacheDir),
      crossCheck: false,
    });
    expect(r.yoy.ok).toBe(false);
    expect(
      issues.all().some((i) => i.category === 'MISSING_FILING' && i.severity === 'major')
    ).toBe(true);
    const pdf = { found: true, raw: { qoq: {}, yoy: { revenue: 95, pat: 7 } } };
    const out = assemble(r, pdf, issues);
    expect(out.incomeStatement.provenance.yoy.source).toBe('pdf');
    expect(out.incomeStatement.provenance.cur.source).toBe('xbrl-nse');
    expect(out.incomeStatement.raw.yoy.revenue).toBe(95);
    expect(out.statements.analysable).toEqual({ balanceSheet: false, cashflow: false });
  });

  it('returns not-ok for an unsupported family without probing prior periods', async () => {
    const issues = createIssueLog('t3');
    const bank = {
      getIntegratedFilings: async () => [
        {
          xbrl: 'https://x/INTEGRATED_FILING_REIT_9_WEB.xml',
          qe_Date: '30-JUN-2026',
          consolidated: 'Consolidated',
          broadcast_Date: '01-Aug-2026 10:00:00',
        },
      ],
      fetchArchiveXml: async () => q('2026-04-01', '2026-06-30', 1),
    };
    const r = await R.resolveResultPeriods({
      symbol: 'B',
      nse: bank,
      bse: { ...bse, getResultXbrlRows: async () => [] },
      issues,
      cache: R.makeTextCache(cacheDir),
    });
    expect(r.cur).toMatchObject({ ok: false, reason: 'unsupported-family:unknown' });
    expect(r.qoq).toBeNull();
  });

  it('keeps issue logs separate between concurrent runs', async () => {
    const [a, b] = [createIssueLog('a'), createIssueLog('b')];
    await Promise.all([resolveResultPeriodsWith(a), resolveResultPeriodsWith(b)]);
    expect(a.all().length).toBe(b.all().length);
    expect(a.all().every((i) => i.runId === 'a')).toBe(true);
  });

  function resolveResultPeriodsWith(issues) {
    return R.resolveResultPeriods({
      symbol: 'X',
      nse,
      bse,
      issues,
      cache: R.makeTextCache(cacheDir),
      crossCheck: false,
    });
  }
});

describe('coverageOf', () => {
  it.each([
    [90, 'quarter'],
    [183, 'half-year'],
    [273, 'nine-month'],
    [364, 'full-year'],
    [null, 'unknown'],
  ])('%s -> %s', (d, c) => expect(coverageOf(d)).toBe(c));
});

describe('half-yearly filers, SME family and BSE half-year codes', () => {
  const { parseXbrl, detectResultFamily } = require('../parse');
  const A2 = require('../resultsAdapter');
  const R2 = require('../resultsResolver');
  const doc = `<xbrli:xbrl>
<xbrli:context id="OneD"><xbrli:entity/><xbrli:period><xbrli:startDate>2025-10-01</xbrli:startDate><xbrli:endDate>2026-03-31</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:context id="FourD"><xbrli:entity/><xbrli:period><xbrli:startDate>2025-04-01</xbrli:startDate><xbrli:endDate>2026-03-31</xbrli:endDate></xbrli:period></xbrli:context>
<in-capmkt:RevenueFromOperations contextRef="OneD" unitRef="INR">2290616000</in-capmkt:RevenueFromOperations>
<in-capmkt:ProfitBeforeTax contextRef="OneD" unitRef="INR">361730000</in-capmkt:ProfitBeforeTax>
<in-capmkt:DepreciationAndAmortisationExpense contextRef="OneD" unitRef="INR">19292000</in-capmkt:DepreciationAndAmortisationExpense>
<in-capmkt:ProfitLossForThePeriod contextRef="OneD" unitRef="INR">270499000</in-capmkt:ProfitLossForThePeriod>
</xbrli:xbrl>`;
  it('treats a 6-month current context as the period and maps SME aliases', () => {
    const p = parseXbrl(doc);
    const c = A2.pickContexts(p);
    expect(c.quarter).toBe('OneD');
    expect(c.periodDays).toBe(181);
    const is = A2.incomeSnapshot(p, c.quarter);
    expect(is.depreciation).toBeCloseTo(1.9292, 4);
    expect(is.pat).toBeCloseTo(27.0499, 4);
  });
  it('detects the SME family and supports it', () => {
    expect(
      detectResultFamily('IFOtherthanDuplicateUploadDocument/IFOtherthan_1_2_IFOtherthan.html')
    ).toBe('sme');
    expect(A2.SUPPORTED_FAMILIES).toContain('sme');
  });
  it('ranks BSE half-year and annual codes below quarter codes', () => {
    expect(R2.bsePeriod('MQ2025-2026')).toEqual({ end: '2026-03-31', rank: 0 });
    expect(R2.bsePeriod('MH2025-2026')).toEqual({ end: '2026-03-31', rank: 1 });
    expect(R2.bsePeriod('SH2025-2026')).toEqual({ end: '2025-09-30', rank: 1 });
    expect(R2.bsePeriod('MC2025-2026')).toEqual({ end: '2026-03-31', rank: 2 });
    expect(R2.bsePeriod('XX')).toBeNull();
    const rows = [
      { quarter_code: 'MC2025-2026', XMLName: 'annual.html' },
      { quarter_code: 'MH2025-2026', XMLName: 'half.html' },
    ];
    expect(R2.pickBseFile(rows, '2026-03-31', 'standalone').file).toBe('half.html');
  });
});

describe('bank and insurer families', () => {
  const { parseXbrl: px } = require('../parse');
  const A3 = require('../resultsAdapter');
  const ctx = `<xbrli:context id="OneD"><xbrli:entity/><xbrli:period><xbrli:startDate>2026-04-01</xbrli:startDate><xbrli:endDate>2026-06-30</xbrli:endDate></xbrli:period></xbrli:context>`;
  const bank = `<xbrli:xbrl>${ctx}
<in-capmkt:InterestEarned contextRef="OneD" unitRef="INR">905753300000</in-capmkt:InterestEarned>
<in-capmkt:OtherIncome contextRef="OneD" unitRef="INR">425350300000</in-capmkt:OtherIncome>
<in-capmkt:Income contextRef="OneD" unitRef="INR">1331103600000</in-capmkt:Income>
<in-capmkt:OperatingProfitBeforeProvisionAndContingencies contextRef="OneD" unitRef="INR">309960000000</in-capmkt:OperatingProfitBeforeProvisionAndContingencies>
<in-capmkt:ProvisionsOtherThanTaxAndContingencies contextRef="OneD" unitRef="INR">38028400000</in-capmkt:ProvisionsOtherThanTaxAndContingencies>
<in-capmkt:ProfitLossFromOrdinaryActivitiesBeforeTax contextRef="OneD" unitRef="INR">271931600000</in-capmkt:ProfitLossFromOrdinaryActivitiesBeforeTax>
<in-capmkt:TaxExpense contextRef="OneD" unitRef="INR">68104700000</in-capmkt:TaxExpense>
<in-capmkt:ProfitLossFromOrdinaryActivitiesAfterTax contextRef="OneD" unitRef="INR">203826900000</in-capmkt:ProfitLossFromOrdinaryActivitiesAfterTax>
<in-capmkt:ProfitLossForThePeriod contextRef="OneD" unitRef="INR">203826900000</in-capmkt:ProfitLossForThePeriod>
<in-capmkt:BasicEarningsPerShareAfterExtraordinaryItems contextRef="OneD" unitRef="INR">12.5</in-capmkt:BasicEarningsPerShareAfterExtraordinaryItems>
</xbrli:xbrl>`;
  const gi = `<xbrli:xbrl>${ctx}
<in-capmkt:OperatingIncome contextRef="OneD" unitRef="INR">68137100000</in-capmkt:OperatingIncome>
<in-capmkt:CombinedRatio contextRef="OneD" unitRef="pure">1.072</in-capmkt:CombinedRatio>
<in-capmkt:ProfitOrLossBeforeTax contextRef="OneD" unitRef="INR">5357000000</in-capmkt:ProfitOrLossBeforeTax>
<in-capmkt:ProvisionForTax contextRef="OneD" unitRef="INR">1325300000</in-capmkt:ProvisionForTax>
<in-capmkt:ProfitLossAfterTax contextRef="OneD" unitRef="INR">9999000000</in-capmkt:ProfitLossAfterTax>
</xbrli:xbrl>`;
  it('maps bank P&L to normalized keys and Rs Cr', () => {
    const p = px(bank);
    const is = A3.incomeSnapshot(p, 'OneD', 'banking');
    expect(is.revenue).toBeCloseTo(133110.36, 2);
    expect(is.ppop).toBeCloseTo(30996, 2);
    expect(is.epsBasic).toBe(12.5);
    expect(A3.sumChecks({ is, family: 'banking' })).toEqual([]);
  });
  it('converts insurer ratios from fractions to percent', () => {
    const is = A3.incomeSnapshot(px(gi), 'OneD', 'general-insurance');
    expect(is.combinedRatioPct).toBe(107.2);
  });
  it('flags a broken pbt-tax=pat chain for insurers only as minor', () => {
    const is = A3.incomeSnapshot(px(gi), 'OneD', 'general-insurance');
    const f = A3.sumChecks({ is, family: 'general-insurance' });
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('minor');
  });
  it('lists banks and insurers as supported families', () => {
    for (const f of ['banking', 'life-insurance', 'general-insurance'])
      expect(A3.SUPPORTED_FAMILIES).toContain(f);
  });
});

describe('BSE legacy in-bse-fin .xml uploads', () => {
  const legacy = (facts) =>
    `<?xml version="1.0"?><xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:in-bse-fin="http://www.bseindia.com/xbrl/fin/2019-03-31/in-bse-fin">` +
    `<xbrli:context id="OneD"><xbrli:entity><xbrli:identifier scheme="s">1</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2019-04-01</xbrli:startDate><xbrli:endDate>2019-06-30</xbrli:endDate></xbrli:period></xbrli:context>` +
    facts
      .map(
        ([k, v]) =>
          `<in-bse-fin:${k} contextRef="OneD" unitRef="INR" decimals="-5">${v}</in-bse-fin:${k}>`
      )
      .join('') +
    `</xbrli:xbrl>`;

  it('maps legacy NBFC names through the Ind AS map', () => {
    const p = parseXbrl(
      legacy([
        ['RevenueFromOperations', 52977800000],
        ['ProfitBeforeTax', 17440400000],
        ['ProfitLossForPeriod', 11247300000],
      ])
    );
    const c = A.pickContexts(p);
    const s = A.incomeSnapshot(p, c.quarter, 'indas');
    expect(s.revenue).toBeCloseTo(5297.78, 2);
    expect(s.pat).toBeCloseTo(1124.73, 2);
  });

  it('maps legacy Banking names through the bank map', () => {
    const p = parseXbrl(
      legacy([
        ['Income', 141761600000],
        ['ProfitLossForThePeriod', 33376200000],
        ['PercentageOfGrossNpa', 0.0275],
      ])
    );
    const c = A.pickContexts(p);
    const s = A.incomeSnapshot(p, c.quarter, 'banking');
    expect(s.revenue).toBeCloseTo(14176.16, 2);
    expect(s.gnpaPct).toBeCloseTo(2.75, 2);
  });
});

describe('regressions found in the full-database validation (2026-09-30)', () => {
  const { parseXbrl: px } = require('../parse');
  const A4 = require('../resultsAdapter');
  const ctx = (id, inst) =>
    `<xbrli:context id="${id}"><xbrli:entity/><xbrli:period>${inst}</xbrli:period></xbrli:context>`;
  const dur = ctx(
    'OneD',
    '<xbrli:startDate>2026-01-01</xbrli:startDate><xbrli:endDate>2026-03-31</xbrli:endDate>'
  );
  const inst = ctx('OneI', '<xbrli:instant>2026-03-31</xbrli:instant>');
  const f = (n, v, c = 'OneD') =>
    `<in-capmkt:${n} contextRef="${c}" unitRef="INR">${v}</in-capmkt:${n}>`;

  it('SME: ExtraordinaryItems sit between "before exceptional" and PBT (ZENITHDRUG shape)', () => {
    const p = px(`<xbrli:xbrl>${dur}
${f('RevenueFromOperations', 900000000)}${f('Income', 900000000)}
${f('ProfitBeforeExceptionalAndExtraordinaryItemsAndTax', 560270000)}${f('ExceptionalItems', 0)}
${f('ExtraordinaryItems', -21540000)}${f('ProfitBeforeTax', 538730000)}${f('TaxExpense', 144470000)}
${f('ProfitLossForThePeriod', 394260000)}</xbrli:xbrl>`);
    const is = A4.incomeSnapshot(p, 'OneD');
    expect(is.extraordinaryItems).toBeCloseTo(-2.154, 3);
    expect(A4.sumChecks({ is })).toEqual([]);
  });

  it('SME: minority-interest line and associates are added to reach PAT (OLIL shape)', () => {
    const p = px(`<xbrli:xbrl>${dur}
${f('RevenueFromOperations', 900000000)}${f('Income', 900000000)}
${f('ProfitBeforeTax', 246980000)}${f('TaxExpense', 44500000)}
${f('ShareOfProfitLossOfAssociates', -11570000)}${f('ProfitLossOfMinorityInterest', 22360000)}
${f('ProfitLossForThePeriod', 213270000)}</xbrli:xbrl>`);
    const is = A4.incomeSnapshot(p, 'OneD');
    expect(A4.sumChecks({ is })).toEqual([]);
  });

  it('general insurer: total assets is ApplicationOfFunds, not the bare Assets element (NIACL shape)', () => {
    const p = px(`<xbrli:xbrl>${inst}
${f('SourcesOfFunds', 385932200000, 'OneI')}${f('ApplicationOfFunds', 385932200000, 'OneI')}
${f('Assets', 781662500000, 'OneI')}</xbrli:xbrl>`);
    const bs = A4.balanceSheetSnapshot(p, 'OneI', 'general-insurance');
    expect(bs.totalAssets).toBeCloseTo(38593.22, 2);
    expect(A4.sumChecks({ is: {}, bs, family: 'general-insurance' })).toEqual([]);
  });
});
