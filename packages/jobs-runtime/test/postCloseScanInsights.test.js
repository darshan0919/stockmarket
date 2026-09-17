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
  normaliseFilingTitle,
  groupDuplicateFilings,
  cmdFilterNoise,
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

// ── groupDuplicateFilings: same-day companion-filing pre-pass ─────────────
//
// Added 2026-09-13 after a run report found ~15-20% of PDF reads across a
// 246-item batch were exact-duplicate or same-day companion filings (a
// board-outcome Reg 30 filing, its own press release, and an investor deck
// restating the same numbers). `alreadyProcessed`/`mark-processed` cannot
// catch this — that check is keyed on announcementId and only prevents a
// duplicate WRITE, after the PDF has already been read and an LLM call has
// already produced the (discarded) second insight. These tests pin the
// grouping behaviour against real title pairs pulled from that run.
describe('normaliseFilingTitle: strips filing boilerplate without erasing the event', () => {
  test('two Reg-30 preambles that differ in wording normalise close together', () => {
    const a = normaliseFilingTitle(
      'Announcement under Regulation 30 (LODR)-Change in Directorate',
      ''
    );
    const b = normaliseFilingTitle(
      'Disclosure Under Regulation 30 Of SEBI Listing Regulations 2015',
      'General - Change in Directorate'
    );
    // Boilerplate ("Announcement under Regulation 30...", "Disclosure Under...
    // SEBI Listing Regulations 2015") is stripped from both; what survives is
    // the shared event text ("Change in Directorate").
    expect(a).toMatch(/change in directorate/i);
    expect(b).toMatch(/change in directorate/i);
  });

  test('empty title and description normalises to an empty string, not a crash', () => {
    expect(normaliseFilingTitle('', '')).toBe('');
    expect(normaliseFilingTitle(null, undefined)).toBe('');
  });
});

describe('groupDuplicateFilings: tags companions without dropping any item', () => {
  const base = (over) => ({
    companyId: 'NSE:CEIGALL',
    name: 'Ceigall India Ltd',
    title: 'Outcome Of Board Meeting',
    description: '',
    category: 'acquisition',
    ssUrl: 'lead.pdf',
    createdAt: '2026-09-13T10:00:00',
    date: '2026-09-13',
    ...over,
  });

  test('never changes the item count — tag-and-keep (unlike filter-noise, which drops a noise-keyword match; see cmdFilterNoise)', () => {
    const items = [
      base({ ssUrl: 'a.pdf' }),
      base({ ssUrl: 'b.pdf', title: 'Outcome Of Board Meeting - Press Release' }),
      base({ ssUrl: 'c.pdf', companyId: 'NSE:OTHER', title: 'Completely unrelated filing' }),
    ];
    const out = groupDuplicateFilings(items);
    expect(out.length).toBe(items.length);
  });

  test('two same-day, same-company filings describing the same board outcome group together', () => {
    // Real pair from the 2026-09-13 run: a board-outcome note and a same-day
    // press-release companion for the identical Ceigall/REC transmission-SPV
    // acquisition, filed hours apart.
    const items = [
      base({
        ssUrl: 'board-outcome.pdf',
        createdAt: '2026-09-13T09:15:00',
        title: 'Outcome Of Board Meeting Held On September 13 2026 - Acquisition of JKJTL',
      }),
      base({
        ssUrl: 'press-release.pdf',
        createdAt: '2026-09-13T11:40:00',
        title: 'Press Release - Acquisition of JKJTL',
      }),
    ];
    const out = groupDuplicateFilings(items);
    const lead = out.find((i) => i.isDuplicateLead);
    const follower = out.find((i) => !i.isDuplicateLead);
    expect(lead).toBeTruthy();
    expect(follower).toBeTruthy();
    // The earlier-filed item (by createdAt) is the lead.
    expect(lead.ssUrl).toBe('board-outcome.pdf');
    expect(follower.duplicateOf).toBe('board-outcome.pdf');
    expect(follower.duplicateGroupSize).toBe(2);
    expect(lead.duplicateGroupSize).toBe(2);
  });

  test('same company, same day, but a genuinely different event stays ungrouped', () => {
    const items = [
      base({ ssUrl: 'agm.pdf', title: 'Proceedings Of AGM Held On September 13 2026' }),
      base({ ssUrl: 'order-win.pdf', title: 'Company wins Rs 46 crore railway order from NFR' }),
    ];
    const out = groupDuplicateFilings(items);
    expect(out.every((i) => i.isDuplicateLead)).toBe(true);
    expect(out.every((i) => i.duplicateOf === null)).toBe(true);
  });

  test('same title, same company, but different calendar days are never grouped', () => {
    // A next-tranche/next-milestone filing is a real, separate event even
    // when the title text is nearly identical — only same-day companions are
    // companion filings.
    const items = [
      base({ ssUrl: 'tranche1.pdf', date: '2026-09-01', createdAt: '2026-09-01T10:00:00' }),
      base({ ssUrl: 'tranche2.pdf', date: '2026-09-13', createdAt: '2026-09-13T10:00:00' }),
    ];
    const out = groupDuplicateFilings(items);
    expect(out.every((i) => i.isDuplicateLead)).toBe(true);
  });

  test('different companies, same day, identical title text are never grouped', () => {
    const items = [
      base({ ssUrl: 'x.pdf', companyId: 'NSE:AAA', title: 'Closure of Trading Window' }),
      base({ ssUrl: 'y.pdf', companyId: 'NSE:BBB', title: 'Closure of Trading Window' }),
    ];
    const out = groupDuplicateFilings(items);
    expect(out.every((i) => i.isDuplicateLead)).toBe(true);
  });

  test('a three-filing same-day cluster (board outcome + press release + investor deck) collapses to one lead', () => {
    const items = [
      base({
        ssUrl: '1.pdf',
        createdAt: '2026-09-13T09:00:00',
        title: 'Outcome Of Board Meeting - Arya Wellness Acquisition',
      }),
      base({
        ssUrl: '2.pdf',
        createdAt: '2026-09-13T09:30:00',
        title: 'Press release confirms Arya Wellness Acquisition',
      }),
      base({
        ssUrl: '3.pdf',
        createdAt: '2026-09-13T10:15:00',
        title: 'Investor deck for Arya Wellness Acquisition',
      }),
    ];
    const out = groupDuplicateFilings(items);
    const leads = out.filter((i) => i.isDuplicateLead);
    expect(leads.length).toBe(1);
    expect(leads[0].ssUrl).toBe('1.pdf');
    expect(out.filter((i) => i.duplicateOf === '1.pdf').length).toBe(2);
  });
});

describe('cmdFilterNoise: announcement-noise-keywords is a real pre-filter, not a tag', () => {
  // Reverted 2026-09-17 (Darshan's explicit correction). Confirmed live the
  // same day: NSE:MIDHANI's "Change in Directorate" and NSE:LOKESHMACH's
  // "Change in Management" both matched an existing keyword, got flagged,
  // and were still fully read/digested anyway under the interim
  // tag-and-keep behavior this test now guards against regressing to.
  function writeFetchScanFixture(items) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcsi-filter-noise-'));
    const file = path.join(dir, 'fetch-scan-out.json');
    fs.writeFileSync(file, JSON.stringify({ inWindow: items }));
    return file;
  }

  async function runFilterNoise(items) {
    const file = writeFetchScanFixture(items);
    let captured = '';
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation((s) => {
      captured += s;
      return true;
    });
    // cmdFilterNoise is async since it now awaits checkAndLogNoise's audit-log
    // write per item (lib/noiseKeywordFilter.js) — must be awaited here or
    // the stdout capture below races the write and reads an empty string.
    await cmdFilterNoise([file]);
    spy.mockRestore();
    return JSON.parse(captured);
  }

  test('a genuine noise-keyword match is dropped, not merely tagged', async () => {
    const out = await runFilterNoise([
      {
        companyId: 'NSE:MIDHANI',
        name: 'Mishra Dhatu Nigam Ltd',
        title: 'Announcement under Regulation 30 (LODR)-Change in Directorate',
        description:
          'Change in Directorate - Appointment and tenure end of Government Nominee Director.',
      },
      {
        companyId: 'NSE:LOKESHMACH',
        name: 'Lokesh Machines Ltd',
        title: 'Announcement under Regulation 30 (LODR)-Change in Management',
        description: 'Change in Management - Appointment of Mr. G Ranganath as VP - Operations.',
      },
      {
        companyId: 'NSE:ORDER',
        name: 'Some Order Company',
        title: 'Bagging of large order',
        description: 'EPC win worth Rs 200cr',
      },
    ]);
    expect(out.kept.length).toBe(1);
    expect(out.kept[0].companyId).toBe('NSE:ORDER');
    expect(out.dropped.length).toBe(2);
    const droppedIds = out.dropped.map((i) => i.companyId).sort();
    expect(droppedIds).toEqual(['NSE:LOKESHMACH', 'NSE:MIDHANI']);
    // Every dropped item still carries the matched keyword for the run
    // report / false-positive audit trail — dropping and reporting are not
    // mutually exclusive.
    for (const item of out.dropped) {
      expect(item.noiseFlagged).toBe(true);
      expect(item.noiseKeyword).toBeTruthy();
    }
  });

  test('a non-matching item is kept and carries noiseFlagged:false', async () => {
    const out = await runFilterNoise([
      {
        companyId: 'NSE:ORDER',
        name: 'Some Order Company',
        title: 'Bagging of large order',
        description: 'EPC win worth Rs 200cr',
      },
    ]);
    expect(out.kept.length).toBe(1);
    expect(out.dropped.length).toBe(0);
    expect(out.kept[0].noiseFlagged).toBe(false);
    expect(out.kept[0].noiseKeyword).toBe(null);
  });
});
