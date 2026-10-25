'use strict';

const { deriveDeltaTag } = require('../scripts/batchQuarterlyResultAnalysis');

describe('deriveDeltaTag protocol enforcement (Rule 17)', () => {
  test('returns Reaffirm when all dependency tags are Reaffirm', () => {
    expect(deriveDeltaTag(['Reaffirm', 'Reaffirm'])).toBe('Reaffirm');
    expect(deriveDeltaTag(['REAFFIRM'])).toBe('Reaffirm');
  });

  test('returns Cut if any dependency is Cut', () => {
    expect(deriveDeltaTag(['Reaffirm', 'Cut'])).toBe('Cut');
    expect(deriveDeltaTag(['Raise', 'Cut'])).toBe('Cut');
    expect(deriveDeltaTag(['CUT', 'REAFFIRM'])).toBe('Cut');
  });

  test('returns Raise only when dependencies justify it', () => {
    expect(deriveDeltaTag(['Raise', 'Raise'])).toBe('Raise');
    expect(deriveDeltaTag(['Raise', 'Reaffirm'])).toBe('Raise');
  });

  test('never returns Raise if neither dependency was raised', () => {
    expect(deriveDeltaTag(['Reaffirm', 'Reaffirm'])).not.toBe('Raise');
    expect(deriveDeltaTag(['Silent', 'Reaffirm'])).not.toBe('Raise');
  });

  test('returns Silent if a key dependency is Silent and none is Cut/Raise', () => {
    expect(deriveDeltaTag(['Silent'])).toBe('Silent');
  });

  test('handles empty or missing dependencies cleanly', () => {
    expect(deriveDeltaTag([])).toBe('Reaffirm');
    expect(deriveDeltaTag(null)).toBe('Reaffirm');
  });
});
