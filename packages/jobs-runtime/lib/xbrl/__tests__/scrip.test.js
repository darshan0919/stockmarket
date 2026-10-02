'use strict';

const { resolveBseScrip, searchScripIssue } = require('../scrip');

describe('resolveBseScrip', () => {
  const search = (code) => ({ getScripCode: jest.fn(async () => code) });

  it('prefers an explicit override', async () => {
    const bse = search('999999');
    const r = await resolveBseScrip({ symbol: 'HSIL', bseScrip: 500000, bse, lookup: () => '1' });
    expect(r).toEqual({ scrip: '500000', source: 'override' });
    expect(bse.getScripCode).not.toHaveBeenCalled();
  });

  it('uses a numeric symbol as the scrip code', async () => {
    const r = await resolveBseScrip({ symbol: 'BSE:543916', bse: search(null) });
    expect(r).toEqual({ scrip: '543916', source: 'symbol' });
  });

  it('uses the stored company-record code before searching', async () => {
    const bse = search('543916'); // the wrong-company search hit seen for HSIL
    const r = await resolveBseScrip({ symbol: 'NSE:HSIL', bse, lookup: () => '505292' });
    expect(r).toEqual({ scrip: '505292', source: 'stored' });
    expect(bse.getScripCode).not.toHaveBeenCalled();
  });

  it('falls back to search and reports the source', async () => {
    const r = await resolveBseScrip({ symbol: 'ABC', bse: search('123456'), lookup: () => null });
    expect(r).toEqual({ scrip: '123456', source: 'search' });
    expect(searchScripIssue('ABC', '123456')).toMatchObject({ severity: 'info' });
  });

  it('rejects a search hit that is a different company (NRL -> GNRL, Gujarat Natural Resources)', async () => {
    const bse = {
      smartSearch: jest.fn(async () => ({
        symbols: [
          { symbol: 'NRL', symbol_info: 'GUJARAT NATURAL RESOURCES LTD', bse_scrip_code: '513536' },
        ],
      })),
    };
    const r = await resolveBseScrip({
      symbol: 'NRL',
      name: 'Nupur Recyclers Ltd',
      bse,
      lookup: () => null,
    });
    expect(r).toEqual({ scrip: null, source: 'mismatch' });
  });

  it('accepts a search hit whose name matches', async () => {
    const bse = {
      smartSearch: jest.fn(async () => ({
        symbols: [{ symbol: 'ABC', symbol_info: 'ABC INDUSTRIES LTD', bse_scrip_code: '123456' }],
      })),
    };
    const r = await resolveBseScrip({
      symbol: 'ABC',
      name: 'ABC Industries Limited',
      bse,
      lookup: () => null,
    });
    expect(r).toEqual({ scrip: '123456', source: 'search' });
  });

  it('returns nulls when nothing resolves', async () => {
    const r = await resolveBseScrip({ symbol: 'ABC', bse: search(null), lookup: () => null });
    expect(r).toEqual({ scrip: null, source: null });
  });
});
