// Service-worker simulation (fake chrome.* + fake X responses). Needs: npm i --no-save fake-indexeddb
// Run: node tools/x-timeline-capture-extension/tests/worker-sim.js tools/x-timeline-capture-extension
// Service-worker simulation (fake chrome.* + fake X responses). Needs: npm i --no-save fake-indexeddb
// Run: node tools/x-timeline-capture-extension/tests/worker-sim.js tools/x-timeline-capture-extension
require('fake-indexeddb/auto');
const fs = require('fs'), vm = require('vm');
const EXT = process.argv[2];
const store = {}; const alarms = {}; const hostLog = []; let pages = []; let mode = 'ok'; let cfgExpert = { handle: 'Exp', name: 'Exp', selected: true, coverage: null, coverageBy: {} }; let kbMissing = [];
const listeners = {};
const chrome = {
  storage: { local: {
    get: async (k) => { if (typeof k === 'string') return { [k]: store[k] }; const o = {}; for (const x of [].concat(k)) o[x] = store[x]; return o; },
    set: async (o) => { Object.assign(store, JSON.parse(JSON.stringify(o))); },
    remove: async (k) => { delete store[k]; } } },
  alarms: { create: (n, o) => { alarms[n] = o; }, get: (n, cb) => cb(alarms[n]), clear: (n) => { delete alarms[n]; }, onAlarm: { addListener: (f) => (listeners.alarm = f) } },
  runtime: {
    lastError: null,
    sendNativeMessage: (host, msg, cb) => { hostLog.push(msg); if (msg.type === 'getConfig') return cb({ ok: true, config: { settings: {}, experts: [cfgExpert] } }); if (msg.type === 'commit') return cb({ ok: true, rowsAdded: msg.rows.length, docsWritten: 0, config: { settings: {}, experts: [{ handle: 'Exp', coverage: msg.stream === 'main' ? msg.coverage : null, coverageBy: {} }] } }); if (msg.type === 'checkIds') return cb({ ok: true, missing: msg.ids.filter((i) => kbMissing.includes(i)) }); cb({ ok: true }); },
    onMessage: { addListener: (f) => (listeners.msg = f) }, onStartup: { addListener() {} }, onInstalled: { addListener() {} },
    getContexts: async () => [], sendMessage: async () => ({}) },
  tabs: { query: async () => [{ id: 1, status: 'complete' }], get: async () => ({ id: 1, status: 'complete' }), create: async () => ({ id: 1 }),
    sendMessage: async (id, m) => { if (m.type === 'XCAP_PING') return { ok: true }; return pages.shift() || { status: 200, userId: 'u', rows: [], next: null }; } },
  scripting: { executeScript: async () => {} }, offscreen: {}, downloads: {},
};
const ctx = { chrome, indexedDB, IDBKeyRange, console, setTimeout, clearTimeout, Promise, JSON, Date, Math };
ctx.self = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
ctx.importScripts = (f) => vm.runInContext(fs.readFileSync(EXT + '/' + f, 'utf8'), ctx);
vm.runInContext(fs.readFileSync(EXT + '/background.js', 'utf8'), ctx);
const send = (m) => new Promise((r) => { const ret = listeners.msg(m, {}, r); if (!ret) r(null); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (d) => new Date(Date.now() - d * 86400000).toUTCString().replace('GMT', '+0000');
const row = (id, d, extra = {}) => ({ id, by: 'Exp', at: T(d), text: 't' + id, conv: id, ...extra });
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  // 1) rate limit mid-run flushes rows + partial coverage to the host
  pages = [{ status: 200, userId: 'u', rows: [row('1', 1), row('2', 2)], next: 'c1' }, { status: 429, resetAt: Math.floor(Date.now() / 1000) + 600 }];
  await send({ type: 'XCAP_START', handles: ['Exp'], intervalDays: 365 });
  await wait(3500);
  let commits = hostLog.filter((m) => m.type === 'commit');
  assert(commits.length === 1 && commits[0].rows.length === 2, 'rate limit: rows flushed to KB (' + commits.length + ' commit, ' + (commits[0] && commits[0].rows.length) + ' rows)');
  assert(commits[0] && commits[0].coverage && commits[0].stream === 'main' && commits[0].coverage.olderCursor === 'c1', 'rate limit: partial coverage carries the older cursor');
  const j = store.job; assert(j.status === 'running' && j.resumeAt > Date.now() && j.dirty === false, 'rate limit: job waiting, clean');
  // 2) resume then pause: flush on pause
  j.resumeAt = null; store.job = j; hostLog.length = 0;
  pages = [{ status: 200, userId: 'u', rows: [row('3', 3)], next: 'c2' }, { status: 200, userId: 'u', rows: [row('4', 4)], next: 'c3' }, { status: 200, userId: 'u', rows: [row('5', 5)], next: 'c4' }];
  listeners.alarm({ name: 'xcap-tick' });
  await wait(1600);
  await send({ type: 'XCAP_STOP' });
  await wait(2500);
  commits = hostLog.filter((m) => m.type === 'commit');
  assert(store.job.status === 'paused', 'pause: status stays paused (in-flight step did not overwrite it) -> ' + store.job.status);
  assert(commits.length >= 1 && commits.reduce((a, c) => a + c.rows.length, 0) >= 1, 'pause: fetched rows flushed to KB (' + commits.reduce((a, c) => a + c.rows.length, 0) + ' rows)');
  assert(store.job.dirty === false, 'pause: nothing left unsaved');
  // 3) cancel does not get resurrected by an in-flight step
  await send({ type: 'XCAP_CANCEL' });
  await wait(1500);
  assert(!store.job, 'cancel: job stays removed');
  // 3a) cancel while running = pause for the data: fetched rows + resume cursor are saved, only the job is dropped
  hostLog.length = 0;
  pages = [1, 2, 3, 4, 5, 6].map((i) => ({ status: 200, userId: 'u', rows: [row('c' + i, 40 + i)], next: 'cc' + i }));
  await send({ type: 'XCAP_START', handles: ['Exp'], intervalDays: 365 });
  await wait(1800);
  const rc = await send({ type: 'XCAP_CANCEL' });
  await wait(1500);
  commits = hostLog.filter((m) => m.type === 'commit');
  const cRows = commits.reduce((n, c) => n + c.rows.length, 0);
  assert(rc && rc.ok === true && !store.job, 'cancel(running): job dropped, ok');
  assert(cRows >= 1, 'cancel(running): fetched rows written to the KB first (' + cRows + ' rows)');
  const lastCov = commits.length ? commits[commits.length - 1].coverage : null;
  assert(lastCov && lastCov.olderCursor, 'cancel(running): resume cursor saved in coverage -> ' + (lastCov && lastCov.olderCursor));
  // 3b) regression: job saved by the previous version (flat cov, no stream on phases, no counts)
  await send({ type: 'XCAP_CANCEL' });
  store.job = { id: 1, auto: false, handles: ['Exp'], intervalMs: 30 * 86400000, cov: { exp: { fromMs: Date.now() - 9e9, toMs: Date.now() - 1000, exhausted: false, olderCursor: 'oc' } },
    plans: { Exp: [] }, per: { Exp: { state: 'older', own: 3, pages: 2, oldest: null } }, idx: 0, userId: 'u', cursor: 'oc',
    phase: { kind: 'older', cursor: 'oc', stopAtMs: Date.now() - 20 * 86400000, startedAt: Date.now(), pages: 1, oldestMs: Date.now() - 5 * 86400000, emptyStreak: 0 },
    status: 'running', resumeAt: null, error: null, summary: [] };
  hostLog.length = 0;
  pages = [{ status: 200, userId: 'u', rows: [row('90', 25)], next: null }];
  listeners.alarm({ name: 'xcap-tick' });
  await wait(2500);
  assert(store.job && store.job.error == null, 'old-format job resumes without error: ' + (store.job && store.job.error));
  assert(hostLog.some((m) => m.type === 'commit' && m.stream === 'main'), 'old-format job commits through the new path');
  await send({ type: 'XCAP_CANCEL' });
  // 3c) regression: pages whose rows are already stored (retry/resume) must NOT be taken as "end of timeline"
  hostLog.length = 0;
  const rep = (n, nxt) => ({ status: 200, userId: 'u', rows: [row('77', 1)], next: nxt });
  pages = [rep(1, 'a'), rep(2, 'b'), rep(3, 'c'), rep(4, null), { status: 200, userId: 'u', rows: [], next: null }, { status: 200, userId: 'u', rows: [], next: null }];
  const f2 = []; const o2 = chrome.tabs.sendMessage;
  chrome.tabs.sendMessage = async (id, m) => { if (m.type === 'XCAP_FETCH_PAGE') f2.push(m.stream); return o2(id, m); };
  await send({ type: 'XCAP_START', handles: ['Exp'], intervalDays: 30 });
  await wait(7500);
  chrome.tabs.sendMessage = o2;
  const mainFetches = f2.filter((x) => x === 'main').length;
  const mainCommit = hostLog.filter((m) => m.type === 'commit' && m.stream === 'main').pop();
  assert(mainFetches === 4, 'duplicate rows do not end the walk early: main pages fetched = ' + mainFetches);
  assert(mainCommit && mainCommit.coverage && mainCommit.coverage.exhausted === true, 'exhausted only when X has no next cursor');
  await send({ type: 'XCAP_CANCEL' });
  // 4) all three streams run for one user and each commits with its own stream tag
  hostLog.length = 0;
  pages = [
    { status: 200, userId: 'u', rows: [row('11', 1)], next: null },
    { status: 200, userId: 'u', rows: [row('12', 1)], next: null }, // Posts tab (UserTweets): originals live here
    { status: 200, userId: 'u', rows: [{ id: '21', by: 'Exp', at: T(1), text: 'RT @A: x', conv: '21', rt: { id: '99', by: 'A', text: 'x' } }], next: null },
    { status: 200, userId: 'u', rows: [row('31', 2, { article: { title: 'T', text: 'body' } })], next: null },
  ];
  const fetched = [];
  const orig = chrome.tabs.sendMessage;
  chrome.tabs.sendMessage = async (id, m) => { if (m.type === 'XCAP_FETCH_PAGE') fetched.push(m.stream); return orig(id, m); };
  await send({ type: 'XCAP_START', handles: ['Exp'], intervalDays: 30 });
  await wait(6500);
  commits = hostLog.filter((m) => m.type === 'commit');
  assert(JSON.stringify(fetched) === JSON.stringify(['main', 'posts', 'reposts', 'articles']), 'streams fetched in order: ' + fetched.join(','));
  assert(commits.map((c) => c.stream).join(',') === 'main,posts,reposts,articles', 'each stream committed with its tag: ' + commits.map((c) => c.stream).join(','));
  assert(store.job.status === 'done' && store.job.per.Exp.counts.reposts === 1 && store.job.per.Exp.counts.articles === 1, 'job done with live counts ' + JSON.stringify(store.job.per.Exp.counts));
  // 5) Verify: heals a missing in-range item, shortens the range, drops a "from the beginning" claim that the counts contradict
  await send({ type: 'XCAP_CANCEL' });
  const nowMs = Date.now();
  cfgExpert = { handle: 'Exp', name: 'Exp', selected: true, stats: { posts: 100, replies: 134, reposts: 0 }, coverageBy: {},
    coverage: { fromMs: 0, toMs: nowMs - 1000, exhausted: true, olderCursor: null } };
  kbMissing = ['v2'];
  hostLog.length = 0;
  pages = [{ status: 200, userId: 'u', statusesCount: 1000, rows: [row('v1', 1), row('v2', 2), row('v3', 3)], next: 'n' }];
  const vr = await send({ type: 'XCAP_VERIFY', handles: ['Exp'] });
  await wait(1500);
  const vj = store.vjob;
  const healed = hostLog.find((m) => m.type === 'commit' && m.rows.some((r) => r.id === 'v2'));
  const setc = hostLog.find((m) => m.type === 'setCoverage' && m.stream === 'main');
  assert(vr && vr.ok && vj && vj.status === 'done', 'verify finishes: ' + JSON.stringify(vr) + ' ' + (vj && vj.status + ' ' + vj.error));
  assert(!!healed, 'verify heals the missing item into the KB');
  assert(setc && setc.coverage.exhausted === false && setc.coverage.toMs < nowMs - 1.5 * 86400000 && setc.coverage.verify.state === 'gap', 'verify shortens the range and drops the exhausted claim: ' + (setc && JSON.stringify(setc.coverage)));
  assert(vj.results.Exp.reposts.state === 'skipped', 'verify skips streams never captured');
  assert((await send({ type: 'XCAP_VERIFY', handles: ['Exp'] })).ok === true, 'verify can run again');
  await wait(800);
  store.job = { id: 5, handles: ['Exp'], status: 'running', per: {}, cov: {}, plans: {}, idx: 0 };
  assert((await send({ type: 'XCAP_VERIFY', handles: ['Exp'] })).ok === false, 'verify refuses while a capture is active');
  process.exit();
})();
