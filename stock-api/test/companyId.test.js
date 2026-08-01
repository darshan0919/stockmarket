'use strict';

const { sanitizeCompanyId, KNOWN_SERIES_SUFFIXES } = require('../src/utils/companyId');

describe('sanitizeCompanyId', () => {
  test('strips a known dash-separated series suffix', () => {
    expect(sanitizeCompanyId('NSE:SOMECO-BE')).toBe('NSE:SOMECO');
    expect(sanitizeCompanyId('SOMECO-SM')).toBe('SOMECO');
    expect(sanitizeCompanyId('NSE:XYZ-BZ')).toBe('NSE:XYZ');
  });

  test('is case-insensitive on the suffix', () => {
    expect(sanitizeCompanyId('NSE:SOMECO-be')).toBe('NSE:SOMECO');
  });

  test('leaves a bare ticker with no suffix untouched', () => {
    expect(sanitizeCompanyId('NSE:TATASTEEL')).toBe('NSE:TATASTEEL');
    expect(sanitizeCompanyId('BSE:500325')).toBe('BSE:500325');
  });

  test('does not touch a dash that is not a known series suffix', () => {
    // A genuine company/scrip name containing a dash must survive untouched —
    // this is the "narrow by design" guarantee from the module's doc comment.
    expect(sanitizeCompanyId('NSE:ABC-DEF')).toBe('NSE:ABC-DEF');
    expect(sanitizeCompanyId('NSE:L&T-FH')).toBe('NSE:L&T-FH');
  });

  test('only strips the suffix at the end of the string', () => {
    expect(sanitizeCompanyId('NSE:BE-SOMECO')).toBe('NSE:BE-SOMECO');
  });

  test('handles null/undefined/empty input without throwing', () => {
    expect(sanitizeCompanyId(null)).toBe('');
    expect(sanitizeCompanyId(undefined)).toBe('');
    expect(sanitizeCompanyId('')).toBe('');
  });

  test('trims surrounding whitespace', () => {
    expect(sanitizeCompanyId('  NSE:SOMECO-BE  ')).toBe('NSE:SOMECO');
  });

  test('every suffix in KNOWN_SERIES_SUFFIXES is actually stripped', () => {
    for (const suffix of KNOWN_SERIES_SUFFIXES) {
      expect(sanitizeCompanyId(`NSE:FOO-${suffix}`)).toBe('NSE:FOO');
    }
  });
});
