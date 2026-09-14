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
    expect(StorageService.readJson(`cache/pdf-text/b123456789abcdef0123456789abcdef.json`)).toBeNull();
  });

  test('supports all designated cache prefixes', async () => {
    const prefixes = [
      'cache/pdf-text/c1111111111111111111111111111111.json',
      'cache/pdf-text-full/d2222222222222222222222222222222.json',
      'cache/monthly-updates-text/e333333333333333.json',
      'cache/monthly-updates-parsed/f444444444444444.json',
    ];

    for (const p of prefixes) {
      await StorageService.saveJson(p, { payload: p });
      expect(StorageService.readJson(p)).toEqual({ payload: p });
    }

    expect(fs.existsSync(path.join(tmpDataRoot, 'cache/pdf-text/shard_c.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDataRoot, 'cache/pdf-text-full/shard_d.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDataRoot, 'cache/monthly-updates-text/shard_e.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDataRoot, 'cache/monthly-updates-parsed/shard_f.jsonl'))).toBe(true);
  });
});
