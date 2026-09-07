'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpRoot;
let db;
let tracker;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v2db-cacheusage-'));
  process.env.DATA_V2_DIR = tmpRoot;
  jest.resetModules();
  db = require('../lib/db');
  tracker = require('../lib/cacheUsageTracker');
  tracker.reset();
});

afterEach(() => {
  tracker.reset();
  delete process.env.DATA_V2_DIR;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('cacheUsageTracker.flush (job-level, explicit-argument attribution — mirrors apiUsageTracker/tokenUsageTracker)', () => {
  test('no-ops (returns null) when jobName is falsy', () => {
    expect(tracker.flush(null)).toBeNull();
    expect(tracker.flush()).toBeNull();
  });

  test('no-ops (returns null) when the job recorded zero lookups', () => {
    expect(tracker.flush('document-preprocessing')).toBeNull();
  });

  test('persists a run summary as an events record with type cache_usage_summary, keyed by job', () => {
    tracker.record('document-preprocessing', { name: 'extract-cache', hit: true });
    tracker.record('document-preprocessing', { name: 'extract-cache', hit: true });
    tracker.record('document-preprocessing', { name: 'extract-cache', hit: false });

    const stats = tracker.flush('document-preprocessing', { date: '2026-09-07' });
    expect(stats.inserted).toBe(1);

    const found = db
      .find('events', { type: 'cache_usage_summary', creator: 'document-preprocessing' })
      .filter((r) => r.job === 'document-preprocessing');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      creator: 'document-preprocessing',
      job: 'document-preprocessing',
      type: 'cache_usage_summary',
      date: '2026-09-07',
      totalLookups: 3,
      overallHitRate: 0.6667,
      byCache: {
        'extract-cache': { hits: 2, misses: 1, hitRate: 0.6667 },
      },
    });
    expect(found[0].id).toBeTruthy();
    expect(found[0].creationTime).toBeTruthy();
  });

  test('flush frees the in-memory bucket for that job (no double-counting on a second flush)', () => {
    tracker.record('gainers-scanner', { name: 'extract-cache', hit: true });
    tracker.flush('gainers-scanner', { date: '2026-09-07' });
    expect(tracker.flush('gainers-scanner', { date: '2026-09-07' })).toBeNull();
  });

  test('two jobs attribute separately, even recorded interleaved', () => {
    tracker.record('document-preprocessing', { name: 'extract-cache', hit: true });
    tracker.record('gainers-scanner', { name: 'extract-cache', hit: false });
    tracker.record('document-preprocessing', { name: 'extract-cache', hit: true });

    tracker.flush('document-preprocessing', { date: '2026-09-07' });
    tracker.flush('gainers-scanner', { date: '2026-09-07' });

    const found = db.find('events', { type: 'cache_usage_summary' });
    expect(found).toHaveLength(2);
    const byJob = Object.fromEntries(found.map((r) => [r.job, r]));
    expect(byJob['document-preprocessing'].totalLookups).toBe(2);
    expect(byJob['document-preprocessing'].overallHitRate).toBe(1);
    expect(byJob['gainers-scanner'].totalLookups).toBe(1);
    expect(byJob['gainers-scanner'].overallHitRate).toBe(0);
  });
});
