'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  JsonlStore,
  timePartitioner,
  hashPartitioner,
  domainPartitioner,
  extractYearMonth,
} = require('../lib/jsonlStore');

describe('jsonlStore', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonlstore-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  describe('partitioners', () => {
    test('extractYearMonth extracts YYYY-MM correctly', () => {
      expect(extractYearMonth('2026-09-14')).toBe('2026-09');
      expect(extractYearMonth('rpt_gainers-signal_NSE:INFY_2026-08-15')).toBe('2026-08');
      expect(extractYearMonth('nodate')).toBeNull();
      expect(extractYearMonth(null)).toBeNull();
    });

    test('quarterlyPartitioner routes to quarterly files', () => {
      const { quarterlyPartitioner, extractQuarter } = require('../lib/jsonlStore');
      expect(extractQuarter('2026-09-14')).toBe('2026-Q3');
      expect(extractQuarter('2026-01-05')).toBe('2026-Q1');
      const p = quarterlyPartitioner({ filePrefix: 'reports-' });
      expect(p('rpt_1', null, '2026-09-14')).toBe('reports-2026-Q3.jsonl');
      expect(p('rpt_2', { date: '2026-04-10' }, null)).toBe('reports-2026-Q2.jsonl');
    });

    test('annualPartitioner routes to annual files', () => {
      const { annualPartitioner, extractYear } = require('../lib/jsonlStore');
      expect(extractYear('2026-09-14')).toBe('2026');
      const p = annualPartitioner({ filePrefix: 'conversations-' });
      expect(p('conv_1', null, '2026-09-14')).toBe('conversations-2026.jsonl');
      expect(p('conv_2', { date: '2025-11-20' }, null)).toBe('conversations-2025.jsonl');
    });

    test('youtubeChannelPartitioner and singlePartitioner route properly', () => {
      const { youtubeChannelPartitioner, singlePartitioner } = require('../lib/jsonlStore');
      const ytP = youtubeChannelPartitioner();
      expect(ytP('ytt_1', { channelHandle: '@soicfinance' }, null)).toBe('soicfinance.jsonl');
      expect(ytP('ytt_2', { channelTitle: 'Anil Lamba' }, null)).toBe('anillamba.jsonl');
      const sP = singlePartitioner('soic.jsonl');
      expect(sP('lyt_1', null, null)).toBe('soic.jsonl');
    });

    test('timePartitioner uses hint, record, or id to determine partition', () => {
      const p = timePartitioner({ filePrefix: 'reports-' });
      expect(p('rpt_1', null, '2026-09-14')).toBe('reports-2026-09.jsonl');
      expect(p('rpt_2', { date: '2026-08-01' }, null)).toBe('reports-2026-08.jsonl');
      expect(p('rpt_foo_2026-07-20', null, null)).toBe('reports-2026-07.jsonl');
      expect(p('rpt_unknown', {}, null)).toBe('reports-unknown.jsonl');
    });

    test('hashPartitioner routes by first hex char of key', () => {
      const p = hashPartitioner({ filePrefix: 'shard_' });
      expect(p('a1b2c3d4', null, null)).toBe('shard_a.jsonl');
      expect(p('3fe89', null, null)).toBe('shard_3.jsonl');
      expect(p(null, null, 'f9e0')).toBe('shard_f.jsonl');
      expect(p('XYZ', null, null)).toBe('shard_0.jsonl');
    });

    test('hashPartitioner with md5: true computes MD5 bucket 0-f for any arbitrary ID', () => {
      const p = hashPartitioner({ filePrefix: 'shard_', md5: true });
      const crypto = require('crypto');
      const testIds = [
        'lyt_145316_4243641',
        'ytt_UCB7GnQlJPIL6rBBqEoX87vA_r1kQd3oNsmA',
        'custom_id',
      ];
      for (const id of testIds) {
        const expectedShard = crypto.createHash('md5').update(id).digest('hex')[0];
        expect(p(id, null, null)).toBe(`shard_${expectedShard}.jsonl`);
      }
    });

    test('domainPartitioner invokes custom keyFn', () => {
      const p = domainPartitioner({
        filePrefix: 'course_',
        keyFn: (id, rec, hint) => (rec && rec.courseId) || (hint && hint.courseId) || 'misc',
      });
      expect(p('lyt_1', { courseId: '145316' }, null)).toBe('course_145316.jsonl');
      expect(p('lyt_2', null, { courseId: '97711' })).toBe('course_97711.jsonl');
      expect(p('lyt_3', null, null)).toBe('course_misc.jsonl');
    });
  });

  describe('CRUD operations & deduplication', () => {
    test('appends and retrieves records accurately', () => {
      const store = new JsonlStore({
        baseDir: tmpDir,
        partitioner: timePartitioner({ filePrefix: 'data-' }),
      });

      store.set('item_1', { id: 'item_1', date: '2026-09-01', val: 10 });
      store.set('item_2', { id: 'item_2', date: '2026-09-02', val: 20 });
      store.set('item_3', { id: 'item_3', date: '2026-08-15', val: 30 });

      expect(store.get('item_1', '2026-09-01')).toEqual({
        id: 'item_1',
        date: '2026-09-01',
        val: 10,
      });
      expect(store.get('item_2', '2026-09-02').val).toBe(20);
      expect(store.get('item_3', '2026-08-15').val).toBe(30);
      expect(store.get('nonexistent', '2026-09-01')).toBeNull();

      // Check partitions on disk
      const partitions = store.listPartitions();
      expect(partitions).toEqual(['data-2026-08.jsonl', 'data-2026-09.jsonl']);
    });

    test('re-setting an ID updates the value (latest write wins)', () => {
      const store = new JsonlStore({
        baseDir: tmpDir,
        partitioner: timePartitioner({ filePrefix: 'data-' }),
      });

      store.set('item_1', { id: 'item_1', date: '2026-09-01', val: 100 });
      expect(store.get('item_1', '2026-09-01').val).toBe(100);

      store.set('item_1', { id: 'item_1', date: '2026-09-01', val: 200 });
      expect(store.get('item_1', '2026-09-01').val).toBe(200);

      // Verify that after cache clearing, reading fresh from disk still gives latest write
      store.clearMemoryCache();
      expect(store.get('item_1', '2026-09-01').val).toBe(200);
    });

    test('compact() removes duplicate lines on disk', () => {
      const store = new JsonlStore({
        baseDir: tmpDir,
        partitioner: timePartitioner({ filePrefix: 'data-' }),
      });

      store.set('item_1', { id: 'item_1', date: '2026-09-01', version: 1 });
      store.set('item_2', { id: 'item_2', date: '2026-09-01', version: 1 });
      store.set('item_1', { id: 'item_1', date: '2026-09-01', version: 2 });
      store.set('item_1', { id: 'item_1', date: '2026-09-01', version: 3 });

      const filePath = store.getPartitionPath('data-2026-09.jsonl');
      const linesBefore = fs
        .readFileSync(filePath, 'utf8')
        .split('\n')
        .filter((l) => l.trim().length > 0);
      expect(linesBefore.length).toBe(4);

      const stats = store.compact('data-2026-09.jsonl');
      expect(stats.beforeCount).toBe(4);
      expect(stats.afterCount).toBe(2);

      const linesAfter = fs
        .readFileSync(filePath, 'utf8')
        .split('\n')
        .filter((l) => l.trim().length > 0);
      expect(linesAfter.length).toBe(2);

      expect(store.get('item_1', '2026-09-01').version).toBe(3);
      expect(store.get('item_2', '2026-09-01').version).toBe(1);
    });

    test('find() and all() query across partitions', () => {
      const store = new JsonlStore({
        baseDir: tmpDir,
        partitioner: timePartitioner({ filePrefix: 'data-' }),
      });

      store.setMany([
        { id: 'a', date: '2026-08-01', category: 'A' },
        { id: 'b', date: '2026-08-02', category: 'B' },
        { id: 'c', date: '2026-09-01', category: 'A' },
      ]);

      const allA = store.find((r) => r.category === 'A');
      expect(allA).toHaveLength(2);
      expect(allA.map((r) => r.id).sort()).toEqual(['a', 'c']);

      const month08 = store.all('2026-08-01');
      expect(month08).toHaveLength(2);
    });
  });
});
