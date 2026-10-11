'use strict';
const { epsGrowth, recentIpo } = require('../lib/funnelGaps');
test('epsGrowth', () => {
  expect(epsGrowth(26)).toBe('detected');
  expect(epsGrowth(25)).toBeNull();
  expect(epsGrowth(null)).toBeNull();
});
test('recentIpo', () => {
  expect(recentIpo(120)).toBe('detected');
  expect(recentIpo(250)).toBeNull();
  expect(recentIpo(0)).toBeNull();
});
