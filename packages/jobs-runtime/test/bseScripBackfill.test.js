'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  backfillBseScrips,
  nameOverlap,
  sameCompany,
  nseTickerOf,
  loadChecks,
  saveChecks,
} = require('../lib/bseScripBackfill');

const hit = (symbol, name, code) => ({ symbol, symbol_info: name, bse_scrip_code: code });
const bseWith = (table) => ({
  smartSearch: jest.fn(async (q) => ({ symbols: table[q] ? [table[q]] : [] })),
});

describe('nseTickerOf', () => {
  it('strips the NSE: prefix that companies.json stores on nseTicker', () => {
    expect(nseTickerOf({ id: 'NSE:GRINDWELL', nseTicker: 'NSE:GRINDWELL' })).toBe('GRINDWELL');
    expect(nseTickerOf({ id: 'NSE:ABC' })).toBe('ABC');
    expect(nseTickerOf({ id: 'BSE:500001' })).toBeNull();
  });
});

describe('sameCompany', () => {
  it('handles spacing, nameless records and the HSIL wrong-company case', () => {
    expect(sameCompany({ name: 'D P Wires Ltd' }, 'DPWIRES', 'DP WIRES LTD').ok).toBe(true);
    expect(sameCompany({ name: null }, 'SHREYASI', 'SHREYAS INTERMEDIATES LTD').ok).toBe(true);
    expect(sameCompany({ name: null }, 'HSIL', 'HEMANT SURGICAL INDUSTRIES LTD').ok).toBe(false);
    expect(sameCompany({ name: 'Bright Solar Ltd' }, 'BRIGHT', 'BRIGHT OUTDOOR MEDIA LTD').ok).toBe(
      false
    );
  });
});

describe('nameOverlap', () => {
  it('matches a company across suffix and punctuation differences, and rejects a different company', () => {
    expect(nameOverlap('Grindwell Norton Ltd', 'GRINDWELL NORTON LTD')).toBe(1);
    expect(nameOverlap('HSIL Ltd', 'HEMANT SURGICAL INDUSTRIES LTD')).toBe(0);
  });
});

describe('backfillBseScrips', () => {
  const now = new Date('2026-09-30T00:00:00Z');
  const recs = [
    { id: 'NSE:GOOD', name: 'Good Industries Ltd', creator: 'x', modifiedTime: '2026-09-29' },
    { id: 'NSE:HSIL', name: 'HSIL Ltd', modifiedTime: '2026-09-28' },
    { id: 'NSE:SMEONLY', name: 'Sme Only Ltd', modifiedTime: '2026-09-27' },
    { id: 'NSE:HAS', name: 'Has Code', bseScripCode: '1', modifiedTime: '2026-09-26' },
    { id: 'BSE:500001', name: 'Bse Only', modifiedTime: '2026-09-25' },
  ];
  const table = {
    GOOD: hit('GOOD', 'GOOD INDUSTRIES LTD', '500111'),
    HSIL: hit('HSIL', 'HEMANT SURGICAL INDUSTRIES LTD', '543916'),
  };

  it('accepts matching names, rejects wrong-company hits, stamps not-found, skips done and BSE-only', async () => {
    const bse = bseWith(table);
    const { updates, checks, stats } = await backfillBseScrips({ records: recs, bse, now });
    expect(stats).toMatchObject({ candidates: 3, accepted: 1, mismatch: 1, notFound: 1 });
    expect(updates).toEqual([
      { id: 'NSE:GOOD', creator: 'x', bseScripCode: '500111', aliases: ['BSE:500111'] },
    ]);
    expect(checks['NSE:HSIL']).toMatchObject({ status: 'MISMATCH', scrip: '543916' });
    expect(checks['NSE:SMEONLY'].status).toBe('NOT_FOUND');
    expect(bse.smartSearch).not.toHaveBeenCalledWith('HAS');
  });

  it('does not re-query recent NOT_FOUND/MISMATCH stamps but retries old ones and errors', async () => {
    const bse = bseWith(table);
    const first = await backfillBseScrips({ records: recs, bse, now });
    bse.smartSearch.mockClear();
    const again = await backfillBseScrips({
      records: recs.filter((r) => r.id !== 'NSE:GOOD'),
      checks: first.checks,
      bse,
      now: new Date('2026-10-05T00:00:00Z'),
    });
    expect(again.stats.candidates).toBe(0);
    const later = await backfillBseScrips({
      records: recs.filter((r) => r.id !== 'NSE:GOOD'),
      checks: first.checks,
      bse,
      now: new Date('2026-11-15T00:00:00Z'),
    });
    expect(later.stats.candidates).toBe(2);

    const failing = {
      smartSearch: jest.fn(async () => {
        throw new Error('net');
      }),
    };
    const r = await backfillBseScrips({ records: [recs[0]], bse: failing, now });
    expect(r.stats.error).toBe(1);
    expect(r.checks['NSE:GOOD']).toBeUndefined(); // transient: retried next run
  });

  it('honours the per-run limit, newest-touched first', async () => {
    const bse = bseWith(table);
    const { updates } = await backfillBseScrips({ records: recs, bse, now, limit: 1 });
    expect(updates.map((u) => u.id)).toEqual(['NSE:GOOD']);
    expect(bse.smartSearch).toHaveBeenCalledTimes(1);
  });
});

describe('check stamps persistence', () => {
  it('merges concurrent saves keeping the newer stamp', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scripchk-'));
    process.env.DATA_V2_DIR = dir;
    saveChecks({ 'NSE:A': { status: 'NOT_FOUND', at: '2026-09-01T00:00:00Z' } });
    saveChecks({
      'NSE:A': { status: 'OK', at: '2026-09-02T00:00:00Z' },
      'NSE:B': { status: 'NOT_FOUND', at: '2026-09-02T00:00:00Z' },
    });
    saveChecks({ 'NSE:A': { status: 'NOT_FOUND', at: '2026-08-01T00:00:00Z' } }); // stale write loses
    expect(loadChecks()['NSE:A'].status).toBe('OK');
    expect(loadChecks()['NSE:B'].status).toBe('NOT_FOUND');
    delete process.env.DATA_V2_DIR;
  });
});
