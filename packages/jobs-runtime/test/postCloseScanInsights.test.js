'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');

// Point the notes DB at a temp dir BEFORE requiring the module (paths bind at
// load, same pattern as test/watchlistInsights.test.js) — needed for the
// collectCachedNotesSinceCutoff regression suite below, which writes real
// notes through lib/db.js and must not touch the repo's own data/notes.json.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pcsi-'));
process.env.DATA_V2_DIR = TMP;

const {
  parseAnnDateToUtc,
  normaliseSavedScan,
  SCAN_SOURCE_NAME,
  FALLBACK_SCAN,
  collectCachedNotesSinceCutoff,
} = require('../postCloseScanInsights');
const db = require('../lib/db');

// ── The timezone assumption ────────────────────────────────────────────────
//
// This is the most consequential single line in the file. A 2026-08-31 change
// read the API's bare `createdAt` as UTC; it is IST, and the difference is 5.5
// hours — wide enough to put an announcement in the wrong slot entirely and to
// make the resumable cursor's "everything up to here is handled" claim false.
// The evidence is recorded in the source; these tests pin the behaviour so the
// same wrong conclusion cannot be re-reached silently.
describe('parseAnnDateToUtc: bare Stockscans timestamps are IST', () => {
  test('a bare timestamp is shifted back 5:30 to a real UTC instant', () => {
    const d = parseAnnDateToUtc('2026-09-03T23:39:28.983965');
    expect(d.toISOString()).toBe('2026-09-03T18:09:28.000Z');
  });

  test('an evening IST filing lands the same evening in UTC, not the next day', () => {
    // Under the old UTC reading this returned 2026-09-03T18:30:00Z, i.e. it
    // claimed a 6:30pm-IST filing happened at midnight IST. That 5.5h drift is
    // what silently over-included items against a "since last close" cutoff.
    expect(parseAnnDateToUtc('2026-09-03T18:30:00').toISOString()).toBe('2026-09-03T13:00:00.000Z');
  });

  test('a filing during the session is inside the session in UTC terms', () => {
    // 11:00 IST is 05:30 UTC. Only this reading puts filing activity inside the
    // 09:15-15:30 IST trading session at all; the UTC reading claimed the
    // market files nothing during its own session.
    expect(parseAnnDateToUtc('2026-09-03T11:00:00').toISOString()).toBe('2026-09-03T05:30:00.000Z');
  });

  test('an explicit zone marker is authoritative and never shifted', () => {
    expect(parseAnnDateToUtc('2026-09-03T18:09:28Z').toISOString()).toBe(
      '2026-09-03T18:09:28.000Z'
    );
    expect(parseAnnDateToUtc('2026-09-03T23:39:28+05:30').toISOString()).toBe(
      '2026-09-03T18:09:28.000Z'
    );
  });

  test('a date-only value is read as IST midnight — the conservative direction', () => {
    // Reading it as IST midnight can only make an item look OLDER than it is,
    // so a same-day item is never wrongly excluded from a window starting
    // before that midnight. Erring the other way would drop real filings.
    expect(parseAnnDateToUtc('2026-09-03').toISOString()).toBe('2026-09-02T18:30:00.000Z');
  });

  test('null/empty input yields null rather than an Invalid Date', () => {
    expect(parseAnnDateToUtc(null)).toBeNull();
    expect(parseAnnDateToUtc('')).toBeNull();
  });

  test('parsed instants order the same way the IST wall clock does', () => {
    const earlier = parseAnnDateToUtc('2026-09-03T15:45:00');
    const later = parseAnnDateToUtc('2026-09-03T18:45:00');
    expect(earlier.getTime()).toBeLessThan(later.getTime());
  });
});

// ── Saved-scan normalisation ───────────────────────────────────────────────
describe('normaliseSavedScan: shaping a saved scan for announcements/scan', () => {
  test('fills in companyFilters, which the saved-scan API omits', () => {
    // The saved-scan response has no `companyFilters` but the scan endpoint
    // expects one, so it is defaulted here rather than at each call site.
    const saved = {
      scanId: 'abc',
      scanName: SCAN_SOURCE_NAME,
      filters: [{ left: 'Market Capitalization', sign: '>=', right: '300' }],
    };
    const out = normaliseSavedScan(saved);
    expect(out.companyFilters).toEqual([]);
    expect(out.searchFilters).toEqual([]);
    expect(out.watchlistIds).toEqual([]);
  });

  test('preserves scanId and scanName, which the endpoint requires', () => {
    // Omitting either is a hard HTTP 400 — see docs/stockscans-api-schemas.md.
    const out = normaliseSavedScan({ scanId: 'xyz', scanName: 'Signals - DND', filters: [] });
    expect(out.scanId).toBe('xyz');
    expect(out.scanName).toBe('Signals - DND');
  });

  test('preserves the user filters verbatim — the whole point of resolving live', () => {
    const filters = [
      { left: 'Market Capitalization', sign: '>=', right: '300' },
      { left: 'FII Holdings + DII Holdings', sign: '>=', right: '0' },
    ];
    expect(normaliseSavedScan({ scanId: 'a', scanName: 'b', filters }).filters).toEqual(filters);
  });

  test('defaults announcementType and searchMode when absent', () => {
    const out = normaliseSavedScan({ scanId: 'a', scanName: 'b', filters: [] });
    expect(out.announcementType).toBe('All');
    expect(out.searchMode).toBe('quick');
    expect(out.alerts).toBe(false);
  });
});

describe('FALLBACK_SCAN: the last-resort frozen copy', () => {
  test('is shaped like a valid scan payload and names the right scan', () => {
    // A fallback that is missing required fields fails at the worst possible
    // moment — when the live API is already down.
    expect(FALLBACK_SCAN.scanId).toBeTruthy();
    expect(FALLBACK_SCAN.scanName).toBe(SCAN_SOURCE_NAME);
    expect(FALLBACK_SCAN.filters.length).toBeGreaterThan(0);
    expect(FALLBACK_SCAN.companyFilters).toEqual([]);
  });

  test('normalises to itself — it is already in endpoint shape', () => {
    expect(normaliseSavedScan(FALLBACK_SCAN)).toEqual(FALLBACK_SCAN);
  });
});

// ── collectCachedNotesSinceCutoff: regression for the createdAt/creationTime
// digest-emptying bug (found 2026-09-07, fixed 2026-09-08) ────────────────
//
// This function used to key its cutoff filter off `n.createdAt`, a field
// that stopped being written to note records once the schema moved to
// creationTime-only. Every note written after that migration therefore
// failed `ist.parseCreatedAtMs(n.createdAt || n.date || '')` silently (it
// fell through to `n.date`, which notes never carry either, so the parse
// returned null and the note was dropped) — a full post-close run that
// wrote 42 real insight notes sent a digest with a count of 0. These tests
// pin the fixed behavior directly against lib/db.js's real appendNotes(), so
// a future change that reintroduces a second timestamp field is caught here
// rather than only being visible as an empty production email.
describe('collectCachedNotesSinceCutoff: single-timestamp schema regression', () => {
  test('a freshly-appended note (creationTime only, no createdAt) is found when its creationTime is after the cutoff', () => {
    db.appendNotes([
      {
        companyId: 'NSE:CCT1',
        creator: 'post-close-scan-insights',
        sourceSkill: 'post-close-scan-insights',
        usecase: 'announcement-insights:standard',
        type: 'announcement',
        announcementId: 'cct1.pdf',
        insight: 'Something happened at CCT1.',
        significance: 'medium',
        category: 'order_book',
      },
    ]);

    const farPast = Date.parse('2020-01-01T00:00:00Z');
    const out = collectCachedNotesSinceCutoff(farPast);
    const match = out.find((i) => i.companyId === 'NSE:CCT1');
    expect(match).toBeTruthy();
    expect(match.insight).toBe('Something happened at CCT1.');
    // The output DTO itself carries the note's real creationTime forward
    // (not a `createdAt` key) — see the function's own comment on why this
    // key was renamed as part of the fix.
    expect(match.creationTime).toBeTruthy();
    expect(match.createdAt).toBeUndefined();
  });

  test('a note is excluded once the cutoff moves past its creationTime', () => {
    db.appendNotes([
      {
        companyId: 'NSE:CCT2',
        creator: 'post-close-scan-insights',
        sourceSkill: 'post-close-scan-insights',
        usecase: 'announcement-insights:standard',
        type: 'announcement',
        announcementId: 'cct2.pdf',
        insight: 'Old news at CCT2.',
        significance: 'low',
        category: 'general',
      },
    ]);

    const farFuture = Date.parse('2099-01-01T00:00:00Z');
    const out = collectCachedNotesSinceCutoff(farFuture);
    expect(out.find((i) => i.companyId === 'NSE:CCT2')).toBeUndefined();
  });

  test('a note with no insight text is never surfaced, regardless of timestamp', () => {
    db.appendNotes([
      {
        companyId: 'NSE:CCT3',
        creator: 'post-close-scan-insights',
        sourceSkill: 'post-close-scan-insights',
        usecase: 'announcement-insights:standard',
        type: 'announcement',
        announcementId: 'cct3.pdf',
        significance: 'routine',
        category: 'general',
      },
    ]);

    const farPast = Date.parse('2020-01-01T00:00:00Z');
    const out = collectCachedNotesSinceCutoff(farPast);
    expect(out.find((i) => i.companyId === 'NSE:CCT3')).toBeUndefined();
  });
});
