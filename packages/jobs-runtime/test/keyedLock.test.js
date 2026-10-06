'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { withLock } = require('../lib/keyedLock');
const db = require('../lib/db');

// db.cachePath('locks') resolves under the real data root — redirect it to a
// throwaway temp dir for this suite so we never touch the real
// data/cache/locks/ directory (where live order-ledger locks for other
// companies may legitimately be held by a concurrent run).
let tmpRoot;
beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'keyedLock-test-'));
  jest.spyOn(db, 'cachePath').mockImplementation((...segs) => path.join(tmpRoot, ...segs));
});
afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function lockDirFor(key) {
  return path.join(tmpRoot, 'locks', key.replace(/[^A-Za-z0-9._-]/g, '_'));
}

describe('keyedLock.withLock', () => {
  test('acquires an uncontended lock and releases it after fn resolves', async () => {
    const dir = lockDirFor('order-ledger:TEST:FRESH');
    const result = await withLock('order-ledger:TEST:FRESH', async () => 'ok');
    expect(result).toBe('ok');
    expect(fs.existsSync(dir)).toBe(false); // released, not left behind
  });

  test('releases the lock even when fn throws', async () => {
    const dir = lockDirFor('order-ledger:TEST:THROWS');
    await expect(
      withLock('order-ledger:TEST:THROWS', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(fs.existsSync(dir)).toBe(false);
  });

  test('self-heals a stale lock it CAN remove, then proceeds normally', async () => {
    const key = 'order-ledger:TEST:STALE_REMOVABLE';
    const dir = lockDirFor(key);
    fs.mkdirSync(dir, { recursive: true });
    const old = Date.now() - 200000; // older than the default 120s staleMs
    fs.utimesSync(dir, old / 1000, old / 1000);

    const result = await withLock(key, async () => 'resolved-after-break', { staleMs: 120000 });
    expect(result).toBe('resolved-after-break');
    expect(fs.existsSync(dir)).toBe(false);
  });

  test(
    'REGRESSION (2026-10-06): a stale lock it CANNOT remove (EPERM-like) fails fast ' +
      'with a clear error instead of busy-spinning past its own timeoutMs',
    async () => {
      const key = 'order-ledger:TEST:STALE_UNDELETABLE';
      const dir = lockDirFor(key);
      fs.mkdirSync(dir, { recursive: true });
      const old = Date.now() - 200000;
      fs.utimesSync(dir, old / 1000, old / 1000);

      // Simulate "delete permission not granted" — rmdirSync throws EPERM for
      // this exact path, exactly like the real sandboxed environment that
      // surfaced this bug (see keyedLock.js's file-header comment).
      const realRmdirSync = fs.rmdirSync.bind(fs);
      const spy = jest.spyOn(fs, 'rmdirSync').mockImplementation((p, ...rest) => {
        if (p === dir) {
          const err = new Error(`EPERM: operation not permitted, rmdir '${p}'`);
          err.code = 'EPERM';
          throw err;
        }
        return realRmdirSync(p, ...rest);
      });

      const startedAt = Date.now();
      // timeoutMs only bounds the OTHER branch (young lock); before the fix,
      // this call would ignore it entirely and spin forever. Give it a short
      // deadline so a regression hangs the test suite loudly instead of
      // silently passing.
      await expect(
        withLock(key, async () => 'should never run', { staleMs: 120000, timeoutMs: 5000 })
      ).rejects.toThrow(/could not remove it/);
      // Must fail near-instantly (first stale check), not after spinning.
      expect(Date.now() - startedAt).toBeLessThan(2000);

      spy.mockRestore();
      fs.rmdirSync(dir); // real cleanup for the test's own sake
    },
    10000
  );

  test('two callers never run fn concurrently for the same key', async () => {
    const key = 'order-ledger:TEST:MUTEX';
    let inFlight = 0;
    let maxConcurrent = 0;
    const run = () =>
      withLock(key, async () => {
        inFlight += 1;
        maxConcurrent = Math.max(maxConcurrent, inFlight);
        await new Promise((r) => setTimeout(r, 50));
        inFlight -= 1;
        return 'done';
      });
    const [a, b] = await Promise.all([run(), run()]);
    expect(a).toBe('done');
    expect(b).toBe('done');
    expect(maxConcurrent).toBe(1);
  });
});
