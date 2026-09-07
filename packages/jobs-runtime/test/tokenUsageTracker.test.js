'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpRoot;
let db;
let tracker;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v2db-tokenusage-'));
  process.env.DATA_V2_DIR = tmpRoot;
  jest.resetModules();
  db = require('../lib/db');
  tracker = require('../lib/tokenUsageTracker');
  tracker.reset();
});

afterEach(() => {
  tracker.reset();
  delete process.env.DATA_V2_DIR;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('tokenUsageTracker.flush (job-level, explicit-argument attribution — mirrors apiUsageTracker)', () => {
  test('no-ops (returns null) when jobName is falsy', () => {
    expect(tracker.flush(null)).toBeNull();
    expect(tracker.flush()).toBeNull();
  });

  test('no-ops (returns null) when the job recorded zero tokens', () => {
    expect(tracker.flush('daily-gainers-signal-stockmarket')).toBeNull();
  });

  test('persists a run summary as an events record with type token_usage_summary, keyed by job', () => {
    tracker.record('watchlist-daily-insights-stockmarket', {
      model: 'claude-sonnet-5',
      inputTokens: 5000,
      outputTokens: 800,
    });
    tracker.record('watchlist-daily-insights-stockmarket', {
      model: 'claude-sonnet-5',
      inputTokens: 1000,
      outputTokens: 200,
    });

    const stats = tracker.flush('watchlist-daily-insights-stockmarket', {
      date: '2026-09-06',
      note: 'self-reported from session usage signal',
    });
    expect(stats.inserted).toBe(1);

    const found = db.find('events', (r) => r.type === 'token_usage_summary');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      creator: 'watchlist-daily-insights-stockmarket',
      job: 'watchlist-daily-insights-stockmarket',
      type: 'token_usage_summary',
      date: '2026-09-06',
      totalTokens: 7000,
      byModel: {
        'claude-sonnet-5': { calls: 2, inputTokens: 6000, outputTokens: 1000 },
      },
      note: 'self-reported from session usage signal',
    });
    expect(found[0].id).toBeTruthy();
    expect(found[0].creationTime).toBeTruthy();
  });

  // NOTE: db.find(collection, filter)'s `filter` is a plain object
  // ({type, creator, date, companyId, since, sort, limit} — see lib/db.js's
  // `find()`), NOT a predicate function. Passing a function silently no-ops
  // (every filter.* property access on a function is undefined) and returns
  // every record in the collection, unsorted-by-relevance — a latent bug
  // this test file's own earlier tests happened not to expose because each
  // ran against a fresh store with only one matching record. Filter by the
  // supported `creator` key instead (this tracker always sets creator ===
  // job, per flush()'s eventRecord) and narrow further in JS when needed.
  test('persists an optional durationMs when provided, omits the field when not', () => {
    tracker.record('mna-tracker', { inputTokens: 100, outputTokens: 20 });
    tracker.flush('mna-tracker', { date: '2026-09-07', durationMs: 45000 });
    let found = db
      .find('events', { type: 'token_usage_summary', creator: 'mna-tracker' })
      .filter((r) => r.job === 'mna-tracker');
    expect(found[0].durationMs).toBe(45000);

    tracker.record('order-book-digest', { inputTokens: 50, outputTokens: 10 });
    tracker.flush('order-book-digest', { date: '2026-09-07' });
    found = db
      .find('events', { type: 'token_usage_summary', creator: 'order-book-digest' })
      .filter((r) => r.job === 'order-book-digest');
    expect(found[0].durationMs).toBeUndefined();
  });

  test('ignores a negative or non-finite durationMs rather than persisting garbage', () => {
    tracker.record('bad-duration-job', { inputTokens: 10, outputTokens: 5 });
    tracker.flush('bad-duration-job', { date: '2026-09-07', durationMs: -5 });
    const found = db
      .find('events', { type: 'token_usage_summary', creator: 'bad-duration-job' })
      .filter((r) => r.job === 'bad-duration-job');
    expect(found[0].durationMs).toBeUndefined();
  });

  test('flush frees the in-memory bucket for that job (no double-counting on a second flush)', () => {
    tracker.record('daily-gainers-signal-stockmarket', { inputTokens: 100, outputTokens: 20 });
    tracker.flush('daily-gainers-signal-stockmarket', { date: '2026-09-06' });
    expect(tracker.flush('daily-gainers-signal-stockmarket', { date: '2026-09-06' })).toBeNull();
  });

  test('two jobs attribute separately, even recorded interleaved', () => {
    tracker.record('watchlist-daily-insights-stockmarket', { inputTokens: 100, outputTokens: 10 });
    tracker.record('daily-deals-digest', { inputTokens: 50, outputTokens: 5 });
    tracker.record('watchlist-daily-insights-stockmarket', { inputTokens: 200, outputTokens: 20 });

    tracker.flush('watchlist-daily-insights-stockmarket', { date: '2026-09-06' });
    tracker.flush('daily-deals-digest', { date: '2026-09-06' });

    const found = db.find('events', (r) => r.type === 'token_usage_summary');
    expect(found).toHaveLength(2);
    const byJob = Object.fromEntries(found.map((r) => [r.job, r]));
    expect(byJob['watchlist-daily-insights-stockmarket'].totalTokens).toBe(330);
    expect(byJob['daily-deals-digest'].totalTokens).toBe(55);
  });
});
