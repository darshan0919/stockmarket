'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpRoot;
let dbV2;
let ttl;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gainers-ttl-'));
  process.env.DATA_V2_DIR = tmpRoot;
  jest.resetModules();
  dbV2 = require('../lib/db');
  ttl = require('../lib/gainersWatchlistTtl');
});

afterEach(() => {
  delete process.env.DATA_V2_DIR;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function fakeClient(initialWatchlistName = 'Daily Gainers', initialId = 'wl1') {
  const calls = [];
  const members = new Set();
  return {
    calls,
    members,
    async watchlistsList() {
      return { watchlists: [{ watchlistId: initialId, watchlistName: initialWatchlistName }] };
    },
    async createWatchlist(name) {
      calls.push({ fn: 'createWatchlist', name });
      return { watchlistId: 'created-wl', watchlistName: name, companyIds: [] };
    },
    async updateWatchlist(watchlistId, action, companyIds) {
      calls.push({ fn: 'updateWatchlist', watchlistId, action, companyIds });
      for (const id of companyIds) {
        if (action === 'add') members.add(id);
        else members.delete(id);
      }
    },
  };
}

describe('syncGainersWatchlist — TTL + reset semantics', () => {
  test('day 1: new qualifiers are added and tracked as active', async () => {
    const client = fakeClient();
    const r = await ttl.syncGainersWatchlist(['NSE:AAA', 'NSE:BBB'], {
      marketDate: new Date('2026-09-01T00:00:00Z'),
      client,
      creator: 'test',
    });
    expect(r.added.sort()).toEqual(['NSE:AAA', 'NSE:BBB']);
    expect(r.removed).toEqual([]);
    expect(r.activeAfter).toBe(2);
    expect(client.members.has('NSE:AAA')).toBe(true);
    expect(client.members.has('NSE:BBB')).toBe(true);
  });

  test('reappearing while still active does NOT reset addedDate', async () => {
    const client = fakeClient();
    await ttl.syncGainersWatchlist(['NSE:AAA'], {
      marketDate: new Date('2026-09-01T00:00:00Z'),
      client,
      creator: 'test',
    });
    await ttl.syncGainersWatchlist(['NSE:AAA'], {
      marketDate: new Date('2026-09-05T00:00:00Z'),
      client,
      creator: 'test',
    });
    const rec = dbV2.get('companies', 'NSE:AAA');
    expect(rec.state.gainersWatchlistTtl.addedDate).toBe('2026-09-01');
    expect(rec.state.gainersWatchlistTtl.lastSeenDate).toBe('2026-09-05');
  });

  test('expires (removed from watchlist) at exactly 10 days since addedDate, not before', async () => {
    const client = fakeClient();
    await ttl.syncGainersWatchlist(['NSE:AAA'], {
      marketDate: new Date('2026-09-01T00:00:00Z'),
      client,
      creator: 'test',
    });

    // Day 9 since add (2026-09-10) — must NOT be removed yet.
    let r = await ttl.syncGainersWatchlist([], {
      marketDate: new Date('2026-09-10T00:00:00Z'),
      client,
      creator: 'test',
    });
    expect(r.removed).toEqual([]);
    expect(client.members.has('NSE:AAA')).toBe(true);

    // Day 10 since add (2026-09-11) — must be removed.
    r = await ttl.syncGainersWatchlist([], {
      marketDate: new Date('2026-09-11T00:00:00Z'),
      client,
      creator: 'test',
    });
    expect(r.removed).toEqual(['NSE:AAA']);
    expect(client.members.has('NSE:AAA')).toBe(false);

    const rec = dbV2.get('companies', 'NSE:AAA');
    expect(rec.state.gainersWatchlistTtl.active).toBe(false);
    expect(rec.state.gainersWatchlistTtl.removedDate).toBe('2026-09-11');
  });

  test('reappearing AFTER expiry resets addedDate to today and re-adds to the watchlist', async () => {
    const client = fakeClient();
    await ttl.syncGainersWatchlist(['NSE:AAA'], {
      marketDate: new Date('2026-09-01T00:00:00Z'),
      client,
      creator: 'test',
    });
    await ttl.syncGainersWatchlist([], {
      marketDate: new Date('2026-09-11T00:00:00Z'),
      client,
      creator: 'test',
    }); // expires
    expect(client.members.has('NSE:AAA')).toBe(false);

    const r = await ttl.syncGainersWatchlist(['NSE:AAA'], {
      marketDate: new Date('2026-09-20T00:00:00Z'),
      client,
      creator: 'test',
    });
    expect(r.added).toEqual(['NSE:AAA']);
    expect(client.members.has('NSE:AAA')).toBe(true);

    const rec = dbV2.get('companies', 'NSE:AAA');
    expect(rec.state.gainersWatchlistTtl.addedDate).toBe('2026-09-20'); // reset, not 2026-09-01
    expect(rec.state.gainersWatchlistTtl.active).toBe(true);
  });

  test('never clobbers a sibling skill’s state key on the same company record', async () => {
    // Seed a company record with unrelated state from a different skill first.
    dbV2.upsertMany('companies', [
      {
        id: 'NSE:AAA',
        creator: 'some-other-skill',
        state: { someOtherSkill: { foo: 'bar', count: 42 } },
      },
    ]);

    const client = fakeClient();
    await ttl.syncGainersWatchlist(['NSE:AAA'], {
      marketDate: new Date('2026-09-01T00:00:00Z'),
      client,
      creator: 'test',
    });

    const rec = dbV2.get('companies', 'NSE:AAA');
    expect(rec.state.someOtherSkill).toEqual({ foo: 'bar', count: 42 });
    expect(rec.state.gainersWatchlistTtl.active).toBe(true);
  });

  test('resolveWatchlistId finds an existing "Daily Gainers" watchlist rather than creating a duplicate', async () => {
    const client = fakeClient('Daily Gainers', 'existing-wl-id');
    const id = await ttl.resolveWatchlistId(client);
    expect(id).toBe('existing-wl-id');
    expect(client.calls.some((c) => c.fn === 'createWatchlist')).toBe(false);
  });

  test('resolveWatchlistId creates the watchlist when none exists', async () => {
    const client = fakeClient('Some Other List', 'other-id');
    const id = await ttl.resolveWatchlistId(client);
    expect(id).toBe('created-wl');
    expect(client.calls.some((c) => c.fn === 'createWatchlist')).toBe(true);
  });

  test('an untouched, still-active, unexpired company gets no write (no modifiedTime churn)', async () => {
    const client = fakeClient();
    await ttl.syncGainersWatchlist(['NSE:AAA', 'NSE:BBB'], {
      marketDate: new Date('2026-09-01T00:00:00Z'),
      client,
      creator: 'test',
    });
    const before = dbV2.get('companies', 'NSE:BBB').modifiedTime;

    // BBB doesn't qualify today and isn't expired yet — must not be touched.
    await ttl.syncGainersWatchlist(['NSE:AAA'], {
      marketDate: new Date('2026-09-03T00:00:00Z'),
      client,
      creator: 'test',
    });
    const after = dbV2.get('companies', 'NSE:BBB').modifiedTime;
    expect(after).toBe(before);
  });
});

describe('daysBetween / toDateStr', () => {
  test('daysBetween counts calendar days', () => {
    expect(ttl.daysBetween('2026-09-01', '2026-09-11')).toBe(10);
    expect(ttl.daysBetween('2026-09-01', '2026-09-01')).toBe(0);
  });

  test('toDateStr handles both Date objects and date strings', () => {
    expect(ttl.toDateStr(new Date('2026-09-01T12:34:56Z'))).toBe('2026-09-01');
    expect(ttl.toDateStr('2026-09-01T00:00:00.000Z')).toBe('2026-09-01');
  });
});
