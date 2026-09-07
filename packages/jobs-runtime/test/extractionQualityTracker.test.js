'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpRoot;
let db;
let tracker;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v2db-extractionquality-'));
  process.env.DATA_V2_DIR = tmpRoot;
  jest.resetModules();
  db = require('../lib/db');
  tracker = require('../lib/extractionQualityTracker');
  tracker.reset();
});

afterEach(() => {
  tracker.reset();
  delete process.env.DATA_V2_DIR;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('extractionQualityTracker.flush (job-level, production-writes signal — mirrors cacheUsageTracker/deliveryUsageTracker)', () => {
  test('no-ops (returns null) when jobName is falsy', () => {
    expect(tracker.flush(null)).toBeNull();
    expect(tracker.flush()).toBeNull();
  });

  test('no-ops (returns null) when the job recorded zero extraction writes', () => {
    expect(tracker.flush('preprocess-annual-reports')).toBeNull();
  });

  test('persists a run summary as an events record with type calibration_summary, keyed by job, source production-writes', () => {
    tracker.record('preprocess-annual-reports', {
      profile: 'annual_report',
      l1Status: 'pass',
      confidence: 'high',
    });
    tracker.record('preprocess-annual-reports', {
      profile: 'annual_report',
      l1Status: 'fail',
      confidence: 'low',
    });

    const stats = tracker.flush('preprocess-annual-reports', { date: '2026-09-07' });
    expect(stats.inserted).toBe(1);

    const found = db
      .find('events', { type: 'calibration_summary', creator: 'preprocess-annual-reports' })
      .filter((r) => r.job === 'preprocess-annual-reports');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      creator: 'preprocess-annual-reports',
      job: 'preprocess-annual-reports',
      type: 'calibration_summary',
      source: 'production-writes',
      date: '2026-09-07',
    });
    expect(found[0].byProfile.annual_report).toMatchObject({
      pass: 1,
      reject_fail: 1,
      total: 2,
      passRate: 0.5,
    });
    expect(found[0].id).toBeTruthy();
    expect(found[0].creationTime).toBeTruthy();
  });

  test('flush frees the in-memory bucket for that job (no double-counting on a second flush)', () => {
    tracker.record('preprocess-transcripts', {
      profile: 'transcript',
      l1Status: 'pass',
      confidence: 'high',
    });
    tracker.flush('preprocess-transcripts', { date: '2026-09-07' });
    expect(tracker.flush('preprocess-transcripts', { date: '2026-09-07' })).toBeNull();
  });

  test('two jobs attribute separately, even recorded interleaved', () => {
    tracker.record('preprocess-annual-reports', {
      profile: 'annual_report',
      l1Status: 'pass',
      confidence: 'high',
    });
    tracker.record('preprocess-transcripts', {
      profile: 'transcript',
      l1Status: 'truncated_source',
      confidence: 'low',
    });
    tracker.record('preprocess-annual-reports', {
      profile: 'annual_report',
      l1Status: 'pass',
      confidence: 'high',
    });

    tracker.flush('preprocess-annual-reports', { date: '2026-09-07' });
    tracker.flush('preprocess-transcripts', { date: '2026-09-07' });

    const found = db.find('events', { type: 'calibration_summary' });
    expect(found).toHaveLength(2);
    const byJob = Object.fromEntries(found.map((r) => [r.job, r]));
    expect(byJob['preprocess-annual-reports'].byProfile.annual_report.pass).toBe(2);
    expect(byJob['preprocess-transcripts'].byProfile.transcript.reject_truncated_source).toBe(1);
  });
});
