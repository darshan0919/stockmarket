'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpRoot;
let db;
let tracker;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v2db-apiusage-'));
  process.env.DATA_V2_DIR = tmpRoot;
  jest.resetModules();
  db = require('../lib/db');
  tracker = require('../lib/apiUsageTracker');
  tracker.reset();
});

afterEach(() => {
  tracker.reset();
  delete process.env.DATA_V2_DIR;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('apiUsageTracker.flush (job-level, explicit-argument attribution — no shared global)', () => {
  test('no-ops (returns null) when jobName is falsy', () => {
    expect(tracker.flush(null)).toBeNull();
    expect(tracker.flush()).toBeNull();
  });

  test('no-ops (returns null) when the job made zero calls', () => {
    expect(tracker.flush('daily-gainers-signal-stockmarket')).toBeNull();
  });

  test('persists a run summary as an events record with type api_usage_summary, keyed by job', () => {
    tracker.record('daily-gainers-signal-stockmarket', { api: 'stockscans', ok: true });
    tracker.record('daily-gainers-signal-stockmarket', { api: 'stockscans', ok: true });
    tracker.record('daily-gainers-signal-stockmarket', { api: 'nse', ok: false });

    const stats = tracker.flush('daily-gainers-signal-stockmarket', { date: '2026-08-15' });
    expect(stats.inserted).toBe(1);

    const found = db.find('events', (r) => r.type === 'api_usage_summary');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      creator: 'daily-gainers-signal-stockmarket',
      job: 'daily-gainers-signal-stockmarket',
      type: 'api_usage_summary',
      date: '2026-08-15',
      totalCalls: 3,
      byApi: {
        stockscans: { count: 2, ok: 2, failed: 0 },
        nse: { count: 1, ok: 0, failed: 1 },
      },
    });
    // No `skill` field — attribution is job-only now.
    expect(found[0].skill).toBeUndefined();
    // Envelope fields set by db.js (DATA_RULES §4).
    expect(found[0].id).toBeTruthy();
    expect(found[0].creationTime).toBeTruthy();
  });

  test('flush frees the in-memory bucket for that job (no double-counting on a second flush)', () => {
    tracker.record('daily-gainers-signal-stockmarket', { api: 'stockscans', ok: true });
    tracker.flush('daily-gainers-signal-stockmarket', { date: '2026-08-15' });
    // A second flush with nothing new recorded finds nothing to persist.
    expect(tracker.flush('daily-gainers-signal-stockmarket', { date: '2026-08-15' })).toBeNull();
  });

  test('two jobs sharing the same underlying script attribute separately, even recorded interleaved', () => {
    // Regression case for the bug job-level, non-global attribution fixes: a
    // shared script (e.g. watchlistInsights.js) invoked by two different
    // scheduled jobs — or two concurrent async runs in one process — must
    // never merge or mis-attribute their counts.
    tracker.record('watchlist-daily-insights-stockmarket', { api: 'stockscans', ok: true });
    tracker.record('daily-deals-digest', { api: 'nse', ok: true });
    tracker.record('watchlist-daily-insights-stockmarket', { api: 'stockscans', ok: true });

    tracker.flush('watchlist-daily-insights-stockmarket', { date: '2026-08-15' });
    tracker.flush('daily-deals-digest', { date: '2026-08-15' });

    const found = db.find('events', (r) => r.type === 'api_usage_summary');
    expect(found).toHaveLength(2);
    const byJob = Object.fromEntries(found.map((r) => [r.job, r]));
    expect(byJob['watchlist-daily-insights-stockmarket'].totalCalls).toBe(2);
    expect(byJob['daily-deals-digest'].totalCalls).toBe(1);
  });
});
