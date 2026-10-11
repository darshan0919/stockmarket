'use strict';
const L = require('../lib/sectorLifecycle');

const day = (i) => new Date(Date.UTC(2024, 0, 1) + i * 86400000).toISOString().slice(0, 10);
const candles = (closes) => closes.map((c, i) => [day(i), c, c, c, c, 1000]);
const ramp = (n, from, to) =>
  Array.from({ length: n }, (_, i) => from * Math.pow(to / from, i / (n - 1)));

describe('sectorIndex + priceTest', () => {
  test('doubling in the window is crowded; equal-weight', () => {
    const idx = L.sectorIndex([candles(ramp(400, 100, 230)), candles(ramp(400, 50, 120))]);
    const p = L.priceTest(idx.series);
    expect(p.flag).toBe('crowded');
    expect(p.x).toBeGreaterThan(2);
    expect(p.phase).toBe('crowded');
  });
  test('split artifact ticker is dropped', () => {
    const bad = ramp(400, 100, 100);
    bad[200] = 40;
    expect(L.sectorIndex([candles(bad), candles(ramp(400, 100, 110))]).used).toBe(1);
  });
  test('recent listing (history shorter than window) excluded', () => {
    const short = candles(ramp(100, 10, 400)).map((r, i) => [day(300 + i), ...r.slice(1)]);
    expect(L.sectorIndex([short, candles(ramp(400, 100, 110))], L.TH, day(20)).used).toBe(1);
  });
  test('peak then 20% drop = fading, no crowded flag if now < 2x', () => {
    const c = [...ramp(200, 100, 190), ...ramp(100, 190, 150)];
    const p = L.priceTest(L.sectorIndex([candles(c)]).series);
    expect(p.phase).toBe('fading');
  });
  test('flat = base, null flag', () => {
    const p = L.priceTest(L.sectorIndex([candles(ramp(300, 100, 105))]).series);
    expect(p.flag).toBeNull();
    expect(p.phase).toBe('base');
  });
  test('too short = insufficient', () =>
    expect(L.priceTest([['2024-01-01', 1]]).insufficient).toBe(true));
});

describe('supplyTest', () => {
  test('4 listings in 12m crowds', () =>
    expect(
      L.supplyTest(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'], 40, '2026-10-11').flag
    ).toBe('crowded'));
  test('2 of 6 names (33%) crowds', () =>
    expect(L.supplyTest(['2026-01-01', '2026-02-01'], 6, '2026-10-11').flag).toBe('crowded'));
  test('old listings ignored', () =>
    expect(L.supplyTest(['2024-01-01'], 6, '2026-10-11').flag).toBeNull());
});

describe('peTest', () => {
  const snaps = Array.from({ length: 30 }, (_, i) => [
    { industry: 'X', medianPe: i < 13 ? 20 : 32 },
  ]);
  test('n/a before 26 snapshots', () =>
    expect(L.peTest('X', snaps.slice(0, 5)).insufficient).toBe(true));
  test('1.6x vs base is stretched', () => expect(L.peTest('X', snaps).flag).toBe('stretched'));
});

describe('evaluate', () => {
  test('0 / 1 / 2 flags', () => {
    expect(L.evaluate({ price: { flag: null }, supply: { flag: null } }).state).toBeNull();
    expect(L.evaluate({ price: { flag: 'crowded' }, supply: { flag: null } }).state).toBe(
      'detected'
    );
    expect(
      L.evaluate({ price: { flag: 'crowded', phase: 'crowded' }, supply: { flag: 'crowded' } })
        .state
    ).toBe('confirmed');
  });
  test('warm price alone is not a flag', () =>
    expect(L.evaluate({ price: { flag: 'warm' } }).state).toBeNull());
});
