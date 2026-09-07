'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpRoot;
let docExtracts;
let extractionQualityCounter;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v2db-docextracts-quality-'));
  process.env.DATA_V2_DIR = tmpRoot;
  process.env.STOCKMARKET_JOB_NAME = 'preprocess-annual-reports';
  jest.resetModules();
  docExtracts = require('../lib/docExtracts');
  extractionQualityCounter = require('../lib/extractionQualityCounter');
  extractionQualityCounter.reset();
});

afterEach(() => {
  extractionQualityCounter.reset();
  delete process.env.DATA_V2_DIR;
  delete process.env.STOCKMARKET_JOB_NAME;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('docExtracts.put() — extraction-quality recording (conventions.md §25)', () => {
  test('records a passing, high-confidence extract under the resolved job and profile', () => {
    docExtracts.put('annual_report', 'https://x/report.pdf', {
      data: { revenue: '100' },
      confidence: 'high',
      verification: { l1: { status: 'pass', checked: 1 } },
    });

    const summary = extractionQualityCounter.getSummary('preprocess-annual-reports');
    expect(summary.byProfile.annual_report).toMatchObject({
      pass: 1,
      reject_fail: 0,
      reject_truncated_source: 0,
      confidence_high: 1,
      confidence_low: 0,
      total: 1,
    });
  });

  test('records a rejected (fail) extract, still counted even though it is stored under _rejected/', () => {
    docExtracts.put('transcript', 'https://x/call.pdf', {
      data: { summary: 'made up quote' },
      confidence: 'low',
      verification: { l1: { status: 'fail', checked: 1 } },
    });

    const summary = extractionQualityCounter.getSummary('preprocess-annual-reports');
    expect(summary.byProfile.transcript).toMatchObject({
      reject_fail: 1,
      confidence_low: 1,
      total: 1,
    });
  });

  test('records a truncated_source rejection distinctly from a fail', () => {
    docExtracts.put('annual_report', 'https://x/big-report.pdf', {
      data: {},
      confidence: 'low',
      verification: { l1: { status: 'truncated_source', reason: 'source text not cached' } },
    });

    const summary = extractionQualityCounter.getSummary('preprocess-annual-reports');
    expect(summary.byProfile.annual_report).toMatchObject({
      reject_truncated_source: 1,
      pass: 0,
      reject_fail: 0,
      total: 1,
    });
  });

  test('attributes to whatever job is resolved at call time (STOCKMARKET_JOB_NAME), not a hardcoded name', () => {
    process.env.STOCKMARKET_JOB_NAME = 'preprocess-transcripts';
    jest.resetModules();
    docExtracts = require('../lib/docExtracts');
    extractionQualityCounter = require('../lib/extractionQualityCounter');
    extractionQualityCounter.reset();

    docExtracts.put('transcript', 'https://x/call2.pdf', {
      data: {},
      confidence: 'high',
      verification: { l1: { status: 'pass', checked: 2 } },
    });

    expect(extractionQualityCounter.getSummary('preprocess-transcripts').byProfile.transcript.pass).toBe(1);
    expect(Object.keys(extractionQualityCounter.getSummary('preprocess-annual-reports').byProfile)).toHaveLength(0);
  });
});
