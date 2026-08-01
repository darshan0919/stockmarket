'use strict';

const { stockscansUrl, stockscansLink, sanitizeSymbol } = require('../src/emailService');

describe('sanitizeSymbol', () => {
  test('strips a known series suffix', () => {
    expect(sanitizeSymbol('NSE:SOMECO-BE')).toBe('NSE:SOMECO');
    expect(sanitizeSymbol('SOMECO-SM')).toBe('SOMECO');
  });

  test('leaves an unsuffixed symbol untouched', () => {
    expect(sanitizeSymbol('NSE:NAZARA')).toBe('NSE:NAZARA');
  });

  test('handles empty/undefined input', () => {
    expect(sanitizeSymbol()).toBe('');
    expect(sanitizeSymbol(null)).toBe('');
  });
});

describe('stockscansUrl', () => {
  test('builds the URL from an exchange-prefixed symbol', () => {
    expect(stockscansUrl('NSE:NAZARA')).toBe('https://www.stockscans.in/company/NSE:NAZARA');
  });

  test('strips a series suffix before building the URL — the bug this fixes', () => {
    expect(stockscansUrl('NSE:SOMECO-BE')).toBe('https://www.stockscans.in/company/NSE:SOMECO');
  });

  test('defaults to NSE when the symbol has no exchange prefix, still sanitized', () => {
    expect(stockscansUrl('SOMECO-SM')).toBe('https://www.stockscans.in/company/NSE:SOMECO');
  });

  test('respects an explicit exchange override', () => {
    expect(stockscansUrl('500325-BE', 'BSE')).toBe('https://www.stockscans.in/company/BSE:500325');
  });

  test('returns empty string for falsy symbol', () => {
    expect(stockscansUrl('')).toBe('');
    expect(stockscansUrl(null)).toBe('');
  });
});

describe('stockscansLink', () => {
  test('wraps the name in an anchor pointing at the sanitized URL', () => {
    const html = stockscansLink('Nazara Technologies Ltd', 'NSE:NAZARA');
    expect(html).toContain('href="https://www.stockscans.in/company/NSE:NAZARA"');
    expect(html).toContain('>Nazara Technologies Ltd<');
    expect(html).toContain('target="_blank"');
  });

  test('a suffixed symbol still produces a working (sanitized) link', () => {
    const html = stockscansLink('Some SME Co', 'SOMECO-SM');
    expect(html).toContain('href="https://www.stockscans.in/company/NSE:SOMECO"');
  });

  test('HTML-escapes the company name', () => {
    const html = stockscansLink('A & B <Co>', 'NSE:AB');
    expect(html).toContain('A &amp; B &lt;Co&gt;');
    expect(html).not.toContain('<Co>');
  });

  test('falls back to plain name (no link) when symbol is missing', () => {
    expect(stockscansLink('No Symbol Co', '')).toBe('No Symbol Co');
  });
});
