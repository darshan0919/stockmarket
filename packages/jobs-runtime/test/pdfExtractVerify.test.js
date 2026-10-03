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
