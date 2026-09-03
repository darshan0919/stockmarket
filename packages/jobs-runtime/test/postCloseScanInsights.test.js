'use strict';

const {
  parseAnnDateToUtc,
  normaliseSavedScan,
  SCAN_SOURCE_NAME,
  FALLBACK_SCAN,
} = require('../postCloseScanInsights');

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
