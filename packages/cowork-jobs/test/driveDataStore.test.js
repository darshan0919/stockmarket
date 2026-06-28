'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const store = require('../lib/driveDataStore');

function writeFile(filePath, body) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body);
}

function readJsonl(filePath) {
  return fs
    .readFileSync(filePath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe('driveDataStore classification', () => {
  test('maps local cowork artifacts to partitioned Drive paths', () => {
    expect(store.classifyLocalDocument('daily_gainers/2026-06-26_gainers_raw.json')).toMatchObject({
      category: 'gainers-raw',
      driveRel: 'gainers/2026/06/26/gainers_raw.json',
      date: '2026-06-26',
    });

    expect(store.classifyLocalDocument('daily_gainers/2026-06-26_insights.json')).toMatchObject({
      category: 'gainers-insights',
      driveRel: 'gainers/2026/06/26/insights.json',
    });

    expect(store.classifyLocalDocument('delivery_cache/sec_bhavdata_full_26062026.csv')).toMatchObject({
      category: 'nse-delivery-bhavcopy',
      driveRel: 'market-data/nse-delivery/2026/06/sec_bhavdata_full_26062026.csv',
      date: '2026-06-26',
    });
  });
});

describe('driveDataStore sync', () => {
  test('pushes structured Drive documents, writes DTO metadata, and restores local layout', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cowork-drive-'));
    const dataRoot = path.join(tmp, 'data');
    const driveRoot = path.join(tmp, 'drive');

    writeFile(
      path.join(dataRoot, 'daily_gainers', '2026-06-26_gainers_raw.json'),
      JSON.stringify({ schema_version: '2.0', market_date: '2026-06-26' })
    );
    writeFile(
      path.join(dataRoot, 'daily_gainers', '2026-06-26_insights.json'),
      JSON.stringify({ market_date: '2026-06-26', signals: [] })
    );
    writeFile(path.join(dataRoot, 'notes', '.current_run'), 'notes_26-06-26_08-40-11_AM.json\n');
    writeFile(path.join(dataRoot, 'validation', 'ledger.json'), JSON.stringify({ runs: [] }));

    const push = store.syncToDrive({ dataRoot, driveRoot });

    expect(push).toMatchObject({ enabled: true, direction: 'push', copied: 4, indexed: 4 });
    expect(fs.existsSync(path.join(driveRoot, 'gainers', '2026', '06', '26', 'gainers_raw.json'))).toBe(true);
    expect(fs.existsSync(path.join(driveRoot, 'gainers', '2026', '06', '26', 'insights.json'))).toBe(true);
    expect(fs.existsSync(path.join(driveRoot, 'notes', 'current_run.txt'))).toBe(true);
    expect(fs.existsSync(path.join(driveRoot, 'validation', 'ledger', 'ledger.json'))).toBe(true);

    const database = JSON.parse(fs.readFileSync(path.join(driveRoot, '_meta', 'database.json'), 'utf8'));
    expect(database.schemaVersion).toBe(store.SCHEMA_VERSION);
    expect(database.documentCount).toBe(4);

    const docs = readJsonl(path.join(driveRoot, '_meta', 'documents.jsonl'));
    expect(docs.map((d) => d.category).sort()).toEqual([
      'gainers-insights',
      'gainers-raw',
      'notes',
      'validation-ledger',
    ]);
    expect(docs.find((d) => d.category === 'notes')).toMatchObject({
      contentType: 'text/plain',
      driveRel: 'notes/current_run.txt',
      localRel: 'notes/.current_run',
    });

    fs.rmSync(dataRoot, { recursive: true, force: true });
    const pull = store.syncFromDrive({ dataRoot, driveRoot });

    expect(pull).toMatchObject({ enabled: true, direction: 'pull', copied: 4 });
    expect(fs.existsSync(path.join(dataRoot, 'daily_gainers', '2026-06-26_gainers_raw.json'))).toBe(true);
    expect(fs.existsSync(path.join(dataRoot, 'daily_gainers', '2026-06-26_insights.json'))).toBe(true);
    expect(fs.readFileSync(path.join(dataRoot, 'notes', '.current_run'), 'utf8')).toContain('notes_26-06-26');
    expect(fs.existsSync(path.join(dataRoot, 'validation', 'ledger.json'))).toBe(true);
  });

  test('does not overwrite a newer Drive document with an older local copy', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cowork-drive-conflict-'));
    const dataRoot = path.join(tmp, 'data');
    const driveRoot = path.join(tmp, 'drive');
    const localFile = path.join(dataRoot, 'daily_gainers', '2026-06-26_gainers_raw.json');
    const driveFile = path.join(driveRoot, 'gainers', '2026', '06', '26', 'gainers_raw.json');

    writeFile(localFile, 'OLD!');
    writeFile(driveFile, 'NEW!');
    fs.utimesSync(localFile, new Date('2026-06-26T08:00:00Z'), new Date('2026-06-26T08:00:00Z'));
    fs.utimesSync(driveFile, new Date('2026-06-26T09:00:00Z'), new Date('2026-06-26T09:00:00Z'));

    const push = store.syncToDrive({ dataRoot, driveRoot });

    expect(push.copied).toBe(0);
    expect(fs.readFileSync(driveFile, 'utf8')).toBe('NEW!');
  });

  test('honors COWORK_DRIVE_SYNC=0', () => {
    const original = process.env.COWORK_DRIVE_SYNC;
    process.env.COWORK_DRIVE_SYNC = '0';

    try {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cowork-drive-disabled-'));
      const dataRoot = path.join(tmp, 'data');
      const driveRoot = path.join(tmp, 'drive');
      writeFile(path.join(dataRoot, 'daily_gainers', '2026-06-26_gainers_raw.json'), '{}');

      const push = store.syncToDrive({ dataRoot, driveRoot });

      expect(push).toMatchObject({ enabled: false, disabled: true, copied: 0, indexed: 0 });
      expect(fs.existsSync(driveRoot)).toBe(false);
    } finally {
      if (original === undefined) delete process.env.COWORK_DRIVE_SYNC;
      else process.env.COWORK_DRIVE_SYNC = original;
    }
  });
});
