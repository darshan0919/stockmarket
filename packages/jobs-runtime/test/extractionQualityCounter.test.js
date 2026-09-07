'use strict';

const extractionQualityCounter = require('../lib/extractionQualityCounter');

describe('extractionQualityCounter (job-keyed, no shared "active job" global — mirrors apiUsageCounter)', () => {
  afterEach(() => {
    extractionQualityCounter.reset();
  });

  test('a falsy job is a silent no-op', () => {
    extractionQualityCounter.record(null, { profile: 'announcement', l1Status: 'pass', confidence: 'high' });
    expect(extractionQualityCounter.activeJobs()).toEqual([]);
  });

  test('accumulates pass/reject/confidence counts grouped by profile, computing rates', () => {
    const job = 'document-preprocessing';
    extractionQualityCounter.record(job, { profile: 'annual_report', l1Status: 'pass', confidence: 'high' });
    extractionQualityCounter.record(job, { profile: 'annual_report', l1Status: 'pass', confidence: 'high' });
    extractionQualityCounter.record(job, {
      profile: 'annual_report',
      l1Status: 'truncated_source',
      confidence: 'low',
    });
    extractionQualityCounter.record(job, { profile: 'annual_report', l1Status: 'fail', confidence: 'low' });

    const summary = extractionQualityCounter.getSummary(job);
    const ar = summary.byProfile.annual_report;
    expect(ar.total).toBe(4);
    expect(ar.pass).toBe(2);
    expect(ar.reject_truncated_source).toBe(1);
    expect(ar.reject_fail).toBe(1);
    expect(ar.confidence_high).toBe(2);
    expect(ar.confidence_low).toBe(2);
    expect(ar.passRate).toBe(0.5);
    expect(ar.truncatedSourceRate).toBe(0.25);
    expect(ar.confidenceLowRate).toBe(0.5);
  });

  test('separate profiles under the same job never mix', () => {
    const job = 'document-preprocessing';
    extractionQualityCounter.record(job, { profile: 'announcement', l1Status: 'pass', confidence: 'high' });
    extractionQualityCounter.record(job, { profile: 'ppt', l1Status: 'fail', confidence: 'low' });

    const summary = extractionQualityCounter.getSummary(job);
    expect(summary.byProfile.announcement.total).toBe(1);
    expect(summary.byProfile.ppt.total).toBe(1);
    expect(summary.byProfile.announcement.reject_fail).toBe(0);
  });

  test('an unrecognized l1Status is bucketed as other_l1_status, not silently dropped', () => {
    extractionQualityCounter.record('some-job', {
      profile: 'transcript',
      l1Status: 'no_quotes',
      confidence: 'low',
    });
    const summary = extractionQualityCounter.getSummary('some-job');
    expect(summary.byProfile.transcript.other_l1_status).toBe(1);
    expect(summary.byProfile.transcript.total).toBe(1);
  });

  test('two jobs recording concurrently never interfere with each other', () => {
    extractionQualityCounter.record('job-a', { profile: 'announcement', l1Status: 'pass', confidence: 'high' });
    extractionQualityCounter.record('job-b', { profile: 'result', l1Status: 'fail', confidence: 'low' });

    const summaryA = extractionQualityCounter.getSummary('job-a');
    const summaryB = extractionQualityCounter.getSummary('job-b');
    expect(summaryA.byProfile.result).toBeUndefined();
    expect(summaryB.byProfile.announcement).toBeUndefined();
    expect(extractionQualityCounter.activeJobs().sort()).toEqual(['job-a', 'job-b']);
  });
});
