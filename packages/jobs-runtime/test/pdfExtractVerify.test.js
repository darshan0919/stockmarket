'use strict';

const {
  verifyIncomeStatement,
  groundValues,
  printedNumbers,
  sanitizeCurrent,
} = require('../lib/pdfExtract/verify');

describe('verifyIncomeStatement (L2)', () => {
  const good = {
    revenue: 100,
    otherIncome: 5,
    totalIncome: 105,
    totalExpenses: 80,
    pbt: 25,
    tax: 6,
    pat: 19,
  };
  test('verified when two identities hold', () => {
    expect(verifyIncomeStatement(good).verdict).toBe('verified');
  });
  test('a hard C1 failure fails the column', () => {
    expect(verifyIncomeStatement({ ...good, totalIncome: 400 }).verdict).toBe('failed');
  });
  test('consistent with exactly one identity', () => {
    const r = verifyIncomeStatement({ revenue: 100, otherIncome: 5, totalIncome: 105 });
    expect(r.verdict).toBe('consistent');
  });
  test('unverifiable without operands', () => {
    expect(verifyIncomeStatement({ revenue: 100 }).verdict).toBe('unverifiable');
  });
  test('a soft failure is reported in issues but does not fail a verified column', () => {
    const r = verifyIncomeStatement({ ...good, pbt: 20, pat: 14 }); // exceptional item breaks C2; C1 and C3 hold
    expect(r.verdict).toBe('verified');
    expect(r.issues.length).toBe(1);
  });
});

describe('L1 grounding', () => {
  const page = 'Revenue from operations   1,234.56   (78.90)   0';
  test('printedNumbers strips commas, brackets and signs', () => {
    const p = printedNumbers(page);
    expect(p.has(1234.56)).toBe(true);
    expect(p.has(78.9)).toBe(true);
  });
  test('values absent from the page are ungrounded; zero is always grounded', () => {
    const { grounded, ungrounded } = groundValues(
      { revenue: 1234.56, pat: -78.9, tax: 0, pbt: 999.99 },
      page
    );
    expect(Object.keys(grounded).sort()).toEqual(['pat', 'revenue', 'tax']);
    expect(Object.keys(ungrounded)).toEqual(['pbt']);
  });
});

describe('sanitizeCurrent', () => {
  test('drops an expense line larger than total expenses, keeps the rest', () => {
    const { cur, dropped } = sanitizeCurrent({
      totalIncome: 234,
      totalExpenses: 179,
      employeeCost: 30,
      depreciation: 661.5,
    });
    expect(dropped).toEqual(['depreciation']);
    expect(cur.employeeCost).toBe(30);
  });
  test('drops an absurd totalExpenses', () => {
    const { cur, dropped } = sanitizeCurrent({
      totalIncome: 2680,
      totalExpenses: 24288,
      interest: 101,
    });
    expect(dropped).toContain('totalExpenses');
    expect(cur.totalExpenses).toBeUndefined();
  });
});

describe('reconcileIncomeStatement', () => {
  const { reconcileIncomeStatement, printedNumbers } = require('../lib/pdfExtract/verify');
  const printed = printedNumbers('Tax expenses 23.80   Profit 67.12   90.92');
  test('a wrong operand is repaired when the solved value is printed on the page', () => {
    const r = reconcileIncomeStatement(
      {
        revenue: 622.26,
        otherIncome: 3.19,
        totalIncome: 625.45,
        totalExpenses: 534.53,
        pbt: 90.92,
        tax: 7,
        pat: 67.12,
      },
      { printed, scale: 1 }
    );
    expect(r.cur.tax).toBeCloseTo(23.8, 4);
    expect(r.repaired).toEqual([{ field: 'tax', from: 7, to: expect.closeTo(23.8, 4) }]);
  });
  test('an unvouched suspect with no printed fix is dropped, never served', () => {
    const r = reconcileIncomeStatement(
      {
        revenue: 43.7362,
        otherIncome: 0.01,
        totalIncome: 43.8467,
        totalExpenses: 37.4359,
        pbt: 6.4107,
      },
      { printed: new Set([4373.62]), scale: 0.01, votes: { revenue: 3 } }
    );
    expect(r.dropped).toEqual(['otherIncome']);
    expect(r.cur.otherIncome).toBeUndefined();
    expect(r.cur.revenue).toBe(43.7362);
  });
  test('a lakh-scaled repair is matched against the printed lakh figure', () => {
    const r = reconcileIncomeStatement(
      { revenue: 43.7362, otherIncome: 0.01, totalIncome: 43.8467 },
      { printed: new Set([4373.62, 11.05]), scale: 0.01 }
    );
    expect(r.cur.otherIncome).toBeCloseTo(0.1105, 4);
  });
  test('a clean column is untouched, and soft-identity gaps vouched elsewhere are left alone', () => {
    const clean = { revenue: 10, totalIncome: 10, totalExpenses: 7, pbt: 3, tax: 1, pat: 2 };
    expect(reconcileIncomeStatement(clean, {}).cur).toEqual(clean);
  });
});

describe('vacuous identities and single-read fields', () => {
  const { verifyIncomeStatement, reconcileIncomeStatement } = require('../lib/pdfExtract/verify');
  test('an identity among near-zero garbage does not count as verification', () => {
    const v = verifyIncomeStatement({
      revenue: 10.3469,
      otherIncome: 2.7716,
      totalIncome: 13.1185,
      pbt: 0.01,
      tax: 0,
      pat: 0.01,
    });
    expect(v.verdict).toBe('consistent'); // only C1 counts
  });
  test('with votes, a field no identity vouches for needs two reads', () => {
    const r = reconcileIncomeStatement(
      { revenue: 10, totalIncome: 10, employeeCost: 0.3424, interest: 0.32 },
      { printed: new Set(), votes: { revenue: 2, totalIncome: 2, employeeCost: 1, interest: 2 } }
    );
    expect(r.cur.employeeCost).toBeUndefined();
    expect(r.cur.interest).toBe(0.32);
    expect(r.dropped).toContain('employeeCost');
  });
});

describe('dropSuspectIntegers', () => {
  const { dropSuspectIntegers } = require('../lib/pdfExtract/verify');
  test('drops bare integers for non-headline fields in a decimal table', () => {
    const r = dropSuspectIntegers({
      revenue: 12.34,
      totalIncome: 13.45,
      pbt: 2.31,
      depreciation: 29,
      epsBasic: 2,
      tax: 0,
    });
    expect(r.cur.depreciation).toBeUndefined();
    expect(r.cur.epsBasic).toBeUndefined();
    expect(r.cur.tax).toBe(0);
    expect(r.cur.revenue).toBe(12.34);
  });
  test('leaves integer-printed tables alone', () => {
    const cur = { revenue: 324, totalIncome: 340, depreciation: 12, epsBasic: 6 };
    expect(dropSuspectIntegers(cur).cur).toEqual(cur);
  });
});
