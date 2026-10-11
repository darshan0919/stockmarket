'use strict';
const { fadedState } = require('../lib/resultsSeasonPrep');
test('fadedState', () => {
  expect(fadedState({ daysFromResult: -80, returnsSinceResult: -4, patGrowthYoY: 35 })).toBe(
    'detected'
  );
  expect(fadedState({ daysFromResult: -80, returnsSinceResult: -15, patGrowthYoY: 35 })).toBe(
    'confirmed'
  );
  expect(fadedState({ daysFromResult: -30, returnsSinceResult: -15, patGrowthYoY: 35 })).toBeNull();
  expect(fadedState({ daysFromResult: -80, returnsSinceResult: 5, patGrowthYoY: 35 })).toBeNull();
  expect(fadedState({ daysFromResult: -80, returnsSinceResult: -5, patGrowthYoY: 10 })).toBeNull();
  expect(fadedState({})).toBeNull();
});
