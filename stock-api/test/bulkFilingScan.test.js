'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  expandQuarters,
  withBackoff,
  createPacer,
  runBulkScan,
  cleanupWatchlists,
  PAGE_SIZE,
} = require('../src/utils/bulkFilingScan.js');

const err = (status, headers = {}) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status, headers } });
const noSleep = async () => {};

function fakeClient({ pages, failFirst = 0, failWith = 429 }) {
  const calls = { scan: [], create: [], del: [] };
  let failed = 0;
  return {
    calls,
    baseUrl: 'x',
    async createWatchlist(name, ids) {
      calls.create.push({ name, n: ids.length });
      return { watchlistId: `wl${calls.create.length}` };
    },
    async deleteWatchlist(id) {
      calls.del.push(id);
      return {};
    },
    async scanAnnouncements(payload) {
      calls.scan.push(payload);
      if (failed < failFirst) {
        failed += 1;
        throw err(failWith);
      }
      const key = `${payload.scan.announcementType}|${payload.quarterDate}`;
      const all = pages[key] || [];
      return { announcements: all.slice(payload.offset, payload.offset + PAGE_SIZE) };
    },
  };
}

const mkRows = (n, pre = 'a') =>
  Array.from({ length: n }, (_, i) => ({
    companyId: `NSE:${pre}${i}`,
    title: 't',
    ssUrl: `${pre}${i}.pdf`,
    date: '2026-05-01',
  }));

describe('expandQuarters', () => {
  it('returns calendar quarter-ends newest first', () => {
    expect(expandQuarters('202509', '202606')).toEqual(['202606', '202603', '202512', '202509']);
  });
  it('rejects non quarter-end months', () => {
    expect(() => expandQuarters('202507', '202606')).toThrow();
  });
});

describe('withBackoff', () => {
  it('retries 429 with growing waits and honours Retry-After', async () => {
    const waits = [];
    let n = 0;
    const out = await withBackoff(
      async () => {
        n += 1;
        if (n === 1) throw err(429, { 'retry-after': '7' });
        if (n === 2) throw err(503);
        return 'ok';
      },
      { baseMs: 1000, sleep: async (ms) => waits.push(ms), random: () => 0 }
    );
    expect(out).toBe('ok');
    expect(waits[0]).toBe(7000);
    expect(waits[1]).toBe(1000); // exp=2000, random 0 -> half
  });
  it('does not retry a 400 and gives up after maxAttempts', async () => {
    let n = 0;
    await expect(
      withBackoff(
        async () => {
          n += 1;
          throw err(400);
        },
        { sleep: noSleep }
      )
    ).rejects.toThrow('400');
    expect(n).toBe(1);
    n = 0;
    await expect(
      withBackoff(
        async () => {
          n += 1;
          throw err(429);
        },
        { maxAttempts: 3, sleep: noSleep }
      )
    ).rejects.toMatchObject({ attempts: 3 });
    expect(n).toBe(3);
  });
  it('gives up instead of sleeping past the run budget', async () => {
    let n = 0;
    await expect(
      withBackoff(
        async () => {
          n += 1;
          throw err(429);
        },
        { sleep: noSleep, canWait: () => false }
      )
    ).rejects.toMatchObject({ attempts: 1 });
    expect(n).toBe(1);
  });
});

describe('createPacer', () => {
  it('doubles after 429 and recovers after a streak of successes', () => {
    const p = createPacer({ baseMs: 100, sleep: noSleep });
    p.hit429();
    expect(p.delayMs).toBe(200);
    for (let i = 0; i < 10; i++) p.success();
    expect(p.delayMs).toBe(150);
  });
});

describe('runBulkScan', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bfs-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const base = (client, extra = {}) => ({
    client,
    companyIds: ['NSE:A', 'NSE:B', 'NSE:C'],
    types: ['Financial Results'],
    quarters: ['202606'],
    outDir: dir,
    delayMs: 0,
    sleep: noSleep,
    backoff: { sleep: noSleep },
    ...extra,
  });

  it('pages until a short page, writes rows, always deletes the watchlist', async () => {
    const c = fakeClient({ pages: { 'Financial Results|202606': mkRows(65) } });
    const s = await runBulkScan(base(c));
    expect(s).toMatchObject({ rows: 65, unitsDone: 1, unitsTotal: 1, stopped: null });
    expect(c.calls.scan.map((x) => x.offset)).toEqual([0, 30, 60]);
    expect(c.calls.del).toEqual(['wl1']);
    expect(fs.readFileSync(path.join(dir, 'rows.jsonl'), 'utf8').trim().split('\n')).toHaveLength(
      65
    );
  });

  it('survives 429s via backoff and a re-run skips finished units without duplicating rows', async () => {
    const c = fakeClient({ pages: { 'Financial Results|202606': mkRows(10) }, failFirst: 2 });
    await runBulkScan(base(c));
    const c2 = fakeClient({ pages: { 'Financial Results|202606': mkRows(10) } });
    const s2 = await runBulkScan(base(c2));
    expect(s2.rows).toBe(0);
    expect(c2.calls.create).toHaveLength(0); // nothing pending -> no watchlist created
    expect(fs.readFileSync(path.join(dir, 'rows.jsonl'), 'utf8').trim().split('\n')).toHaveLength(
      10
    );
  });

  it('stops as blocked when backoff is exhausted, keeps state, still deletes the watchlist', async () => {
    const c = fakeClient({ pages: {}, failFirst: 99 });
    const s = await runBulkScan(base(c, { backoff: { maxAttempts: 2, sleep: noSleep } }));
    expect(s.stopped).toBe('blocked');
    expect(c.calls.del).toEqual(['wl1']);
    expect(fs.readFileSync(path.join(dir, 'errors.jsonl'), 'utf8')).toContain('429');
  });

  it('splits companies into several watchlists', async () => {
    const c = fakeClient({ pages: {} });
    await runBulkScan(base(c, { watchlistSize: 2 }));
    expect(c.calls.create.map((x) => x.n)).toEqual([2, 1]);
  });

  it('rejects unknown announcement types instead of silently scanning "All"', async () => {
    await expect(
      runBulkScan(base(fakeClient({ pages: {} }), { types: ['Investor Presentation'] }))
    ).rejects.toThrow('unknown announcementType');
  });

  it('cleanup deletes watchlists left in state by a crashed run', async () => {
    fs.writeFileSync(
      path.join(dir, 'state.json'),
      JSON.stringify({ watchlists: [{ id: 'old1' }], units: {} })
    );
    const c = fakeClient({ pages: {} });
    expect(await cleanupWatchlists(c, dir, { backoff: { sleep: noSleep } })).toBe(0);
    expect(c.calls.del).toEqual(['old1']);
  });
});
