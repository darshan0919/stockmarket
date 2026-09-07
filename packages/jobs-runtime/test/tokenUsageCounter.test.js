'use strict';

const tokenUsageCounter = require('../lib/tokenUsageCounter');

describe('tokenUsageCounter (job-keyed, no shared "active job" global — mirrors apiUsageCounter)', () => {
  afterEach(() => {
    tokenUsageCounter.reset();
  });

  test('a falsy job is a silent no-op', () => {
    tokenUsageCounter.record(null, { model: 'claude-sonnet-5', inputTokens: 100 });
    tokenUsageCounter.record(undefined, { model: 'claude-sonnet-5', inputTokens: 100 });
    tokenUsageCounter.record('', { model: 'claude-sonnet-5', inputTokens: 100 });
    expect(tokenUsageCounter.activeJobs()).toEqual([]);
  });

  test('refuses to record negative token counts by clamping to zero', () => {
    tokenUsageCounter.record('some-job', { inputTokens: -50, outputTokens: -1 });
    const summary = tokenUsageCounter.getSummary('some-job');
    expect(summary.byModel['agent-session']).toEqual({ calls: 1, inputTokens: 0, outputTokens: 0 });
  });

  test('accumulates calls grouped by model, for the given job', () => {
    tokenUsageCounter.record('watchlist-daily-insights-stockmarket', {
      model: 'claude-sonnet-5',
      inputTokens: 1000,
      outputTokens: 200,
    });
    tokenUsageCounter.record('watchlist-daily-insights-stockmarket', {
      model: 'claude-sonnet-5',
      inputTokens: 500,
      outputTokens: 100,
    });
    tokenUsageCounter.record('watchlist-daily-insights-stockmarket', {
      model: 'claude-haiku-5',
      inputTokens: 2000,
      outputTokens: 50,
    });

    const summary = tokenUsageCounter.getSummary('watchlist-daily-insights-stockmarket');
    expect(summary.job).toBe('watchlist-daily-insights-stockmarket');
    expect(summary.totalTokens).toBe(1000 + 200 + 500 + 100 + 2000 + 50);
    expect(summary.byModel['claude-sonnet-5']).toEqual({
      calls: 2,
      inputTokens: 1500,
      outputTokens: 300,
    });
    expect(summary.byModel['claude-haiku-5']).toEqual({ calls: 1, inputTokens: 2000, outputTokens: 50 });
  });

  test('defaults a missing model label to "agent-session"', () => {
    tokenUsageCounter.record('some-job', { inputTokens: 10, outputTokens: 5 });
    expect(tokenUsageCounter.getSummary('some-job').byModel['agent-session']).toEqual({
      calls: 1,
      inputTokens: 10,
      outputTokens: 5,
    });
  });

  test('two jobs recording concurrently in the same process never interfere with each other', () => {
    // Regression test for the same bug class apiUsageCounter guards against:
    // interleaved record() calls for two different jobs must land in two
    // separate buckets, never merge or clobber.
    tokenUsageCounter.record('job-a', { model: 'claude-sonnet-5', inputTokens: 100, outputTokens: 10 });
    tokenUsageCounter.record('job-b', { model: 'claude-haiku-5', inputTokens: 50, outputTokens: 5 });
    tokenUsageCounter.record('job-a', { model: 'claude-sonnet-5', inputTokens: 200, outputTokens: 20 });

    const summaryA = tokenUsageCounter.getSummary('job-a');
    const summaryB = tokenUsageCounter.getSummary('job-b');
    expect(summaryA.totalTokens).toBe(330);
    expect(summaryB.totalTokens).toBe(55);
    expect(summaryA.byModel['claude-haiku-5']).toBeUndefined();
    expect(summaryB.byModel['claude-sonnet-5']).toBeUndefined();

    expect(tokenUsageCounter.activeJobs().sort()).toEqual(['job-a', 'job-b']);
  });

  test('resetJob clears only the named job', () => {
    tokenUsageCounter.record('job-a', { inputTokens: 10 });
    tokenUsageCounter.record('job-b', { inputTokens: 20 });
    tokenUsageCounter.resetJob('job-a');
    expect(tokenUsageCounter.activeJobs()).toEqual(['job-b']);
  });
});
