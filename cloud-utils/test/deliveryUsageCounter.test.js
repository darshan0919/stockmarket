'use strict';

const deliveryUsageCounter = require('../src/deliveryUsageCounter');

describe('deliveryUsageCounter (job-keyed, no shared "active job" global — mirrors apiUsageCounter)', () => {
  afterEach(() => {
    deliveryUsageCounter.reset();
  });

  test('a falsy job is a silent no-op', () => {
    deliveryUsageCounter.record(null, { status: 'sent' });
    deliveryUsageCounter.record(undefined, { status: 'sent' });
    deliveryUsageCounter.record('', { status: 'sent' });
    expect(deliveryUsageCounter.activeJobs()).toEqual([]);
  });

  test('counts sent/skipped/error separately for the given job', () => {
    deliveryUsageCounter.record('daily-gainers-signal-stockmarket', { status: 'sent' });
    deliveryUsageCounter.record('daily-gainers-signal-stockmarket', { status: 'sent' });
    deliveryUsageCounter.record('daily-gainers-signal-stockmarket', {
      status: 'skipped',
      reason: 'GOOGLE_APP_PASSWORD not set',
    });

    const summary = deliveryUsageCounter.getSummary('daily-gainers-signal-stockmarket');
    expect(summary.job).toBe('daily-gainers-signal-stockmarket');
    expect(summary.sent).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(summary.error).toBe(0);
    expect(summary.total).toBe(3);
    expect(summary.bySkipReason).toEqual({ 'GOOGLE_APP_PASSWORD not set': 1 });
  });

  test('buckets repeated skip/error reasons into a count, not a list of strings', () => {
    deliveryUsageCounter.record('some-job', { status: 'skipped', reason: 'GOOGLE_APP_PASSWORD not set' });
    deliveryUsageCounter.record('some-job', { status: 'skipped', reason: 'GOOGLE_APP_PASSWORD not set' });
    deliveryUsageCounter.record('some-job', { status: 'error', reason: 'ECONNREFUSED' });

    const summary = deliveryUsageCounter.getSummary('some-job');
    expect(summary.bySkipReason).toEqual({
      'GOOGLE_APP_PASSWORD not set': 2,
      ECONNREFUSED: 1,
    });
  });

  test('a job with zero recorded outcomes reports all-zero counts', () => {
    const summary = deliveryUsageCounter.getSummary('untouched-job');
    expect(summary).toEqual({
      job: 'untouched-job',
      sent: 0,
      skipped: 0,
      error: 0,
      total: 0,
      bySkipReason: {},
    });
  });

  test('two jobs recording concurrently never interfere with each other', () => {
    deliveryUsageCounter.record('job-a', { status: 'sent' });
    deliveryUsageCounter.record('job-b', { status: 'error', reason: 'timeout' });
    deliveryUsageCounter.record('job-a', { status: 'sent' });

    const summaryA = deliveryUsageCounter.getSummary('job-a');
    const summaryB = deliveryUsageCounter.getSummary('job-b');
    expect(summaryA.sent).toBe(2);
    expect(summaryB.error).toBe(1);
    expect(summaryA.bySkipReason).toEqual({});
    expect(summaryB.bySkipReason).toEqual({ timeout: 1 });

    expect(deliveryUsageCounter.activeJobs().sort()).toEqual(['job-a', 'job-b']);
  });
});
