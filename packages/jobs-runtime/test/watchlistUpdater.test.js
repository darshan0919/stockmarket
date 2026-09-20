'use strict';

const __os = require('os'),
  __fs = require('fs'),
  __path = require('path');
process.env.DATA_V2_DIR = __fs.mkdtempSync(__path.join(__os.tmpdir(), 'v2test-'));

jest.mock('@stock/api', () => ({
  stockscans: {
    runScan: jest.fn(),
    watchlistTable: jest.fn(),
    updateWatchlist: jest.fn(),
    validateAuth: jest.fn(async () => true),
  },
}));

const {
  computeDiff,
  companyIdsFromTable,
  fetchAllCompanies,
  isWeekday,
  main,
  PAGE_SIZE,
} = require('../watchlistUpdater');

const silent = () => {};
const table = (ids) => [['companyId'], ...ids.map((id) => [id])];

describe('companyIdsFromTable', () => {
  test('extracts ids by header index; tolerates header-only/empty', () => {
    expect(companyIdsFromTable(table(['A', 'B', 'C']))).toEqual(['A', 'B', 'C']);
    expect(companyIdsFromTable([['companyId']])).toEqual([]);
    expect(companyIdsFromTable([])).toEqual([]);
  });

  test('finds companyId even when it is not the first column', () => {
    const t = [
      ['name', 'companyId'],
      ['Foo', 'X'],
      ['Bar', 'Y'],
    ];
    expect(companyIdsFromTable(t)).toEqual(['X', 'Y']);
  });
});

describe('computeDiff (Python set-difference parity)', () => {
  test('add = desired-current, remove = current-desired, both sorted', () => {
    const { add, remove } = computeDiff(['B', 'A', 'C'], ['B', 'D']);
    expect(add).toEqual(['A', 'C']); // sorted
    expect(remove).toEqual(['D']);
  });

  test('no change yields empty arrays', () => {
    expect(computeDiff(['A', 'B'], ['B', 'A'])).toEqual({ add: [], remove: [] });
  });
});

describe('fetchAllCompanies pagination', () => {
  test('walks offsets until total reached', async () => {
    const { stockscans } = require('@stock/api');
    const ids = Array.from({ length: 120 }, (_, i) => `C${i}`);
    stockscans.runScan.mockImplementation(async (payload) => {
      const start = payload.offset;
      return { total: 120, table: table(ids.slice(start, start + PAGE_SIZE)) };
    });
    const out = await fetchAllCompanies(undefined, undefined, stockscans, silent);
    expect(out).toHaveLength(120);
    expect(stockscans.runScan).toHaveBeenCalledTimes(3);
    expect(stockscans.runScan.mock.calls.map((c) => c[0].offset)).toEqual([0, 50, 100]);
  });

  test('stops on a short final page', async () => {
    const { stockscans } = require('@stock/api');
    stockscans.runScan.mockReset();
    stockscans.runScan.mockResolvedValueOnce({ total: 999, table: table(['A', 'B']) });
    const out = await fetchAllCompanies(undefined, undefined, stockscans, silent);
    expect(out).toEqual(['A', 'B']);
    expect(stockscans.runScan).toHaveBeenCalledTimes(1);
  });
});

describe('main --dry-run', () => {
  test('computes diff, excludes Radar, and does NOT mutate the watchlist', async () => {
    const client = {
      validateAuth: jest.fn(async () => true),
      runScan: jest.fn().mockResolvedValue({ total: 3, table: table(['A', 'B', 'RADAR1']) }),
      watchlistTable: jest.fn(),
      updateWatchlist: jest.fn(),
    };
    // First watchlistTable call = Radar (excludes RADAR1); second = current "Near Highs" (has B, OLD).
    client.watchlistTable
      .mockResolvedValueOnce({ table: table(['RADAR1']) })
      .mockResolvedValueOnce({ table: table(['B', 'OLD']) });

    const res = await main({ client, dryRun: true, log: silent });

    expect(res.before).toBe(3);
    expect(res.excluded).toBe(1);
    expect(res.add).toEqual(['A']); // desired {A,B} - current {B,OLD}
    expect(res.remove).toEqual(['OLD']);
    expect(client.updateWatchlist).not.toHaveBeenCalled();
  });
});

describe('isWeekday', () => {
  test('returns true for Monday through Friday (IST)', () => {
    // 2026-09-21 is Monday (10:30 UTC is 16:00 IST)
    expect(isWeekday(new Date('2026-09-21T10:30:00Z'))).toBe(true);
    // 2026-09-25 is Friday
    expect(isWeekday(new Date('2026-09-25T10:30:00Z'))).toBe(true);
  });

  test('returns false for Saturday and Sunday (IST)', () => {
    // 2026-09-20 is Sunday
    expect(isWeekday(new Date('2026-09-20T10:30:00Z'))).toBe(false);
    // 2026-09-26 is Saturday
    expect(isWeekday(new Date('2026-09-26T10:30:00Z'))).toBe(false);
  });
});

describe('main weekdays guard', () => {
  test('skips execution on weekend when weekdaysOnly is true and not force', async () => {
    const client = {
      validateAuth: jest.fn(),
    };
    const realDate = Date;
    global.Date = class extends realDate {
      constructor(...args) {
        if (args.length) super(...args);
        else super('2026-09-20T10:30:00Z');
      }
    };
    try {
      const res = await main({
        client,
        weekdaysOnly: true,
        force: false,
        dryRun: false,
        log: silent,
      });
      expect(res).toEqual({ skipped: true, reason: 'weekend' });
      expect(client.validateAuth).not.toHaveBeenCalled();
    } finally {
      global.Date = realDate;
    }
  });

  test('runs on weekend if force is true', async () => {
    const client = {
      validateAuth: jest.fn().mockResolvedValue(true),
      runScan: jest.fn().mockResolvedValue({ total: 1, table: table(['A']) }),
      watchlistTable: jest.fn().mockResolvedValue({ table: table(['A']) }),
      updateWatchlist: jest.fn(),
    };
    const realDate = Date;
    global.Date = class extends realDate {
      constructor(...args) {
        if (args.length) super(...args);
        else super('2026-09-20T10:30:00Z');
      }
    };
    try {
      const res = await main({
        client,
        weekdaysOnly: true,
        force: true,
        dryRun: true,
        log: silent,
      });
      expect(res.skipped).toBeUndefined();
      expect(client.validateAuth).toHaveBeenCalled();
    } finally {
      global.Date = realDate;
    }
  });
});
