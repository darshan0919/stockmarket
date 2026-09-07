'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpRoot;
let db;
let cursorHealth;

function writeCursor(name, record) {
  fs.writeFileSync(path.join(db.cachePath('.'), name), JSON.stringify(record));
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v2db-cursorhealth-'));
  process.env.DATA_V2_DIR = tmpRoot;
  jest.resetModules();
  db = require('../lib/db');
  fs.mkdirSync(db.cachePath('.'), { recursive: true });
  cursorHealth = require('../cursorHealth');
});

afterEach(() => {
  delete process.env.DATA_V2_DIR;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('cursorHealth (conventions.md §25 — Task 5)', () => {
  test('parseCursorFilename splits jobName and optional key', () => {
    expect(cursorHealth.parseCursorFilename('document-preprocessing-cursor.json')).toEqual({
      jobName: 'document-preprocessing',
      key: null,
    });
    expect(cursorHealth.parseCursorFilename('mna-tracker-cursor-abc123.json')).toEqual({
      jobName: 'mna-tracker',
      key: 'abc123',
    });
  });

  test('listCursorFiles finds *-cursor*.json but excludes -TEST- and pending-window files', () => {
    writeCursor('document-preprocessing-cursor.json', { lastCommittedAtMs: Date.now() });
    writeCursor('mna-tracker-TEST-cursor.json', { lastCommittedAtMs: Date.now() });
    writeCursor('document-preprocessing-pending-window.json', { windowEndMs: Date.now() });

    const files = cursorHealth.listCursorFiles();
    expect(files).toEqual(['document-preprocessing-cursor.json']);
  });

  test('checkOne flags a mapped job whose cursor is older than its cadence cap as stale', () => {
    const nowMs = Date.now();
    const staleMs = nowMs - 10 * 60 * 60 * 1000; // 10h ago; document-preprocessing cap is 6h
    writeCursor('document-preprocessing-cursor.json', {
      lastCommittedAtMs: staleMs,
      lastCommittedAtIso: new Date(staleMs).toISOString(),
    });

    const [result] = cursorHealth.checkOne('document-preprocessing-cursor.json', { nowMs });
    expect(result.status).toBe('stale');
    expect(result.jobName).toBe('document-preprocessing');
    expect(result.cadenceHours).toBe(6);
  });

  test('checkOne reports ok when the cursor is within its cadence cap', () => {
    const nowMs = Date.now();
    const recentMs = nowMs - 1 * 60 * 60 * 1000; // 1h ago; well within 6h cap
    writeCursor('document-preprocessing-cursor.json', {
      lastCommittedAtMs: recentMs,
      lastCommittedAtIso: new Date(recentMs).toISOString(),
    });

    const [result] = cursorHealth.checkOne('document-preprocessing-cursor.json', { nowMs });
    expect(result.status).toBe('ok');
  });

  test('checkOne reports unmapped for a cursor file with no entry in CURSOR_CADENCE_HOURS', () => {
    const nowMs = Date.now();
    writeCursor('some-new-job-cursor.json', {
      lastCommittedAtMs: nowMs - 1000,
      lastCommittedAtIso: new Date(nowMs - 1000).toISOString(),
    });

    const [result] = cursorHealth.checkOne('some-new-job-cursor.json', { nowMs });
    expect(result.status).toBe('unmapped');
    expect(result.cadenceHours).toBeNull();
  });

  test('checkOne handles the keyed-record shape (e.g. watchlist-insights, keyed by watchlist-combo) independently per sub-key', () => {
    const nowMs = Date.now();
    const freshMs = nowMs - 1 * 60 * 60 * 1000;
    const staleMs = nowMs - 200 * 60 * 60 * 1000;
    writeCursor('watchlist-insights-cursor.json', {
      'combo-a': { lastCommittedAtMs: freshMs, lastCommittedAtIso: new Date(freshMs).toISOString() },
      'combo-b': { lastCommittedAtMs: staleMs, lastCommittedAtIso: new Date(staleMs).toISOString() },
    });

    const results = cursorHealth.checkOne('watchlist-insights-cursor.json', { nowMs });
    expect(results).toHaveLength(2);
    const byKey = Object.fromEntries(results.map((r) => [r.key, r]));
    expect(byKey['combo-a'].status).toBe('ok');
    expect(byKey['combo-b'].status).toBe('stale');
  });

  test('checkOne reports unreadable when the record has no lastCommittedAtMs at all', () => {
    const nowMs = Date.now();
    writeCursor('document-preprocessing-cursor.json', { someOtherField: true });

    const [result] = cursorHealth.checkOne('document-preprocessing-cursor.json', { nowMs });
    expect(result.status).toBe('unreadable');
  });

  test('checkPendingWindows flags a pending marker uncommitted for more than 24h', () => {
    const nowMs = Date.now();
    const staleOpenedMs = nowMs - 48 * 60 * 60 * 1000;
    fs.writeFileSync(
      path.join(db.cachePath('.'), 'document-preprocessing-pending-window.json'),
      JSON.stringify({ windowEndMs: staleOpenedMs, createdAtIso: new Date(staleOpenedMs).toISOString() })
    );

    const [result] = cursorHealth.checkPendingWindows({ nowMs });
    expect(result.status).toBe('uncommitted');
  });

  test('checkPendingWindows reports ok for a pending marker opened recently', () => {
    const nowMs = Date.now();
    const recentMs = nowMs - 2 * 60 * 60 * 1000;
    fs.writeFileSync(
      path.join(db.cachePath('.'), 'document-preprocessing-pending-window.json'),
      JSON.stringify({ windowEndMs: recentMs, createdAtIso: new Date(recentMs).toISOString() })
    );

    const [result] = cursorHealth.checkPendingWindows({ nowMs });
    expect(result.status).toBe('ok');
  });

  test('CURSOR_CADENCE_HOURS covers every cursor job currently known to the repo', () => {
    // Documents the intent behind "unmapped" reporting: this list should be
    // extended, not silently left behind, whenever a new windowCursor.js
    // caller ships. Update alongside the SKILL.md that introduces it.
    expect(Object.keys(cursorHealth.CURSOR_CADENCE_HOURS).sort()).toEqual(
      ['document-preprocessing', 'post-close-scan-insights', 'watchlist-insights'].sort()
    );
  });
});
