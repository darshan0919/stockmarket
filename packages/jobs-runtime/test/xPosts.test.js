'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildDocs, cmpId } = require('../lib/xPosts');

const row = (o) => ({ urls: [], media: [], m: {}, ...o });

describe('xPosts.buildDocs', () => {
  const rows = [
    row({
      id: '100',
      by: 'Exp',
      at: 'Mon Oct 05 10:00:00 +0000 2026',
      text: 'Thesis part 1 https://t.co/abc',
      conv: '100',
      m: { lk: 10, vw: 500 },
    }),
    row({
      id: '101',
      by: 'Exp',
      at: 'Mon Oct 05 10:01:00 +0000 2026',
      text: 'Thesis part 2',
      conv: '100',
      reply_to: '100',
      reply_to_user: 'Exp',
      m: { lk: 4, vw: 300 },
    }),
    row({
      id: '200',
      by: 'Other',
      at: 'Mon Oct 05 11:00:00 +0000 2026',
      text: 'Is X cheap?',
      conv: '200',
    }),
    row({
      id: '201',
      by: 'Exp',
      at: 'Mon Oct 05 11:05:00 +0000 2026',
      text: 'Not at 40x PE',
      conv: '200',
      reply_to: '200',
      reply_to_user: 'Other',
    }),
    row({
      id: '300',
      by: 'Exp',
      at: 'Mon Oct 05 12:00:00 +0000 2026',
      text: 'RT @Other: noise',
      conv: '300',
      rt: { id: '999' },
    }),
    row({
      id: '400',
      by: 'Exp',
      at: 'Mon Oct 05 13:00:00 +0000 2026',
      text: 'Agree',
      conv: '400',
      quoted: { id: '401', by: 'Other', text: 'Original claim' },
      urls: ['https://example.com/report.pdf', 'https://x.com/Exp/status/100'],
    }),
  ];

  const docs = buildDocs(rows, 'Exp', { name: 'Expert' });

  test('joins self-thread into one doc and strips t.co links', () => {
    const thread = docs.find((d) => d.rootId === '100');
    expect(thread.kind).toBe('thread');
    expect(thread.tweetIds).toEqual(['100', '101']);
    expect(thread.text).toBe('Thesis part 1\n\nThesis part 2');
    expect(thread.metrics.likes).toBe(14);
    expect(thread.metrics.views).toBe(500);
  });

  test('keeps reply with parent context', () => {
    const reply = docs.find((d) => d.rootId === '201');
    expect(reply.kind).toBe('reply');
    expect(reply.context).toMatchObject({ by: 'Other', text: 'Is X cheap?' });
  });

  test('drops pure retweets and other authors', () => {
    expect(docs.find((d) => d.rootId === '300')).toBeUndefined();
    expect(docs.find((d) => d.rootId === '200')).toBeUndefined();
  });

  test('quote keeps quoted text as context and external links only', () => {
    const q = docs.find((d) => d.rootId === '400');
    expect(q.kind).toBe('quote');
    expect(q.context.text).toBe('Original claim');
    expect(q.urls).toEqual(['https://example.com/report.pdf']);
  });

  test('compares snowflake ids beyond 2^53', () => {
    expect(cmpId('1975000000000000001', '1975000000000000002')).toBe(-1);
  });
});

describe('db.saveXPosts', () => {
  let tmp;
  let db;
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xposts-'));
    process.env.DATA_V2_DIR = tmp;
    jest.resetModules();
    db = require('../lib/db');
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  test('writes shard + slim index and re-import is idempotent', () => {
    const mk = () =>
      buildDocs(
        [
          row({
            id: '1',
            by: 'Exp',
            at: 'Mon Oct 05 10:00:00 +0000 2026',
            text: 'hello market',
            conv: '1',
          }),
        ],
        'Exp'
      ).map((d) => ({ ...d, creator: 'x-posts-import' }));
    db.saveXPosts(mk());
    db.saveXPosts(mk());
    const idx = JSON.parse(fs.readFileSync(path.join(tmp, 'x-posts.json'), 'utf8'));
    expect(Object.keys(idx)).toHaveLength(1);
    const rec = Object.values(idx)[0];
    expect(rec.preview).toBe('hello market');
    expect(rec.body).toMatch(/^x-posts\/shard_[0-9a-f]\.jsonl$/);
    const shards = fs.readdirSync(path.join(tmp, 'x-posts'));
    const lines = shards.flatMap((f) =>
      fs
        .readFileSync(path.join(tmp, 'x-posts', f), 'utf8')
        .trim()
        .split('\n')
    );
    // shards are append-logs (last write wins on load, same as youtube-transcripts)
    const ids = new Set(lines.map((l) => JSON.parse(l).id));
    expect(ids.size).toBe(1);
  });
});
