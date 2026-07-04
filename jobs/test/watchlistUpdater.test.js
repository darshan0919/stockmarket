'use strict';

jest.mock('@stock/api', () => ({
  stockscans: { runScan: jest.fn(), watchlistTable: jest.fn(), updateWatchlist: jest.fn() },
}));

const {
  computeDiff,
  companyIdsFromTable,
  fetchAllCompanies,
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
    const t = [['name', 'companyId'], ['Foo', 'X'], ['Bar', 'Y']];
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
    const out = await fetchAllCompanies(stockscans, silent);
    expect(out).toHaveLength(120);
    expect(stockscans.runScan).toHaveBeenCalledTimes(3);
    expect(stockscans.runScan.mock.calls.map((c) => c[0].offset)).toEqual([0, 50, 100]);
  });

  test('stops on a short final page', async () => {
    const { stockscans } = require('@stock/api');
    stockscans.runScan.mockReset();
    stockscans.runScan.mockResolvedValueOnce({ total: 999, table: table(['A', 'B']) });
    const out = await fetchAllCompanies(stockscans, silent);
    expect(out).toEqual(['A', 'B']);
    expect(stockscans.runScan).toHaveBeenCalledTimes(1);
  });
});

describe('main --dry-run', () => {
  test('computes diff, excludes Radar, and does NOT mutate the watchlist', async () => {
    const client = {
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
