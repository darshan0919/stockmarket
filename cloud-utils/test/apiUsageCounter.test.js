'use strict';

const apiUsageCounter = require('../src/apiUsageCounter');

describe('apiUsageCounter (job-keyed, no shared "active job" global)', () => {
  afterEach(() => {
    apiUsageCounter.reset();
  });

  test('a falsy job is a silent no-op', () => {
    apiUsageCounter.record(null, { api: 'stockscans', ok: true });
    apiUsageCounter.record(undefined, { api: 'stockscans', ok: true });
    apiUsageCounter.record('', { api: 'stockscans', ok: true });
    expect(apiUsageCounter.activeJobs()).toEqual([]);
  });

  test('counts calls grouped by api, with ok/failed split, for the given job', () => {
    apiUsageCounter.record('daily-gainers-signal-stockmarket', { api: 'stockscans', ok: true });
    apiUsageCounter.record('daily-gainers-signal-stockmarket', { api: 'stockscans', ok: true });
    apiUsageCounter.record('daily-gainers-signal-stockmarket', { api: 'stockscans', ok: false });
    apiUsageCounter.record('daily-gainers-signal-stockmarket', { api: 'nse', ok: true });

    const summary = apiUsageCounter.getSummary('daily-gainers-signal-stockmarket');
    expect(summary.job).toBe('daily-gainers-signal-stockmarket');
    expect(summary.total).toBe(4);
    expect(summary.byApi.stockscans).toEqual({ count: 3, ok: 2, failed: 1 });
    expect(summary.byApi.nse).toEqual({ count: 1, ok: 1, failed: 0 });
  });

  test('defaults a missing api label to "other"', () => {
    apiUsageCounter.record('some-job', { ok: true });
    expect(apiUsageCounter.getSummary('some-job').byApi.other).toEqual({
      count: 1,
      ok: 1,
      failed: 0,
    });
  });

  test('two jobs recording concurrently in the same process never interfere with each other', () => {
    // Regression test for the bug this design fixes: interleaved record() calls
    // for two different jobs (as would happen if two async runs overlapped in
    // one process) must land in two separate buckets, never merge or clobber.
    apiUsageCounter.record('job-a', { api: 'stockscans', ok: true });
    apiUsageCounter.record('job-b', { api: 'nse', ok: true });
    apiUsageCounter.record('job-a', { api: 'stockscans', ok: true });
    apiUsageCounter.record('job-b', { api: 'nse', ok: false });
    apiUsageCounter.record('job-a', { api: 'screener', ok: true });

    const summaryA = apiUsageCounter.getSummary('job-a');
    const summaryB = apiUsageCounter.getSummary('job-b');
    expect(summaryA.total).toBe(3);
    expect(summaryA.byApi.stockscans.count).toBe(2);
    expect(summaryA.byApi.screener.count).toBe(1);
    expect(summaryA.byApi.nse).toBeUndefined();

    expect(summaryB.total).toBe(2);
    expect(summaryB.byApi.nse).toEqual({ count: 2, ok: 1, failed: 1 });
    expect(summaryB.byApi.stockscans).toBeUndefined();

    expect(apiUsageCounter.activeJobs().sort()).toEqual(['job-a', 'job-b']);
  });

  test('getSummary for a job with no recorded calls returns an empty summary, not an error', () => {
    expect(apiUsageCounter.getSummary('never-ran')).toEqual({
      job: 'never-ran',
      byApi: {},
      total: 0,
    });
  });

  test('resetJob clears only that job, leaving others untouched', () => {
    apiUsageCounter.record('job-a', { api: 'stockscans', ok: true });
    apiUsageCounter.record('job-b', { api: 'nse', ok: true });
    apiUsageCounter.resetJob('job-a');
    expect(apiUsageCounter.totalCalls('job-a')).toBe(0);
    expect(apiUsageCounter.totalCalls('job-b')).toBe(1);
  });

  test('reset clears every job', () => {
    apiUsageCounter.record('job-a', { api: 'stockscans', ok: true });
    apiUsageCounter.record('job-b', { api: 'nse', ok: true });
    apiUsageCounter.reset();
    expect(apiUsageCounter.activeJobs()).toEqual([]);
  });
});
