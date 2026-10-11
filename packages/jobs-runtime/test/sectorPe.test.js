'use strict';
const { aggregateByIndustry, weekKey } = require('../lib/sectorPe');
test('aggregateByIndustry medians and min-n', () => {
  const rows = [10, 20, 30, 40]
    .map((pe) => ({ industry: 'A', sector: 'S', pe, industryPeMedian: 25 }))
    .concat([
      { industry: 'B', pe: 5 },
      { industry: 'B', pe: -3 },
    ]);
  const out = aggregateByIndustry(rows);
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ industry: 'A', n: 4, medianPe: 25, platformMedianPe: 25 });
});
test('weekKey is stable within a week', () => {
  expect(weekKey('2026-10-05')).toBe(weekKey('2026-10-11'));
  expect(weekKey('2026-10-11')).not.toBe(weekKey('2026-10-12'));
});
