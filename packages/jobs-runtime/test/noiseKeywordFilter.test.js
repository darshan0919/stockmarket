'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');

// Point StorageService's data root at a temp dir BEFORE requiring the module
// (paths bind at load, same pattern as watchlistInsights.test.js /
// postCloseScanInsights.test.js) — logIgnoredAnnouncement writes to
// cache/ignored-announcements_<date>.json and must never touch the repo's
// own data/ directory during a test run.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'noise-filter-'));
process.env.DATA_V2_DIR = TMP;

const {
  matchNoiseKeyword,
  logIgnoredAnnouncement,
  checkAndLogNoise,
} = require('../lib/noiseKeywordFilter');
const { StorageService } = require('@stock/cloud-utils');
const ist = require('../lib/ist');

describe('matchNoiseKeyword', () => {
  test('a title-keyword match returns {keyword, field}', () => {
    const match = matchNoiseKeyword({ title: 'Closure of Trading Window', description: '' });
    expect(match).toEqual({ keyword: 'Closure of Trading Window', field: 'title' });
  });

  test('a non-matching announcement returns null', () => {
    expect(matchNoiseKeyword({ title: 'Bagging of large order', description: 'EPC win' })).toBe(
      null
    );
  });

  // Regression fixtures from the 2026-09-17 incident: both titles genuinely
  // match an existing keyword and must be reported as such by this function
  // — the bug that shipped between 2026-09-05 and 2026-09-17 was never in
  // the matching logic itself, it was in callers choosing not to act on a
  // real match.
  test('NSE:MIDHANI "Change in Directorate" matches', () => {
    const match = matchNoiseKeyword({
      title: 'Announcement under Regulation 30 (LODR)-Change in Directorate',
      description:
        'Change in Directorate - Appointment and tenure end of Government Nominee Director.',
    });
    expect(match).toBeTruthy();
    expect(match.keyword).toBe('Change in Directorate');
  });

  test('NSE:LOKESHMACH "Change in Management" matches', () => {
    const match = matchNoiseKeyword({
      title: 'Announcement under Regulation 30 (LODR)-Change in Management',
      description: 'Change in Management - Appointment of Mr. G Ranganath as VP - Operations.',
    });
    expect(match).toBeTruthy();
    expect(match.keyword).toBe('Change in Manag');
  });
});

describe('logIgnoredAnnouncement', () => {
  test('appends an entry to the day-scoped ignored-announcements log', async () => {
    const dateStr = ist.istYmd();
    const logPath = `cache/ignored-announcements_${dateStr}.json`;
    const before = StorageService.readJson(logPath) || [];

    await logIgnoredAnnouncement(
      {
        companyId: 'NSE:TESTCO',
        name: 'Test Company Ltd',
        title: 'Closure of Trading Window',
        description: 'Routine trading-window closure ahead of results.',
        createdAt: '2026-09-17T10:00:00',
      },
      'Closure of Trading Window'
    );

    const after = StorageService.readJson(logPath) || [];
    expect(after.length).toBe(before.length + 1);
    const entry = after[after.length - 1];
    expect(entry.companyId).toBe('NSE:TESTCO');
    expect(entry.matchedKeyword).toBe('Closure of Trading Window');
    expect(entry.title).toBe('Closure of Trading Window');
  });

  test('description is truncated to 300 chars in the log entry', async () => {
    const dateStr = ist.istYmd();
    const logPath = `cache/ignored-announcements_${dateStr}.json`;
    const longDescription = 'x'.repeat(500);

    await logIgnoredAnnouncement(
      {
        companyId: 'NSE:LONGDESC',
        name: 'Long Desc Ltd',
        title: 'Closure of Trading Window',
        description: longDescription,
        createdAt: '2026-09-17T10:00:00',
      },
      'Closure of Trading Window'
    );

    const after = StorageService.readJson(logPath) || [];
    const entry = after.find((e) => e.companyId === 'NSE:LONGDESC');
    expect(entry.description.length).toBe(300);
  });
});

describe('checkAndLogNoise: the single entry point every caller should use', () => {
  test('a match is logged AND reported as drop:true, with keyword+field', async () => {
    const dateStr = ist.istYmd();
    const logPath = `cache/ignored-announcements_${dateStr}.json`;
    const before = StorageService.readJson(logPath) || [];

    const result = await checkAndLogNoise({
      companyId: 'NSE:MIDHANI',
      name: 'Mishra Dhatu Nigam Ltd',
      title: 'Announcement under Regulation 30 (LODR)-Change in Directorate',
      description:
        'Change in Directorate - Appointment and tenure end of Government Nominee Director.',
      createdAt: '2026-09-17T17:01:59',
    });

    expect(result.drop).toBe(true);
    expect(result.keyword).toBe('Change in Directorate');
    expect(result.field).toBe('title');

    const after = StorageService.readJson(logPath) || [];
    expect(after.length).toBe(before.length + 1);
    expect(after[after.length - 1].companyId).toBe('NSE:MIDHANI');
  });

  test('a non-match is neither logged nor reported as drop', async () => {
    const dateStr = ist.istYmd();
    const logPath = `cache/ignored-announcements_${dateStr}.json`;
    const before = StorageService.readJson(logPath) || [];

    const result = await checkAndLogNoise({
      companyId: 'NSE:ORDER',
      name: 'Some Order Company',
      title: 'Bagging of large order',
      description: 'EPC win worth Rs 200cr',
      createdAt: '2026-09-17T18:00:00',
    });

    expect(result.drop).toBe(false);
    expect(result.keyword).toBe(null);
    expect(result.field).toBe(null);

    const after = StorageService.readJson(logPath) || [];
    expect(after.length).toBe(before.length);
  });

  // The exact incident this whole module exists to prevent regressing: both
  // items must report drop:true, not merely a tag, and both must be logged
  // for the false-positive review trail regardless.
  test('MIDHANI and LOKESHMACH both report drop:true (2026-09-17 regression)', async () => {
    const midhani = await checkAndLogNoise({
      companyId: 'NSE:MIDHANI',
      name: 'Mishra Dhatu Nigam Ltd',
      title: 'Announcement under Regulation 30 (LODR)-Change in Directorate',
      description:
        'Change in Directorate - Appointment and tenure end of Government Nominee Director.',
      createdAt: '2026-09-17T17:01:59',
    });
    const lokeshmach = await checkAndLogNoise({
      companyId: 'NSE:LOKESHMACH',
      name: 'Lokesh Machines Ltd',
      title: 'Announcement under Regulation 30 (LODR)-Change in Management',
      description: 'Change in Management - Appointment of Mr. G Ranganath as VP - Operations.',
      createdAt: '2026-09-17T18:43:02',
    });

    expect(midhani.drop).toBe(true);
    expect(lokeshmach.drop).toBe(true);
  });
});
