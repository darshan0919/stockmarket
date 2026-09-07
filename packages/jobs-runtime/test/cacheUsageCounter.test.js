'use strict';

const cacheUsageCounter = require('../lib/cacheUsageCounter');

describe('cacheUsageCounter (job-keyed, no shared "active job" global — mirrors apiUsageCounter/tokenUsageCounter)', () => {
  afterEach(() => {
    cacheUsageCounter.reset();
  });

  test('a falsy job is a silent no-op', () => {
    cacheUsageCounter.record(null, { name: 'extract-cache', hit: true });
    cacheUsageCounter.record(undefined, { name: 'extract-cache', hit: true });
    cacheUsageCounter.record('', { name: 'extract-cache', hit: true });
    expect(cacheUsageCounter.activeJobs()).toEqual([]);
  });

  test('accumulates hits/misses grouped by cache name, computing hitRate', () => {
    cacheUsageCounter.record('document-preprocessing', { name: 'extract-cache', hit: true });
    cacheUsageCounter.record('document-preprocessing', { name: 'extract-cache', hit: true });
    cacheUsageCounter.record('document-preprocessing', { name: 'extract-cache', hit: false });
    cacheUsageCounter.record('document-preprocessing', { name: 'baseline-cache', hit: true });

    const summary = cacheUsageCounter.getSummary('document-preprocessing');
    expect(summary.job).toBe('document-preprocessing');
    expect(summary.totalLookups).toBe(4);
    expect(summary.byCache['extract-cache']).toEqual({ hits: 2, misses: 1, hitRate: 0.6667 });
    expect(summary.byCache['baseline-cache']).toEqual({ hits: 1, misses: 0, hitRate: 1 });
    expect(summary.overallHitRate).toBe(0.75);
  });

  test('defaults a missing cache name to "other"', () => {
    cacheUsageCounter.record('some-job', { hit: true });
    expect(cacheUsageCounter.getSummary('some-job').byCache.other).toEqual({
      hits: 1,
      misses: 0,
      hitRate: 1,
    });
  });

  test('a job with zero recorded lookups reports null hitRate, not NaN or zero', () => {
    const summary = cacheUsageCounter.getSummary('untouched-job');
    expect(summary.totalLookups).toBe(0);
    expect(summary.overallHitRate).toBeNull();
  });

  test('two jobs recording concurrently never interfere with each other', () => {
    cacheUsageCounter.record('job-a', { name: 'extract-cache', hit: true });
    cacheUsageCounter.record('job-b', { name: 'baseline-cache', hit: false });
    cacheUsageCounter.record('job-a', { name: 'extract-cache', hit: false });

    const summaryA = cacheUsageCounter.getSummary('job-a');
    const summaryB = cacheUsageCounter.getSummary('job-b');
    expect(summaryA.totalLookups).toBe(2);
    expect(summaryB.totalLookups).toBe(1);
    expect(summaryA.byCache['baseline-cache']).toBeUndefined();
    expect(summaryB.byCache['extract-cache']).toBeUndefined();

    expect(cacheUsageCounter.activeJobs().sort()).toEqual(['job-a', 'job-b']);
  });
});
