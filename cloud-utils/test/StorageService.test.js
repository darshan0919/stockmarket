'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const StorageService = require('../src/StorageService');

describe('StorageService transparent sharded caching', () => {
  let tmpDataRoot;

  beforeEach(() => {
    tmpDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'storageservice-test-'));
    process.env.DATA_V2_DIR = tmpDataRoot;
    StorageService.clearShardCache();
  });

  afterEach(() => {
    delete process.env.DATA_V2_DIR;
    try {
      fs.rmSync(tmpDataRoot, { recursive: true, force: true });
    } catch (_) {}
  });

  test('normal files write to standard JSON format', async () => {
    await StorageService.saveJson('runs/test_run.json', { ok: true });
    const abs = path.join(tmpDataRoot, 'runs/test_run.json');
    expect(fs.existsSync(abs)).toBe(true);
    expect(StorageService.readJson('runs/test_run.json')).toEqual({ ok: true });
  });

  test('sharded cache paths route into shard_<hex>.jsonl transparently', async () => {
    const hash = 'a123456789abcdef0123456789abcdef';
    const fakeRelPath = `cache/pdf-text/${hash}.json`;

    await StorageService.saveJson(fakeRelPath, { text: 'Sample PDF Text', numPages: 2 });

    // The individual file should NOT exist on disk
    const absIndividual = path.join(tmpDataRoot, fakeRelPath);
    expect(fs.existsSync(absIndividual)).toBe(false);

    // The shard file MUST exist on disk
    const absShard = path.join(tmpDataRoot, 'cache/pdf-text/shard_a.jsonl');
    expect(fs.existsSync(absShard)).toBe(true);

    // Reading the fake individual path returns the exact cached object
    const read = StorageService.readJson(fakeRelPath);
    expect(read).toEqual({ text: 'Sample PDF Text', numPages: 2 });

    // Updating the same key appends and returns the updated value
    await StorageService.saveJson(fakeRelPath, { text: 'Updated Text', numPages: 3 });
    StorageService.clearShardCache(); // Force disk read
    expect(StorageService.readJson(fakeRelPath)).toEqual({ text: 'Updated Text', numPages: 3 });

    // Nonexistent hash returns null
    expect(
      StorageService.readJson(`cache/pdf-text/b123456789abcdef0123456789abcdef.json`)
    ).toBeNull();
  });

  test('supports all heavy sharded cache prefixes (> 10 MB)', async () => {
    const prefixes = [
      'cache/pdf-text/c1111111111111111111111111111111.json',
      'cache/pdf-text-full/d2222222222222222222222222222222.json',
      'cache/monthly-updates-text/e333333333333333.json',
    ];

    for (const p of prefixes) {
      await StorageService.saveJson(p, { payload: p });
      expect(StorageService.readJson(p)).toEqual({ payload: p });
    }

    expect(fs.existsSync(path.join(tmpDataRoot, 'cache/pdf-text/shard_c.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDataRoot, 'cache/pdf-text-full/shard_d.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDataRoot, 'cache/monthly-updates-text/shard_e.jsonl'))).toBe(
      true
    );
  });

  test('routes light stores (< 5 MB) into single-JSONL files', async () => {
    const stores = [
      {
        path: 'cache/stockscans-context/NSE:TCS.json',
        expectedRel: 'cache/stockscans-context/context.jsonl',
        payload: { ticker: 'TCS' },
      },
      {
        path: 'cache/company-baselines/NSE:INFY.json',
        expectedRel: 'cache/company-baselines/baselines.jsonl',
        payload: { ticker: 'INFY' },
      },
      {
        path: 'cache/event-reaction/ELECON.json',
        expectedRel: 'cache/event-reaction/reactions.jsonl',
        payload: { symbol: 'ELECON' },
      },
      {
        path: 'cache/order-announcements/NSE:BEML/order_123.json',
        expectedRel: 'cache/order-announcements/announcements.jsonl',
        payload: { cr: 100 },
      },
      {
        path: 'cache/concall-notes/NSE:BEML/202603.json',
        expectedRel: 'cache/concall-notes/notes.jsonl',
        payload: { quarter: '202603' },
      },
      {
        path: 'cache/rerating-catalysts/briefs/brief_001.json',
        expectedRel: 'cache/rerating-catalysts/briefs.jsonl',
        payload: { brief: true },
      },
      {
        path: 'cache/rerating-catalysts/filings/filing_001.json',
        expectedRel: 'cache/rerating-catalysts/filings.jsonl',
        payload: { filing: true },
      },
      {
        path: 'cache/monthly-updates-parsed/f444444444444444.json',
        expectedRel: 'cache/monthly-updates-parsed/parsed.jsonl',
        payload: { parsed: true },
      },
      {
        path: 'cache/doc-extracts/annual_report/e555555555555555.json',
        expectedRel: 'cache/doc-extracts/annual_report.jsonl',
        payload: { docType: 'annual_report' },
      },
    ];

    for (const item of stores) {
      await StorageService.saveJson(item.path, item.payload);
      expect(StorageService.readJson(item.path)).toEqual(item.payload);
      expect(fs.existsSync(path.join(tmpDataRoot, item.expectedRel))).toBe(true);
    }
  });
});
