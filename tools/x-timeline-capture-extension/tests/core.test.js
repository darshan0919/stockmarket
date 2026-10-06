'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const tweet = (id, by, at, extra = {}) => ({
  __typename: 'Tweet',
  rest_id: id,
  core: { user_results: { result: { core: { screen_name: by } } } },
  legacy: {
    id_str: id,
    created_at: at,
    full_text: `text ${id}`,
    conversation_id_str: id,
    entities: { urls: [] },
    retweet_count: 1,
    reply_count: 2,
    favorite_count: 3,
    quote_count: 0,
    ...extra,
  },
});
const item = (t) => ({
  entryId: `tweet-${t.rest_id}`,
  content: { itemContent: { tweet_results: { result: t } } },
});

const fixture = {
  data: {
    user: {
      result: {
        timeline: {
          timeline: {
            instructions: [
              {
                type: 'TimelinePinEntry',
                entry: item(tweet('1', 'Exp', 'Mon Jan 01 10:00:00 +0000 2024')),
              },
              {
                type: 'TimelineAddEntries',
                entries: [
                  item(tweet('50', 'Exp', 'Tue Oct 06 10:00:00 +0000 2026')),
                  {
                    entryId: 'profile-conversation-9',
                    content: {
                      items: [
                        {
                          item: {
                            itemContent: {
                              tweet_results: {
                                result: tweet('60', 'Other', 'Mon Oct 05 09:00:00 +0000 2026'),
                              },
                            },
                          },
                        },
                        {
                          item: {
                            itemContent: {
                              tweet_results: {
                                result: tweet('61', 'Exp', 'Mon Oct 05 09:05:00 +0000 2026', {
                                  in_reply_to_status_id_str: '60',
                                  in_reply_to_screen_name: 'Other',
                                }),
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                  {
                    entryId: 'cursor-bottom-1',
                    content: { cursorType: 'Bottom', value: 'CUR123' },
                  },
                ],
              },
            ],
          },
        },
      },
    },
  },
};

test('parseTimeline reads items, conversation modules, pinned flag and bottom cursor', () => {
  const { rows, next } = C.parseTimeline(fixture);
  assert.equal(next, 'CUR123');
  assert.deepEqual(rows.map((r) => r.id).sort(), ['1', '50', '60', '61']);
  assert.equal(rows.find((r) => r.id === '1').pinned, true);
  assert.equal(rows.find((r) => r.id === '61').reply_to_user, 'Other');
  assert.deepEqual(rows.find((r) => r.id === '50').m, {
    rt: 1,
    rp: 2,
    lk: 3,
    qt: 0,
    vw: undefined,
  });
});

test('oldestOwnMs ignores the pinned post and other authors', () => {
  const { rows } = C.parseTimeline(fixture);
  assert.equal(new Date(C.oldestOwnMs(rows, 'exp')).toISOString(), '2026-10-05T09:05:00.000Z');
});

test('finalizeRows applies the start/end window and keeps reply parents as context', () => {
  const { rows } = C.parseTimeline(fixture);
  const day = (s) => new Date(s).getTime();
  const all = C.finalizeRows(rows, 'Exp', day('2026-10-01T00:00:00Z'), null)
    .map((r) => r.id)
    .sort();
  assert.deepEqual(all, ['50', '60', '61']); // pinned 2024 post excluded, parent 60 kept
  const onlyOct5 = C.finalizeRows(
    rows,
    'Exp',
    day('2026-10-05T00:00:00Z'),
    day('2026-10-05T23:59:59Z')
  )
    .map((r) => r.id)
    .sort();
  assert.deepEqual(onlyOct5, ['60', '61']);
});

test('parseOperationMeta scrapes query id, features and toggles', () => {
  const js =
    'x{queryId:"AbC-1_x",operationName:"UserRepliesTimeline",operationType:"query",metadata:{featureSwitches:["f_a","f_b","rweb_video_screen_enabled"],fieldToggles:["withArticlePlainText","withDmBlocks"]}}';
  const m = C.parseOperationMeta(js, 'UserRepliesTimeline');
  assert.equal(m.q, 'AbC-1_x');
  assert.deepEqual(C.flags(m), { f_a: true, f_b: true, rweb_video_screen_enabled: false });
  assert.deepEqual(C.toggles(m), { withArticlePlainText: true, withDmBlocks: false });
  assert.equal(C.parseOperationMeta(js, 'Nope'), null);
  const url = C.buildUrl('UserRepliesTimeline', m, m, { userId: '1' });
  assert.match(url, /graphql\/AbC-1_x\/UserRepliesTimeline\?variables=/);
});

test('parseHandles accepts urls, @handles, commas and dedupes', () => {
  assert.deepEqual(
    C.parseHandles(
      'https://x.com/SureshKBN, @Shashank1171\nsureshkbn  thechartist26/with_replies bad-handle!'
    ),
    ['SureshKBN', 'Shashank1171', 'thechartist26']
  );
});

test('manifest declares what the code uses', () => {
  const m = require('../manifest.json');
  for (const p of [
    'storage',
    'downloads',
    'alarms',
    'tabs',
    'scripting',
    'offscreen',
    'unlimitedStorage',
  ])
    assert.ok(m.permissions.includes(p), p);
  assert.ok(m.host_permissions.includes('https://x.com/*'));
});

const NOW = new Date('2026-10-06T12:00:00Z').getTime();
const DAY = 86400000;

test('planHandle: nothing cached -> one full pass to the interval start', () => {
  assert.deepEqual(C.planHandle(null, NOW, 30 * DAY), [
    { kind: 'full', cursor: null, stopAtMs: NOW - 30 * DAY },
  ]);
});

test('planHandle: fully cached interval needs nothing', () => {
  const cov = { fromMs: NOW - 400 * DAY, toMs: NOW - 60000, exhausted: false, olderCursor: 'C' };
  assert.deepEqual(C.planHandle(cov, NOW, 365 * DAY), []);
});

test('planHandle: stale newest edge -> cheap new pass down to the cached edge (minus overlap)', () => {
  const cov = { fromMs: NOW - 400 * DAY, toMs: NOW - 2 * DAY, exhausted: false, olderCursor: 'C' };
  const p = C.planHandle(cov, NOW, 365 * DAY);
  assert.equal(p.length, 1);
  assert.deepEqual(p[0], { kind: 'new', cursor: null, stopAtMs: cov.toMs - C.OVERLAP_MS });
});

test('planHandle: older request continues from the saved cursor; without one it re-walks', () => {
  const cov = { fromMs: NOW - 100 * DAY, toMs: NOW - 60000, exhausted: false, olderCursor: 'CUR' };
  assert.deepEqual(C.planHandle(cov, NOW, 365 * DAY), [
    { kind: 'older', cursor: 'CUR', stopAtMs: NOW - 365 * DAY, rewalk: false },
  ]);
  const noCur = C.planHandle({ ...cov, olderCursor: null }, NOW, 365 * DAY);
  assert.equal(noCur[0].rewalk, true);
});

test('planHandle: exhausted timeline never asks for older pages', () => {
  const cov = { fromMs: 0, toMs: NOW - 5 * DAY, exhausted: true, olderCursor: null };
  assert.deepEqual(
    C.planHandle(cov, NOW, 5000 * DAY).map((p) => p.kind),
    ['new']
  );
});

test('coveragePatch: partial new pass is not committed to coverage; final one extends toMs only', () => {
  const cov = { fromMs: 1000, toMs: 5000, exhausted: false, olderCursor: 'X' };
  const phase = { kind: 'new', startedAt: 9000, oldestMs: 4000 };
  assert.equal(C.coveragePatch(phase, cov, { final: false }), null);
  assert.deepEqual(C.coveragePatch(phase, cov, { final: true }), {
    fromMs: 1000,
    toMs: 9000,
    exhausted: false,
    olderCursor: 'X',
  });
});

test('coveragePatch: older/full record reached edge + cursor; exhausted records the beginning', () => {
  const cov = { fromMs: 5000, toMs: 9000 };
  assert.deepEqual(
    C.coveragePatch({ kind: 'older', oldestMs: 2000 }, cov, {
      exhausted: false,
      nextCursor: 'N',
      final: true,
    }),
    { fromMs: 2000, toMs: 9000, exhausted: false, olderCursor: 'N' }
  );
  assert.deepEqual(
    C.coveragePatch({ kind: 'full', startedAt: 8000, oldestMs: 100 }, null, {
      exhausted: true,
      nextCursor: null,
      final: true,
    }),
    { fromMs: 0, toMs: 8000, exhausted: true, olderCursor: null }
  );
});

test('describeJob: one active user, derived states, buttons and locking', () => {
  const now = 1_000_000;
  const mk = (o) => ({
    handles: ['a', 'b', 'c'],
    idx: 1,
    status: 'running',
    resumeAt: null,
    beat: now,
    summary: [],
    per: {
      a: { state: 'done' },
      b: { state: 'new', pages: 2, own: 40, oldest: '2026-08-01T00:00:00Z', pct: 30 },
      c: { state: 'queued' },
    },
    ...o,
  });
  let v = C.describeJob(mk(), now);
  assert.deepEqual(
    v.users.map((u) => u.state),
    ['done', 'active', 'queued']
  );
  assert.equal(v.headline, 'Capturing @b (2 of 3)');
  assert.equal(v.primary.action, 'pause');
  assert.ok(v.locked && v.canCancel);
  assert.equal(v.overallPct, Math.round(((1 + 0.3) / 3) * 100));
  v = C.describeJob(mk({ resumeAt: now + 125000 }), now);
  assert.equal(v.state, 'rate-limited');
  assert.match(v.headline, /2:05/);
  assert.equal(v.users[1].state, 'rate-limited');
  v = C.describeJob(mk({ status: 'paused' }), now);
  assert.equal(v.primary.action, 'resume');
  v = C.describeJob(mk({ beat: now - 120000 }), now);
  assert.match(v.detail, /No response from x.com/);
  v = C.describeJob(
    mk({
      status: 'done',
      idx: 3,
      per: { a: { state: 'done' }, b: { state: 'cached' }, c: { state: 'cached' } },
      summary: [{ final: true, rows: 12 }],
    }),
    now
  );
  assert.equal(v.primary.action, 'start');
  assert.ok(!v.locked && v.overallPct === 100);
  assert.match(v.headline, /12 new items/);
  assert.equal(C.describeJob(null, now).primary.action, 'start');
});

test('describeJob shows stored counts per user next to this-run counts', () => {
  const job = {
    handles: ['a'],
    idx: 0,
    status: 'running',
    resumeAt: null,
    beat: 1,
    summary: [],
    per: {
      a: {
        state: 'new',
        pages: 1,
        own: 5,
        oldest: '2026-08-01T00:00:00Z',
        pct: 10,
        counts: { posts: 2, replies: 3, reposts: 0 },
      },
    },
  };
  const v = C.describeJob(job, 1, [
    { handle: 'A', stats: { posts: 1200, replies: 3400, reposts: 7 } },
  ]);
  assert.match(v.users[0].detail, /This run: 2 posts · 3 replies · 0 reposts/);
  assert.match(v.users[0].detail, /Stored: 1,200 posts · 3,400 replies · 7 reposts/);
  assert.equal(C.storedLine(null), '');
});

test('planAll plans main, reposts and articles; articles always go back to the beginning', () => {
  const now = 1e12;
  const p = C.planAll(null, now, 7 * 86400000);
  assert.deepEqual(p.map((x) => x.stream), ['main', 'reposts', 'articles']);
  assert.equal(p[0].stopAtMs, now - 7 * 86400000);
  assert.ok(p[2].stopAtMs < now - 365 * 86400000);
  const cached = { fromMs: now - 400 * 86400000, toMs: now - 60000, exhausted: false, olderCursor: 'c' };
  const q = C.planAll({ main: cached, reposts: cached, articles: { ...cached, exhausted: true } }, now, 30 * 86400000);
  assert.equal(q.length, 0); // everything inside the saved ranges
});

test('assessCoverage: all recent items stored -> ok; missing in-range item -> gap + shortened range; stale claims dropped', () => {
  const DAY = 86400000, now = Date.UTC(2026, 9, 6);
  const mk = (id, ageDays) => ({ id, by: 'Exp', at: new Date(now - ageDays * DAY).toUTCString(), text: id });
  const cov = { fromMs: now - 100 * DAY, toMs: now - 1000, exhausted: false, olderCursor: null };
  let a = C.assessCoverage({ handle: 'Exp', stream: 'main', cov, newest: { rows: [mk('1', 1), mk('2', 2)] }, missing: new Set() });
  assert.equal(a.state, 'ok'); assert.equal(a.checked, 2); assert.equal(a.patch, null);
  a = C.assessCoverage({ handle: 'Exp', stream: 'main', cov, newest: { rows: [mk('1', 1), mk('2', 2)] }, missing: new Set(['2']) });
  assert.equal(a.state, 'gap'); assert.deepEqual(a.heal.map((r) => r.id), ['2']);
  assert.equal(a.patch.toMs, Date.parse(mk('2', 2).at) - 1);
  // items newer than the saved range are "new", not a gap (but are healed into the KB)
  const old = { ...cov, toMs: now - 30 * DAY };
  a = C.assessCoverage({ handle: 'Exp', stream: 'main', cov: old, newest: { rows: [mk('9', 1)] }, missing: new Set(['9']) });
  assert.equal(a.state, 'unchecked'); assert.equal(a.heal.length, 1); assert.equal(a.patch, null);
  // "from the beginning" claim with far fewer stored tweets than X reports -> dropped
  a = C.assessCoverage({ handle: 'Exp', stream: 'main', cov: { ...cov, exhausted: true }, newest: { rows: [mk('1', 1)] }, missing: new Set(), statuses: 1000, storedTotal: 234 });
  assert.equal(a.state, 'suspect'); assert.equal(a.patch.exhausted, false);
  a = C.assessCoverage({ handle: 'Exp', stream: 'main', cov: { ...cov, exhausted: true }, newest: { rows: [mk('1', 1)] }, missing: new Set(), statuses: 1000, storedTotal: 950 });
  assert.equal(a.state, 'ok');
  // cursor that lands on recent posts, or is rejected by X -> dropped
  const withCur = { ...cov, olderCursor: 'c' };
  a = C.assessCoverage({ handle: 'Exp', stream: 'main', cov: withCur, newest: { rows: [mk('1', 1)] }, edge: { rows: [mk('5', 2)] }, missing: new Set(), });
  assert.equal(a.patch.olderCursor, null); assert.equal(a.state, 'suspect');
  a = C.assessCoverage({ handle: 'Exp', stream: 'main', cov: withCur, newest: { rows: [mk('1', 1)] }, edgeError: 'HTTP 400', missing: new Set() });
  assert.equal(a.patch.olderCursor, null);
  a = C.assessCoverage({ handle: 'Exp', stream: 'main', cov: withCur, newest: { rows: [mk('1', 1)] }, edge: { rows: [mk('6', 99)] }, missing: new Set() });
  assert.equal(a.state, 'ok');
});

test('describeVerify summarises results per user and stream', () => {
  const v = { status: 'done', handles: ['a', 'b'], idx: 2, results: { a: { main: { state: 'ok', notes: [] }, reposts: { state: 'skipped', notes: [] } }, b: { main: { state: 'gap', notes: ['x'] } } } };
  const d = C.describeVerify(v);
  assert.match(d.headline, /1 of 2 checks need attention/);
  assert.equal(d.users[0].state, 'ok'); assert.equal(d.users[1].state, 'gap');
  assert.equal(C.describeVerify({ ...v, status: 'running', idx: 1 }).users[1].state, 'active');
});
