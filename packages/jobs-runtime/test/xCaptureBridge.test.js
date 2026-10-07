'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const EXT = path.resolve(__dirname, '../../../tools/x-timeline-capture-extension');
const row = (o) => ({ urls: [], media: [], m: {}, ...o });
const T = (min) => `Mon Oct 05 10:${String(min).padStart(2, '0')}:00 +0000 2026`;

let tmp;
let experts;
let capture;
let handlers;
let db;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xcap-'));
  process.env.DATA_V2_DIR = tmp;
  jest.resetModules();
  db = require('../lib/db');
  experts = require('../lib/xExperts');
  capture = require('../lib/xCapture');
  handlers = require(path.join(EXT, 'native-host/handlers'));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('xExperts', () => {
  test('defaults: 4 experts, all selected, ishmohit1 merges into soic', () => {
    const cfg = experts.publicConfig();
    expect(cfg.experts).toHaveLength(4);
    expect(cfg.experts.every((e) => e.selected)).toBe(true);
    expect(experts.load().experts.ishmohit1.mergeInto).toBe('soic');
  });

  test('selection persists to disk and survives reload', () => {
    experts.setSelected(['shashank1171']);
    const sel = experts
      .publicConfig()
      .experts.filter((e) => e.selected)
      .map((e) => e.handle);
    expect(sel).toEqual(['Shashank1171']);
    expect(
      JSON.parse(fs.readFileSync(experts.registryPath(), 'utf8')).experts.shashank1171.selected
    ).toBe(true);
  });

  test('addExpert is idempotent and validates the handle', () => {
    experts.addExpert('@newguy', 'New Guy');
    experts.addExpert('newguy');
    expect(Object.keys(experts.load().experts).filter((k) => k === 'newguy')).toHaveLength(1);
    expect(() => experts.addExpert('bad handle!')).toThrow();
  });

  test('applyCoverage: overlap unions, disjoint newer replaces, disjoint older ignored', () => {
    const a = { fromMs: 100, toMs: 200, exhausted: false, olderCursor: 'c1' };
    expect(experts.applyCoverage(a, { fromMs: 50, toMs: 150, olderCursor: 'c0' })).toMatchObject({
      fromMs: 50,
      toMs: 200,
      olderCursor: 'c0',
    });
    expect(experts.applyCoverage(a, { fromMs: 300, toMs: 400 })).toMatchObject({
      fromMs: 300,
      toMs: 400,
    });
    expect(experts.applyCoverage(a, { fromMs: 10, toMs: 20 })).toMatchObject({
      fromMs: 100,
      toMs: 200,
    });
    expect(experts.applyCoverage(null, { fromMs: 1, toMs: 2, exhausted: true }).exhausted).toBe(
      true
    );
  });
});

describe('xCapture.commitRows', () => {
  const own = (id, min, extra = {}) =>
    row({ id, by: 'Exp', at: T(min), text: `post ${id}`, conv: id, ...extra });

  test('writes docs, raw cache and coverage; re-commit is a no-op for raw', () => {
    const rows = [own('1', 1), own('2', 2)];
    const r1 = capture.commitRows('Exp', rows, { coverage: { fromMs: 1000, toMs: 2000 } });
    expect(fs.readFileSync(capture.rawPath('Exp'), 'utf8').trim().split('\n')).toHaveLength(2);
    expect(experts.load().experts.exp.coverage).toMatchObject({ fromMs: 1000, toMs: 2000 });
    capture.commitRows('Exp', rows);
    expect(fs.readFileSync(capture.rawPath('Exp'), 'utf8').trim().split('\n')).toHaveLength(2);
    expect(r1).toBeDefined();
  });

  test('a later run extends a self-thread built from rows of an earlier run', () => {
    capture.commitRows('Exp', [own('10', 1, { m: { lk: 1 } })]);
    capture.commitRows('Exp', [own('11', 2, { conv: '10', reply_to: '10', reply_to_user: 'Exp' })]);
    const docs = [...capture.loadRaw('Exp').values()];
    expect(docs).toHaveLength(2);
    const { buildDocs } = require('../lib/xPosts');
    const thread = buildDocs(docs, 'Exp').find((d) => d.rootId === '10');
    expect(thread.tweetIds).toEqual(['10', '11']);
  });
});

describe('stored stats', () => {
  test('counts posts, replies, quotes and reposts per tweet; stored in the registry and sent to the extension', () => {
    const rows = [
      row({ id: '1', by: 'Exp', at: T(1), text: 'a', conv: '1' }),
      row({
        id: '2',
        by: 'Exp',
        at: T(2),
        text: 'b',
        conv: '1',
        reply_to: '1',
        reply_to_user: 'Exp',
      }),
      row({
        id: '3',
        by: 'Exp',
        at: T(3),
        text: 'c',
        conv: '3',
        reply_to: '9',
        reply_to_user: 'Other',
      }),
      row({
        id: '4',
        by: 'Exp',
        at: T(4),
        text: 'd',
        conv: '4',
        quoted: { id: '8', by: 'Other', text: 'q' },
      }),
      row({ id: '5', by: 'Exp', at: T(5), text: 'RT @Other: x', conv: '5', rt: { id: '7' } }),
    ];
    capture.commitRows('Exp', rows);
    const s = experts.publicConfig().experts.find((e) => e.handle === 'Exp').stats;
    expect(s).toMatchObject({ posts: 3, replies: 1, quotes: 1, reposts: 1 });
  });
});

describe('reposts and articles', () => {
  test('reposts become searchable docs labelled with the original author; articles are counted; streams keep separate coverage', () => {
    const rt = row({ id: '7', by: 'Other', at: T(0), text: 'Margin of safety matters', conv: '7' });
    const rows = [
      row({ id: '50', by: 'Exp', at: T(5), text: 'RT @Other: Margin of safety matters', conv: '50', rt }),
      row({ id: '51', by: 'Exp', at: T(6), text: 'My article', conv: '51', article: { title: 'Deep dive', text: 'long body' } }),
    ];
    capture.commitRows('Exp', rows.slice(0, 1), { coverage: { fromMs: 1, toMs: 9 }, stream: 'reposts' });
    capture.commitRows('Exp', rows.slice(1), { coverage: { fromMs: 2, toMs: 8, exhausted: true }, stream: 'articles' });
    const e = experts.publicConfig().experts.find((x) => x.handle === 'Exp');
    expect(e.coverage).toBeNull();
    expect(e.coverageBy.reposts).toMatchObject({ fromMs: 1, toMs: 9 });
    expect(e.coverageBy.articles.exhausted).toBe(true);
    expect(e.stats).toMatchObject({ reposts: 1, articles: 1 });
    const { buildDocs } = require('../lib/xPosts');
    const docs = buildDocs([...capture.loadRaw('Exp').values()], 'Exp');
    const rp = docs.find((d) => d.kind === 'repost');
    expect(rp.text).toBe('Margin of safety matters');
    expect(rp.context.by).toBe('Other');
    expect(docs.find((d) => d.rootId === '51').articles[0].title).toBe('Deep dive');
  });
});

describe('originals stream', () => {
  test('originals stream keeps its own coverage and its rows are stored', () => {
    capture.commitRows('Exp', [row({ id: '70', by: 'Exp', at: T(3), text: 'An original post', conv: '70' })], { coverage: { fromMs: 5, toMs: 15 }, stream: 'originals' });
    const e = experts.publicConfig().experts.find((x) => x.handle === 'Exp');
    expect(e.coverage).toBeNull();
    expect(e.coverageBy.originals).toMatchObject({ fromMs: 5, toMs: 15 });
    expect(capture.loadRaw('Exp').has('70')).toBe(true);
  });
});

describe('verify support in the host', () => {
  test('checkIds returns only ids missing from the KB; setCoverage replaces (can shrink) a range', () => {
    handlers.safeHandle({ type: 'commit', handle: 'Exp', rows: [row({ id: '1', by: 'Exp', at: T(1), text: 'a', conv: '1' })], coverage: { fromMs: 0, toMs: 100, exhausted: true } });
    expect(handlers.safeHandle({ type: 'checkIds', handle: 'Exp', ids: ['1', '2'] }).missing).toEqual(['2']);
    expect(handlers.safeHandle({ type: 'checkIds', handle: 'Exp' }).ok).toBe(false);
    const r = handlers.safeHandle({ type: 'setCoverage', handle: 'Exp', stream: 'main', coverage: { fromMs: 50, toMs: 60, exhausted: false } });
    expect(r.config.experts.find((e) => e.handle === 'Exp').coverage).toMatchObject({ fromMs: 50, toMs: 60, exhausted: false });
    handlers.safeHandle({ type: 'setCoverage', handle: 'Exp', stream: 'reposts', coverage: { fromMs: 1, toMs: 2 } });
    handlers.safeHandle({ type: 'setCoverage', handle: 'Exp', stream: 'reposts', coverage: null });
    expect(experts.load().experts.exp.coverageBy.reposts).toBeUndefined();
  });
});

describe('native host handlers', () => {
  test('ping / getConfig / setSelected / unknown', () => {
    expect(handlers.safeHandle({ type: 'ping' }).ok).toBe(true);
    expect(handlers.safeHandle({ type: 'getConfig' }).config.experts).toHaveLength(4);
    const r = handlers.safeHandle({ type: 'setSelected', handles: ['SureshKBN'] });
    expect(r.config.experts.filter((e) => e.selected)).toHaveLength(1);
    expect(handlers.safeHandle({ type: 'nope' }).ok).toBe(false);
  });

  test('commit validates input and advances coverage', () => {
    expect(handlers.safeHandle({ type: 'commit', handle: 'SureshKBN' }).ok).toBe(false);
    const r = handlers.safeHandle({
      type: 'commit',
      handle: 'SureshKBN',
      rows: [row({ id: '5', by: 'SureshKBN', at: T(5), text: 'hello', conv: '5' })],
      coverage: { fromMs: 5, toMs: 9, exhausted: true },
    });
    expect(r.ok).toBe(true);
    const s = r.config.experts.find((e) => e.handle === 'SureshKBN');
    expect(s.coverage).toMatchObject({ fromMs: 5, toMs: 9, exhausted: true });
  });
});

describe('native host stdio framing', () => {
  test('length-prefixed request returns length-prefixed reply', () => {
    const body = Buffer.from(JSON.stringify({ type: 'ping' }));
    const head = Buffer.alloc(4);
    head.writeUInt32LE(body.length, 0);
    const res = spawnSync(process.execPath, [path.join(EXT, 'native-host/host.js')], {
      input: Buffer.concat([head, body]),
      env: { ...process.env, DATA_V2_DIR: tmp },
    });
    const len = res.stdout.readUInt32LE(0);
    expect(JSON.parse(res.stdout.subarray(4, 4 + len).toString())).toMatchObject({ ok: true });
  });
});

describe('install helpers', () => {
  const inst = require(path.join(EXT, 'native-host/install'));
  test('extension id derived from manifest key matches the pinned id', () => {
    const key = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')).key;
    expect(inst.extensionIdFromKey(key)).toMatch(/^[a-p]{32}$/);
    expect(inst.extensionIdFromKey(key)).toBe('okbgiakbbchmpifkhdocihneopfginjf');
  });
  test('manifest dir per platform and host manifest origin', () => {
    expect(inst.manifestDir('chrome', 'darwin', '/h')).toBe(
      '/h/Library/Application Support/Google/Chrome/NativeMessagingHosts'
    );
    expect(inst.manifestDir('chrome', 'linux', '/h')).toBe(
      '/h/.config/google-chrome/NativeMessagingHosts'
    );
    expect(() => inst.manifestDir('chrome', 'win32', '/h')).toThrow();
    expect(
      inst.buildHostManifest({ launcherPath: '/x', extensionId: 'abc' }).allowed_origins
    ).toEqual(['chrome-extension://abc/']);
  });
});
