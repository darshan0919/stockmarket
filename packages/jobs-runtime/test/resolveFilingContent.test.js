'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpRoot;
let docExtracts;
let buildBaselines;
let resolveFilingContent;
let cacheUsageCounter;

function putExtract(profile, sourceUrl, data) {
  return docExtracts.put(profile, sourceUrl, {
    data,
    verification: { l1: { status: 'pass' } },
  });
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'resolveFilingContent-'));
  process.env.DATA_V2_DIR = tmpRoot;
  // Make sure both profiles used below are SERVED, not shadow, regardless of
  // whatever .env this repo checkout happens to have on disk.
  process.env.PREPROCESS_PROFILES = 'announcement,annual_report';
  process.env.PREPROCESS_SHADOW_PROFILES = '';
  jest.resetModules();
  docExtracts = require('../lib/docExtracts');
  buildBaselines = require('../buildBaselines');
  ({ resolveFilingContent } = require('../lib/resolveFilingContent'));
  cacheUsageCounter = require('../lib/cacheUsageCounter');
  cacheUsageCounter.reset();
  process.env.STOCKMARKET_JOB_NAME = 'test-job';
});

afterEach(() => {
  cacheUsageCounter.reset();
  delete process.env.STOCKMARKET_JOB_NAME;
  delete process.env.DATA_V2_DIR;
  delete process.env.PREPROCESS_PROFILES;
  delete process.env.PREPROCESS_SHADOW_PROFILES;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('resolveFilingContent — Tier 1 (sourceUrl + profile)', () => {
  test('miss when nothing has been extracted for this document', () => {
    const r = resolveFilingContent({ sourceUrl: 'https://x/never-seen.pdf', profile: 'announcement' });
    expect(r).toEqual({
      source: 'miss',
      reason: 'not-yet-extracted',
      sourceUrl: 'https://x/never-seen.pdf',
      profile: 'announcement',
    });
  });

  test('hit returns the stored data and extractedAt, never the whole record', () => {
    putExtract('announcement', 'https://x/a.pdf', { category_hint: 'order_win' });
    const r = resolveFilingContent({ sourceUrl: 'https://x/a.pdf', profile: 'announcement' });
    expect(r.source).toBe('extract-cache');
    expect(r.data).toEqual({ category_hint: 'order_win' });
    expect(typeof r.extractedAt).toBe('string');
    // Never leaks verification/schemaVersion internals into the caller's data.
    expect(r.data.verification).toBeUndefined();
  });

  test('throws when profile is omitted alongside sourceUrl', () => {
    expect(() => resolveFilingContent({ sourceUrl: 'https://x/a.pdf' })).toThrow(/profile is required/);
  });

  test('throws on an unknown profile name', () => {
    expect(() => resolveFilingContent({ sourceUrl: 'https://x/a.pdf', profile: 'bogus' })).toThrow(
      /unknown profile/
    );
  });

  test('never serves a SHADOW-profile extract, even though it exists on disk', () => {
    process.env.PREPROCESS_PROFILES = 'announcement';
    process.env.PREPROCESS_SHADOW_PROFILES = 'annual_report';
    jest.resetModules();
    docExtracts = require('../lib/docExtracts');
    ({ resolveFilingContent } = require('../lib/resolveFilingContent'));

    // put() itself has no shadow concept — write directly, matching what the
    // extraction pipeline would produce for a still-calibrating profile.
    putExtract('annual_report', 'https://x/ar.pdf', { fy: 'FY26' });

    const r = resolveFilingContent({ sourceUrl: 'https://x/ar.pdf', profile: 'annual_report' });
    expect(r).toEqual({
      source: 'miss',
      reason: 'not-yet-extracted',
      sourceUrl: 'https://x/ar.pdf',
      profile: 'annual_report',
    });
  });

  test('treats a record with no profileSchemaVersion at all as stale (version 0)', () => {
    const put = putExtract('announcement', 'https://x/legacy.pdf', { category_hint: 'general' });
    // Simulate a record written before this versioning scheme existed.
    const rec = JSON.parse(fs.readFileSync(put.path, 'utf8'));
    delete rec.profileSchemaVersion;
    fs.writeFileSync(put.path, JSON.stringify(rec, null, 2));

    const r = resolveFilingContent({ sourceUrl: 'https://x/legacy.pdf', profile: 'announcement' });
    expect(r).toEqual({
      source: 'miss',
      reason: 'stale-schema',
      sourceUrl: 'https://x/legacy.pdf',
      profile: 'announcement',
      recordVersion: 0,
      declaredVersion: 1,
    });
  });

  test('treats a record stamped with an OLDER version than currently declared as stale', () => {
    // Write the record, then rewrite its profileSchemaVersion down by one —
    // simulating "this was extracted under the previous schema version" —
    // rather than assuming what the live PROFILE_SCHEMA_VERSIONS number is
    // today. (docExtracts.put() reads declaredSchemaVersion() via its own
    // module-internal closure, not the exported reference, so monkeypatching
    // the export does not affect what put() stamps — this approach is
    // robust to that either way.)
    const put = putExtract('annual_report', 'https://x/ar2.pdf', { fy: 'FY25' });
    const currentDeclared = docExtracts.declaredSchemaVersion('annual_report');
    const rec = JSON.parse(fs.readFileSync(put.path, 'utf8'));
    rec.profileSchemaVersion = currentDeclared - 1;
    fs.writeFileSync(put.path, JSON.stringify(rec, null, 2));

    const r = resolveFilingContent({ sourceUrl: 'https://x/ar2.pdf', profile: 'annual_report' });
    expect(r.source).toBe('miss');
    expect(r.reason).toBe('stale-schema');
    expect(r.recordVersion).toBe(currentDeclared - 1);
    expect(r.declaredVersion).toBe(currentDeclared);
  });

  test('serves a record whose version matches the currently declared version', () => {
    // put() always stamps whatever declaredSchemaVersion() returns AT WRITE
    // TIME, so this holds regardless of the live version number.
    putExtract('annual_report', 'https://x/ar3.pdf', { fy: 'FY26' });
    const r = resolveFilingContent({ sourceUrl: 'https://x/ar3.pdf', profile: 'annual_report' });
    expect(r.source).toBe('extract-cache');
    expect(r.data).toEqual({ fy: 'FY26' });
  });
});

describe('resolveFilingContent — Tier 2 (companyId only)', () => {
  test('miss when no baseline card exists for the company', () => {
    const r = resolveFilingContent({ companyId: 'NSE:NOPE' });
    expect(r).toEqual({ source: 'miss', reason: 'no-baseline-card', companyId: 'NSE:NOPE' });
  });

  function writeCardFixture(companyId, card) {
    const f = buildBaselines.cardFile(companyId);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(card, null, 2));
    return f;
  }

  test('hit returns the baseline card and builtAt', () => {
    writeCardFixture('NSE:ABC', {
      companyId: 'NSE:ABC',
      builtAt: '2026-09-01T00:00:00.000Z',
      claimIndex: [],
    });
    const r = resolveFilingContent({ companyId: 'NSE:ABC' });
    expect(r.source).toBe('baseline-cache');
    expect(r.builtAt).toBe('2026-09-01T00:00:00.000Z');
    expect(r.data.companyId).toBe('NSE:ABC');
  });

  test('sourceUrl+profile takes precedence over companyId when both are given', () => {
    putExtract('announcement', 'https://x/both.pdf', { category_hint: 'general' });
    writeCardFixture('NSE:ABC', { companyId: 'NSE:ABC', builtAt: '2026-09-01T00:00:00.000Z' });
    const r = resolveFilingContent({
      sourceUrl: 'https://x/both.pdf',
      profile: 'announcement',
      companyId: 'NSE:ABC',
    });
    expect(r.source).toBe('extract-cache');
  });
});

describe('resolveFilingContent — invalid calls', () => {
  test('throws when neither sourceUrl nor companyId is given', () => {
    expect(() => resolveFilingContent({})).toThrow(/requires either/);
    expect(() => resolveFilingContent()).toThrow(/requires either/);
  });
});

// cacheUsageCounter wiring (skills/_shared/conventions.md §25) — this is the
// real consumer-facing choke point every document-touching skill calls, so
// this is what must actually record hits/misses, not just docExtracts.get()
// in isolation.
describe('resolveFilingContent — cache-usage recording (conventions.md §25)', () => {
  test('records a hit for an extract-cache Tier 1 lookup', () => {
    putExtract('announcement', 'https://x/hit.pdf', { category_hint: 'general' });
    resolveFilingContent({ sourceUrl: 'https://x/hit.pdf', profile: 'announcement' });
    const summary = cacheUsageCounter.getSummary('test-job');
    expect(summary.byCache['extract-cache']).toEqual({ hits: 1, misses: 0, hitRate: 1 });
  });

  test('records a miss for a not-yet-extracted Tier 1 lookup', () => {
    resolveFilingContent({ sourceUrl: 'https://x/never-seen.pdf', profile: 'announcement' });
    const summary = cacheUsageCounter.getSummary('test-job');
    expect(summary.byCache['extract-cache']).toEqual({ hits: 0, misses: 1, hitRate: 0 });
  });

  test('records a stale-schema miss under its own cache name, distinct from a plain miss', () => {
    putExtract('announcement', 'https://x/stale.pdf', { category_hint: 'general' });
    // Force a version bump so the just-written record reads as stale.
    const written = docExtracts.get('announcement', 'https://x/stale.pdf');
    written.profileSchemaVersion = -1;
    require('fs').writeFileSync(docExtracts.file('announcement', 'https://x/stale.pdf'), JSON.stringify(written));
    resolveFilingContent({ sourceUrl: 'https://x/stale.pdf', profile: 'announcement' });
    const summary = cacheUsageCounter.getSummary('test-job');
    expect(summary.byCache['extract-cache-stale-schema']).toEqual({ hits: 0, misses: 1, hitRate: 0 });
    expect(summary.byCache['extract-cache']).toBeUndefined();
  });

  function writeCardFixtureForCacheTest(companyId, card) {
    const f = buildBaselines.cardFile(companyId);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(card, null, 2));
    return f;
  }

  test('records a hit for a baseline-cache Tier 2 lookup, a miss when no card exists', () => {
    writeCardFixtureForCacheTest('NSE:ABC', { companyId: 'NSE:ABC', builtAt: '2026-09-01T00:00:00.000Z' });
    resolveFilingContent({ companyId: 'NSE:ABC' });
    resolveFilingContent({ companyId: 'NSE:NOCARD' });
    const summary = cacheUsageCounter.getSummary('test-job');
    expect(summary.byCache['baseline-cache']).toEqual({ hits: 1, misses: 1, hitRate: 0.5 });
  });
});
