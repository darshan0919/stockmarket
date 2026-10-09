'use strict';
const { dailyValueCr, blockSpike, blockState, fii20 } = require('../lib/liquiditySupply');

const mkDays = (vals) =>
  new Map(vals.map((v, i) => [new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10), v]));

describe('liquiditySupply', () => {
  it('sums qty*price in Rs Cr and parses DD-MON-YYYY', () => {
    const m = dailyValueCr([
      { date: '09-OCT-2026', qty: 1e6, price: 100 },
      { date: '09-OCT-2026', qty: 1e6, price: 100 },
      { date: 'bad', qty: 'x', price: 1 },
    ]);
    expect(m.get('2026-10-09')).toBeCloseTo(20);
    expect(m.size).toBe(1);
  });
  it('flags a block-value spike relative to baseline', () => {
    const flat = Array(20).fill(100);
    expect(blockState(blockSpike(mkDays([...flat, 100, 100, 100, 100, 100])).ratio)).toBe(null);
    const sp = blockSpike(mkDays([...flat, 250, 250, 250, 250, 250]));
    expect(sp.ratio).toBe(2.5);
    expect(blockState(sp.ratio)).toBe('detected');
    expect(blockState(blockSpike(mkDays([...flat, 400, 400, 400, 400, 400])).ratio)).toBe(
      'confirmed'
    );
  });
  it('returns null with too little history or zero baseline', () => {
    expect(blockSpike(mkDays(Array(10).fill(5)))).toBe(null);
    expect(blockSpike(mkDays(Array(25).fill(0)))).toBe(null);
  });
  it('fii20 needs 20 sessions and classifies cumulative outflow', () => {
    expect(fii20(Array(10).fill(-2000))).toBe(null);
    expect(fii20(Array(20).fill(-1000)).state).toBe('detected');
    expect(fii20(Array(20).fill(-2000)).state).toBe('confirmed');
    expect(fii20(Array(20).fill(100)).state).toBe(null);
  });
});
