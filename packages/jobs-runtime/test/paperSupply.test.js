'use strict';
const P = require('../lib/paperSupply');
test('fundraiseKind', () => {
  expect(P.fundraiseKind({ title: 'Board approves QIP of Rs 500 Cr' })).toBe('QIP');
  expect(P.fundraiseKind({ description: 'Preferential allotment of warrants to promoter' })).toBe('PREFERENTIAL');
  expect(P.fundraiseKind({ title: 'Statement of Deviation / Variation for proceeds of preferential issue' })).toBeNull();
  expect(P.fundraiseKind({ title: 'Outcome of Board Meeting' })).toBeNull();
});
test('conversion allotments are capped at detected', () => {
  expect(P.fundraiseKind({ title: 'Allotment of shares pursuant to conversion of warrants' })).toBe('PREFERENTIAL_CONVERSION');
  expect(P.fundraiseState('PREFERENTIAL_CONVERSION', 200)).toBe('detected');
});
test('blockSellState needs high PE and size', () => {
  expect(P.blockSellState(30, 60)).toBe('detected');
  expect(P.blockSellState(150, 60)).toBe('confirmed');
  expect(P.blockSellState(150, 40)).toBeNull();
  expect(P.blockSellState(10, 90)).toBeNull();
  expect(P.blockSellState(null, 90)).toBeNull();
});
test('fundraiseState', () => {
  expect(P.fundraiseState('QIP', 70)).toBe('detected');
  expect(P.fundraiseState('QIP', 120)).toBe('confirmed');
  expect(P.fundraiseState('QIP', 30)).toBeNull();
  expect(P.fundraiseState(null, 120)).toBeNull();
});
test('sellValueBySymbol sums SELL only', () => {
  const m = P.sellValueBySymbol([
    { BD_SYMBOL: 'AAA', BD_BUY_SELL: 'SELL', BD_QTY_TRD: 1e6, BD_TP_WATP: 100 },
    { BD_SYMBOL: 'AAA', BD_BUY_SELL: 'SELL', BD_QTY_TRD: 1e6, BD_TP_WATP: 100 },
    { BD_SYMBOL: 'AAA', BD_BUY_SELL: 'BUY', BD_QTY_TRD: 1e6, BD_TP_WATP: 100 },
  ]);
  expect(m.get('AAA')).toBeCloseTo(20);
});
test('quarterDate', () => {
  expect(P.quarterDate('2026-10-11')).toBe('202612');
  expect(P.quarterDate('2026-09-30')).toBe('202609');
});
