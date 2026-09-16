'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const StorageService = require('@stock/cloud-utils').StorageService;

describe('Zero loose files & clean cutover verification', () => {
  const root = db.dataRoot();

  test('only .jsonl files exist in reports/', () => {
    const dir = path.join(root, 'reports');
    if (fs.existsSync(dir)) {
      const nonJsonl = fs
        .readdirSync(dir)
        .filter((f) => !f.endsWith('.jsonl') && !f.startsWith('.'));
      expect(nonJsonl).toEqual([]);
    }
  });

  test('only .jsonl files exist in conversations/', () => {
    const dir = path.join(root, 'conversations');
    if (fs.existsSync(dir)) {
      const nonJsonl = fs
        .readdirSync(dir)
        .filter((f) => !f.endsWith('.jsonl') && !f.startsWith('.'));
      expect(nonJsonl).toEqual([]);
    }
  });

  test('only .jsonl files exist in learnyst-lessons/', () => {
    const dir = path.join(root, 'learnyst-lessons');
    if (fs.existsSync(dir)) {
      const nonJsonl = fs
        .readdirSync(dir)
        .filter((f) => !f.endsWith('.jsonl') && !f.startsWith('.'));
      expect(nonJsonl).toEqual([]);
    }
  });

  test('only .jsonl files exist in youtube-transcripts/', () => {
    const dir = path.join(root, 'youtube-transcripts');
    if (fs.existsSync(dir)) {
      const nonJsonl = fs
        .readdirSync(dir)
        .filter((f) => !f.endsWith('.jsonl') && !f.startsWith('.'));
      expect(nonJsonl).toEqual([]);
    }
  });

  test('only shard_*.jsonl files exist in sharded cache directories', () => {
    const cacheDirs = ['cache/pdf-text', 'cache/pdf-text-full', 'cache/monthly-updates-text'];

    for (const c of cacheDirs) {
      const dir = path.join(root, c);
      if (fs.existsSync(dir)) {
        const nonShard = fs
          .readdirSync(dir)
          .filter((f) => !f.endsWith('.jsonl') && !f.startsWith('.'));
        expect(nonShard).toEqual([]);
      }
    }
  });

  test('only designated .jsonl files exist in single cache directories', () => {
    const singleDirs = [
      { dir: 'cache/monthly-updates-parsed', expected: ['parsed.jsonl'] },
      {
        dir: 'cache/doc-extracts',
        expected: ['annual_report.jsonl', 'ppt.jsonl', 'announcement.jsonl', '_calibration.jsonl'],
      },
      { dir: 'cache/gainers-scanner', expected: ['scanner.jsonl'] },
      { dir: 'cache/monthly-updates-scan', expected: ['scans.jsonl'] },
      { dir: 'cache/stockscans-context', expected: ['context.jsonl'] },
      { dir: 'cache/company-baselines', expected: ['baselines.jsonl'] },
      { dir: 'cache/event-reaction', expected: ['reactions.jsonl'] },
      { dir: 'cache/order-announcements', expected: ['announcements.jsonl'] },
      { dir: 'cache/concall-notes', expected: ['notes.jsonl'] },
      { dir: 'cache/rerating-catalysts', expected: ['briefs.jsonl', 'filings.jsonl'] },
    ];
    for (const item of singleDirs) {
      const dir = path.join(root, item.dir);
      if (fs.existsSync(dir)) {
        const jsonls = fs
          .readdirSync(dir)
          .filter((f) => f.endsWith('.jsonl'))
          .sort();
        expect(jsonls).toEqual(item.expected.sort());
      }
    }
  });

  test('consolidated annual streams exist in runs/', () => {
    const runsDir = path.join(root, 'runs');
    if (fs.existsSync(runsDir)) {
      const jsonls = fs.readdirSync(runsDir).filter((f) => f.endsWith('.jsonl'));
      expect(jsonls.length).toBeGreaterThanOrEqual(6);
    }
  });

  test('reading non-existent keys returns null without error', () => {
    expect(db.readReport('rpt_nonexistent_2026-09-01')).toBeNull();
    expect(db.readConversation('conv_nonexistent_2026-09-01')).toBeNull();
    expect(db.readLearnystTranscript('lyt_nonexistent_12345')).toBeNull();
    expect(db.readYoutubeTranscript('ytt_nonexistent_67890')).toBeNull();
    expect(
      StorageService.readJson('cache/pdf-text/00000000000000000000000000000000.json')
    ).toBeNull();
  });
});
