'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpRoot;
let db;
let tracker;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v2db-deliveryusage-'));
  process.env.DATA_V2_DIR = tmpRoot;
  jest.resetModules();
  db = require('../lib/db');
  tracker = require('../lib/deliveryUsageTracker');
  tracker.reset();
});

afterEach(() => {
  tracker.reset();
  delete process.env.DATA_V2_DIR;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('deliveryUsageTracker.flush (job-level, explicit-argument attribution — mirrors apiUsageTracker/cacheUsageTracker)', () => {
  test('no-ops (returns null) when jobName is falsy', () => {
    expect(tracker.flush(null)).toBeNull();
    expect(tracker.flush()).toBeNull();
  });

  test('no-ops (returns null) when the job recorded zero send attempts', () => {
    expect(tracker.flush('daily-gainers-digest')).toBeNull();
  });

  test('persists a run summary as an events record with type delivery_summary, keyed by job', () => {
    tracker.record('daily-gainers-digest', { status: 'sent' });
    tracker.record('daily-gainers-digest', {
      status: 'skipped',
      reason: 'GOOGLE_APP_PASSWORD not set',
    });

    const stats = tracker.flush('daily-gainers-digest', { date: '2026-09-07' });
    expect(stats.inserted).toBe(1);

    const found = db
      .find('events', { type: 'delivery_summary', creator: 'daily-gainers-digest' })
      .filter((r) => r.job === 'daily-gainers-digest');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      creator: 'daily-gainers-digest',
      job: 'daily-gainers-digest',
      type: 'delivery_summary',
      date: '2026-09-07',
      sent: 1,
      skipped: 1,
      error: 0,
      total: 2,
      bySkipReason: { 'GOOGLE_APP_PASSWORD not set': 1 },
    });
    expect(found[0].id).toBeTruthy();
    expect(found[0].creationTime).toBeTruthy();
  });

  test('flush frees the in-memory bucket for that job (no double-counting on a second flush)', () => {
    tracker.record('weekly-gainers-digest', { status: 'sent' });
    tracker.flush('weekly-gainers-digest', { date: '2026-09-07' });
    expect(tracker.flush('weekly-gainers-digest', { date: '2026-09-07' })).toBeNull();
  });

  test('two jobs attribute separately, even recorded interleaved', () => {
    tracker.record('daily-gainers-digest', { status: 'sent' });
    tracker.record('near-highs-digest', { status: 'error', reason: 'timeout' });
    tracker.record('daily-gainers-digest', { status: 'sent' });

    tracker.flush('daily-gainers-digest', { date: '2026-09-07' });
    tracker.flush('near-highs-digest', { date: '2026-09-07' });

    const found = db.find('events', { type: 'delivery_summary' });
    expect(found).toHaveLength(2);
    const byJob = Object.fromEntries(found.map((r) => [r.job, r]));
    expect(byJob['daily-gainers-digest'].sent).toBe(2);
    expect(byJob['near-highs-digest'].error).toBe(1);
  });
});
