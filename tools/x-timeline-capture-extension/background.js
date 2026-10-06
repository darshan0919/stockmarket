/**
 * background.js — job runner (MV3 service worker).
 *
 * Job = { handles[], intervalMs }. For each handle, planHandle() (core.js) decides from the cached coverage in
 * the KB what is still missing; phases are paged newest -> oldest (content.js fetches inside your logged-in x.com
 * tab) and committed to the repo KB through the native-messaging host, which also advances the coverage map.
 * Job state lives in chrome.storage.local and tweets in IndexedDB until committed, so rate-limit waits,
 * worker restarts and browser restarts resume where they stopped. If the host is not installed, captures fall
 * back to a JSON download (no KB write, no caching).
 */
importScripts('core.js');
const C = self.XCap;

const HOST = 'com.stockmarket.x_kb';
const DB_NAME = 'xcap';
const TICK = 'xcap-tick';
const RESUME = 'xcap-resume'; // separate name: creating an alarm replaces any alarm with the same name
const DAILY = 'xcap-daily';
const PAGE_DELAY_MS = 1200;
const CHECKPOINT_PAGES = 15;
const DEFAULT_COOLDOWN_MS = 13 * 60 * 1000;
const MAX_COOLDOWN_MS = 17 * 60 * 1000;
const FALLBACK_EXPERTS = [
  { handle: 'SureshKBN', name: 'Suresh K' },
  { handle: 'Shashank1171', name: 'Shashank' },
  { handle: 'thechartist26', name: 'The Chartist' },
  { handle: 'ishmohit1', name: 'Ishmohit Arora (SOIC)' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lc = (s) => String(s || '').toLowerCase();

// ── native host ──────────────────────────────────────────────────────────────
function hostCall(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(HOST, msg, (res) => {
      if (chrome.runtime.lastError)
        resolve({ ok: false, hostMissing: true, error: chrome.runtime.lastError.message });
      else resolve(res || { ok: false, error: 'empty reply from host' });
    });
  });
}

/** Config from the KB, or a local fallback (host not installed). */
async function getConfig() {
  const r = await hostCall({ type: 'getConfig' });
  if (r.ok) return { ok: true, hostMissing: false, config: r.config };
  const { fb } = await chrome.storage.local.get('fb');
  const sel = new Set((fb?.selected || FALLBACK_EXPERTS.map((e) => lc(e.handle))).map(lc));
  const experts = [...FALLBACK_EXPERTS, ...(fb?.added || [])].map((e) => ({
    ...e,
    selected: sel.has(lc(e.handle)),
    coverage: null,
  }));
  return {
    ok: true,
    hostMissing: true,
    hostError: r.error,
    config: { settings: { autoRefresh: false }, experts },
  };
}

async function setSelected(handles) {
  const r = await hostCall({ type: 'setSelected', handles });
  if (r.ok) return r;
  const { fb } = await chrome.storage.local.get('fb');
  await chrome.storage.local.set({ fb: { ...(fb || {}), selected: handles } });
  return getConfig();
}

async function addExpert(handle, name) {
  const r = await hostCall({ type: 'addExpert', handle, name });
  if (r.ok) return r;
  const { fb } = await chrome.storage.local.get('fb');
  const added = [...(fb?.added || []), { handle, name: name || handle }];
  await chrome.storage.local.set({
    fb: {
      ...(fb || {}),
      added,
      selected: [...(fb?.selected || FALLBACK_EXPERTS.map((e) => e.handle)), handle],
    },
  });
  return getConfig();
}

// ── IndexedDB (uncommitted rows survive worker restarts) ─────────────────────
function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('rows', { keyPath: 'k' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
  });
}
async function putRows(handle, rows) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('rows', 'readwrite');
    const st = tx.objectStore('rows');
    let added = 0;
    for (const r of rows) {
      const req = st.add({ k: `${lc(handle)}:${r.id}`, row: r });
      req.onsuccess = () => {
        added++;
      };
      // duplicate id within the phase -> ignore. stopPropagation: otherwise the error bubbles to the
      // transaction and tx.onerror would fire with tx.error === null (the old "Uncaught (in promise) null").
      req.onerror = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };
    }
    tx.oncomplete = () => resolve(added);
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}
async function allRows(handle) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const out = [];
    const range = IDBKeyRange.bound(`${lc(handle)}:`, `${lc(handle)}:￿`);
    const req = d.transaction('rows').objectStore('rows').openCursor(range);
    req.onsuccess = () => {
      const c = req.result;
      if (c) {
        out.push(c.value.row);
        c.continue();
      } else resolve(out);
    };
    req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
  });
}
async function clearRows(handle) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('rows', 'readwrite');
    tx.objectStore('rows').delete(IDBKeyRange.bound(`${lc(handle)}:`, `${lc(handle)}:￿`));
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

// ── job state ────────────────────────────────────────────────────────────────
/** Jobs saved by an older version of the extension are upgraded in place (cov used to be one range per user). */
function migrateJob(job) {
  if (!job) return null;
  job.cov = job.cov || {};
  for (const h of job.handles || []) {
    const c = job.cov[lc(h)];
    const nested = c && typeof c === 'object' && ('main' in c || 'reposts' in c || 'articles' in c);
    if (!nested) job.cov[lc(h)] = { main: c && c.toMs ? c : null, reposts: null, articles: null };
    const per = job.per && job.per[h];
    if (per && !per.counts) per.counts = { posts: 0, replies: 0, reposts: 0, articles: 0 };
  }
  return job;
}
const getJob = async () => migrateJob((await chrome.storage.local.get('job')).job);
/**
 * Persist the job. Guards: a step that was in flight when the user pressed Pause/Cancel must not undo it
 * (it holds a stale copy with status 'running'). `force` is for the handlers that change status on purpose.
 */
async function saveJob(job, { force = false } = {}) {
  if (!force) {
    const cur = (await chrome.storage.local.get('job')).job;
    if (!cur || cur.id !== job.id) return; // cancelled (or replaced): do not resurrect
    if (cur.status === 'paused' && job.status === 'running') job.status = 'paused';
  }
  job.beat = Date.now();
  await chrome.storage.local.set({ job });
}

async function startJob({ handles, intervalDays, auto }) {
  const vj = await getV();
  if (vj && vj.status === 'running') throw new Error('Verification is running: wait for it to finish.');
  await chrome.storage.local.remove('vjob');
  const hs = C.parseHandles(Array.isArray(handles) ? handles.join(' ') : handles);
  if (!hs.length) throw new Error('select at least one user');
  const cfg = await getConfig();
  const cov = {};
  for (const e of cfg.config.experts)
    cov[lc(e.handle)] = {
      main: e.coverage || null,
      reposts: e.coverageBy?.reposts || null,
      articles: e.coverageBy?.articles || null,
    };
  const per = {};
  hs.forEach(
    (h) =>
      (per[h] = {
        state: 'queued',
        stream: 'main',
        own: 0,
        pages: 0,
        oldest: null,
        counts: { posts: 0, replies: 0, reposts: 0, articles: 0 },
      })
  );
  await saveJob(
    {
      id: Date.now(),
      auto: !!auto,
      handles: hs,
      intervalMs: Math.max(1, Number(intervalDays) || 90) * 86400000,
      cov,
      plans: {},
      per,
      idx: 0,
      userId: null,
      cursor: null,
      phase: null,
      status: 'running',
      resumeAt: null,
      error: null,
      hostMissing: cfg.hostMissing,
      summary: [],
      dirty: false,
    },
    { force: true }
  );
  run().catch(() => {});
}

// ── tab + content-script plumbing ────────────────────────────────────────────
async function ensureTab() {
  let [tab] = await chrome.tabs.query({ url: 'https://x.com/*' });
  if (!tab) {
    tab = await chrome.tabs.create({ url: 'https://x.com/home', active: false });
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      tab = await chrome.tabs.get(tab.id);
      if (tab.status === 'complete') break;
    }
  }
  const ping = () => chrome.tabs.sendMessage(tab.id, { type: 'XCAP_PING' }).catch(() => null);
  let pong = await ping();
  if (!pong) {
    await chrome.scripting
      .executeScript({ target: { tabId: tab.id }, files: ['core.js', 'content.js'] })
      .catch(() => {});
    await sleep(300);
    pong = await ping();
  }
  if (!pong) throw new Error('could not reach an x.com tab (open x.com and retry)');
  return tab.id;
}

// ── commit (KB write) ────────────────────────────────────────────────────────
async function ensureOffscreen() {
  const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (ctx.length) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['BLOBS'],
    justification: 'Create a blob URL for the fallback JSON download',
  });
}

async function downloadFallback(handle, rows) {
  await ensureOffscreen();
  const json = JSON.stringify({ handle, name: null, capturedAt: new Date().toISOString(), rows });
  const { url } = await chrome.runtime.sendMessage({ type: 'XCAP_MAKE_BLOB_URL', json });
  await chrome.downloads.download({
    url,
    filename: `x-capture-${handle}-${new Date().toISOString().slice(0, 10)}.json`,
    conflictAction: 'uniquify',
    saveAs: false,
  });
}

/** Send the phase's rows (+ coverage patch) to the KB, then free them from IndexedDB. */
async function commitPhase(job, handle, { final, exhausted, nextCursor }) {
  const rows = await allRows(handle);
  const phase = job.phase;
  const stream = phase.stream || 'main';
  const cov = (job.cov[lc(handle)] || {})[stream] || null;
  const coverage = C.coveragePatch(phase, cov, { exhausted, nextCursor, final });
  if (rows.length || coverage) {
    const r = await hostCall({ type: 'commit', handle, rows, coverage, stream });
    if (r.ok) {
      if (r.config) {
        const e = r.config.experts.find((x) => lc(x.handle) === lc(handle));
        if (e)
          job.cov[lc(handle)] = {
            main: e.coverage || null,
            reposts: e.coverageBy?.reposts || null,
            articles: e.coverageBy?.articles || null,
          };
      }
      job.summary.push({
        handle,
        kind: phase.kind,
        stream,
        rows: r.rowsAdded,
        docs: r.docsWritten,
        final: !!final,
      });
    } else if (r.hostMissing) {
      job.hostMissing = true;
      if (rows.length) await downloadFallback(handle, rows);
    } else {
      throw new Error(`KB write failed: ${r.error}`);
    }
  }
  await clearRows(handle);
  job.dirty = false;
}

/**
 * Persist whatever the current phase has fetched so far (rows + the contiguous part of the cache range).
 * Called on pause, rate limit and error so nothing waits in the browser: the KB is always current.
 */
async function flush(job) {
  const handle = job.handles[job.idx];
  if (!handle || !job.phase || !job.dirty) return;
  try {
    await commitPhase(job, handle, { final: false, exhausted: false, nextCursor: job.cursor });
  } catch (_) {
    /* rows stay in IndexedDB and are retried on the next commit */
  }
}

// ── main loop ────────────────────────────────────────────────────────────────
let running = false; // in-memory guard; a restarted worker simply resumes from persisted state

function advanceHandle(job, state) {
  job.per[job.handles[job.idx]].state = state;
  job.per[job.handles[job.idx]].pct = 100;
  job.idx++;
  job.userId = null;
  job.cursor = null;
  job.phase = null;
  if (job.idx >= job.handles.length) job.status = 'done';
}

async function step(job) {
  const handle = job.handles[job.idx];
  const per = job.per[handle];

  if (!job.phase) {
    const plan = (job.plans[handle] =
      job.plans[handle] || C.planAll(job.cov[lc(handle)], Date.now(), job.intervalMs));
    const next = plan.shift();
    if (!next) {
      advanceHandle(job, 'cached');
      return saveJob(job);
    }
    job.phase = {
      ...next,
      startedAt: Date.now(),
      pages: 0,
      oldestMs: null,
      emptyStreak: 0,
      topMs: Date.now(),
    };
    job.cursor = next.cursor;
    job.userId = null;
  }
  const phase = job.phase;
  if (per.state !== phase.kind || per.stream !== phase.stream || per.rewalk !== !!phase.rewalk) {
    per.state = phase.kind;
    per.stream = phase.stream;
    per.rewalk = !!phase.rewalk;
    per.pct = 0;
    await saveJob(job); // show which user/phase is active BEFORE the (possibly slow) network call
  }

  let tabId;
  try {
    tabId = await ensureTab();
  } catch (e) {
    job.status = 'error';
    job.error = String(e.message || e);
    return saveJob(job);
  }
  const fetchPage = chrome.tabs
    .sendMessage(tabId, {
      type: 'XCAP_FETCH_PAGE',
      handle,
      userId: job.userId,
      cursor: job.cursor,
      stream: phase.stream,
    })
    .catch((e) => ({ error: String(e) }));
  const timeout = sleep(90000).then(() => ({
    error: 'x.com did not respond within 90 s (is the tab asleep or logged out?)',
  }));
  const res = await Promise.race([fetchPage, timeout]);

  if (res.error === 'login-required') {
    job.status = 'login-required';
    job.error = 'Log in to x.com in this Chrome profile, then press Resume.';
    return saveJob(job);
  }
  if (res.error) {
    job.status = 'error';
    job.error = `@${handle}: ${res.error}`;
    return saveJob(job);
  }
  if (res.userId) job.userId = res.userId;

  if (res.status === 429) {
    const wait = res.resetAt
      ? Math.max(30000, res.resetAt * 1000 - Date.now() + 5000)
      : DEFAULT_COOLDOWN_MS;
    job.resumeAt = Date.now() + Math.min(wait, MAX_COOLDOWN_MS);
    chrome.alarms.create(RESUME, { when: job.resumeAt });
    await flush(job); // rate-limit wait: write everything fetched so far into the KB first
    return saveJob(job);
  }

  const added = await putRows(handle, res.rows);
  phase.pages++;
  const pageOldest = C.oldestOwnMs(res.rows, handle);
  phase.oldestMs = Math.min(pageOldest, phase.oldestMs ?? Infinity);
  if (Number.isFinite(phase.oldestMs)) {
    per.oldest = new Date(phase.oldestMs).toISOString();
    const span = phase.topMs - phase.stopAtMs;
    per.pct =
      span > 0
        ? Math.max(0, Math.min(99, Math.round(((phase.topMs - phase.oldestMs) / span) * 100)))
        : 0;
  }
  per.counts = per.counts || { posts: 0, replies: 0, reposts: 0, articles: 0 };
  per.counts.articles = per.counts.articles || 0;
  job.dirty = true;
  for (const r of res.rows) {
    if (lc(r.by) !== lc(handle) || r.pinned) continue;
    if (r.rt) per.counts.reposts++;
    else if (r.reply_to && lc(r.reply_to_user) !== lc(handle)) per.counts.replies++;
    else per.counts.posts++;
    if (r.article && (r.article.title || r.article.text)) per.counts.articles++;
  }
  per.own = per.counts.posts + per.counts.replies + per.counts.reposts;
  per.pages++;
  // End of timeline = X gives no next cursor, repeats the cursor, or returns two empty pages in a row.
  // (Never infer it from "rows were already stored": a retried / resumed page re-delivers known rows.)
  phase.emptyStreak = res.rows.length === 0 ? phase.emptyStreak + 1 : 0;

  const exhausted = !res.next || res.next === job.cursor || phase.emptyStreak >= 2;
  const reached = phase.oldestMs <= phase.stopAtMs;
  try {
    if (exhausted || reached) {
      await commitPhase(job, handle, { final: true, exhausted, nextCursor: res.next });
      job.phase = null;
      job.cursor = null;
      job.userId = null;
      if (!(job.plans[handle] || []).length) advanceHandle(job, 'done');
    } else {
      job.cursor = res.next;
      if (phase.pages % CHECKPOINT_PAGES === 0)
        await commitPhase(job, handle, { final: false, exhausted: false, nextCursor: res.next });
    }
  } catch (e) {
    job.status = 'error';
    job.error = String(e.message || e);
  }
  await saveJob(job);
  await sleep(PAGE_DELAY_MS);
}

async function run() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const job = await getJob();
      if (!job || job.status !== 'running') break;
      if (job.resumeAt && Date.now() < job.resumeAt) break; // cooling down; alarm will call run() again
      job.resumeAt = null;
      try {
        await step(job);
      } catch (e) {
        job.status = 'error';
        job.error = String((e && e.message) || e || 'unknown error');
        await saveJob(job);
        break;
      }
    }
    // Stopped for any reason other than finishing: persist the partial work (pause, error, login needed).
    const j = await getJob();
    if (j && ['paused', 'error', 'login-required'].includes(j.status) && j.dirty) {
      await flush(j);
      await saveJob(j);
    }
  } finally {
    running = false;
  }
}

// ── Verify: audit saved ranges against X itself and the KB, heal what is missing ─────────────
const getV = async () => (await chrome.storage.local.get('vjob')).vjob || null;
const saveV = (v) => chrome.storage.local.set({ vjob: v });
let verifying = false;
class RateLimited extends Error {}

async function fetchStream(tabId, handle, stream, cursor, userId) {
  const res = await Promise.race([
    chrome.tabs.sendMessage(tabId, { type: 'XCAP_FETCH_PAGE', handle, userId, cursor, stream }).catch((e) => ({ error: String(e) })),
    sleep(60000).then(() => ({ error: 'x.com did not respond within 60 s' })),
  ]);
  if (res.status === 429) throw new RateLimited();
  return res;
}

async function verifyUser(handle, expert, tabId) {
  const covs = { main: expert && expert.coverage, reposts: expert && expert.coverageBy && expert.coverageBy.reposts, articles: expert && expert.coverageBy && expert.coverageBy.articles };
  const out = {};
  let userId = null, statuses = null;
  for (const stream of C.STREAMS) {
    const cov = covs[stream];
    if (!cov) { out[stream] = { state: 'skipped', notes: [] }; continue; }
    const first = await fetchStream(tabId, handle, stream, null, userId);
    if (first.error === 'login-required') throw new Error('Log in to x.com in this Chrome profile, then verify again.');
    if (first.error) { out[stream] = { state: 'error', notes: [first.error] }; continue; }
    userId = first.userId || userId;
    if (first.statusesCount != null) statuses = first.statusesCount;
    let edge = null, edgeError = null;
    if (cov.olderCursor) {
      const r = await fetchStream(tabId, handle, stream, cov.olderCursor, userId);
      if (r.error) edgeError = r.error; else edge = r;
    }
    const pages = [first, edge].filter(Boolean);
    const allRows = pages.flatMap((p) => p.rows);
    const ids = [...new Set(allRows.filter((r) => lc(r.by) === lc(handle)).map((r) => r.id))];
    const chk = await hostCall({ type: 'checkIds', handle, ids });
    if (!chk.ok) throw new Error(chk.hostMissing ? 'The KB bridge is not installed, so nothing can be verified.' : chk.error);
    const st = expert.stats;
    const a = C.assessCoverage({ handle, stream, cov, newest: first, edge, edgeError, missing: new Set(chk.missing), statuses, storedTotal: st ? st.posts + st.replies + st.reposts : null });
    const notes = [...a.notes];
    if (a.heal.length) {
      const byId = new Map(allRows.map((r) => [r.id, r]));
      const rows = new Map(a.heal.map((r) => [r.id, r]));
      for (const r of a.heal) if (r.reply_to && byId.has(r.reply_to)) rows.set(r.reply_to, byId.get(r.reply_to)); // keep reply context
      const c = await hostCall({ type: 'commit', handle, rows: [...rows.values()], stream });
      if (c.ok) notes.push(`${a.heal.length} missing item(s) added to the KB.`);
    }
    const newCov = { ...cov, ...(a.patch || {}), verify: { at: Date.now(), state: a.state } };
    await hostCall({ type: 'setCoverage', handle, stream, coverage: newCov });
    out[stream] = { state: a.state, notes };
  }
  return out;
}

async function startVerify(handles) {
  const j = await getJob();
  if (j && ['running', 'paused', 'error', 'login-required'].includes(j.status)) throw new Error('A capture is in progress: pause or cancel it first.');
  const cur = await getV();
  if (cur && cur.status === 'running') throw new Error('Verification is already running.');
  const cfg = await getConfig();
  if (cfg.hostMissing) throw new Error('Install the KB bridge first: nothing can be verified without it (see README).');
  const hs = C.parseHandles(Array.isArray(handles) ? handles.join(' ') : handles);
  if (!hs.length) throw new Error('select at least one user');
  await chrome.storage.local.remove('job');
  await saveV({ id: Date.now(), status: 'running', handles: hs, idx: 0, results: {}, error: null });
  runVerify().catch(() => {});
}

async function runVerify() {
  if (verifying) return;
  verifying = true;
  try {
    let v = await getV();
    if (!v || v.status !== 'running') return;
    const cfg = await getConfig();
    const tabId = await ensureTab();
    for (; v.idx < v.handles.length; v.idx++) {
      const h = v.handles[v.idx];
      await saveV(v);
      const expert = cfg.config.experts.find((e) => lc(e.handle) === lc(h));
      try {
        v.results[h] = await verifyUser(h, expert, tabId);
      } catch (e) {
        if (e instanceof RateLimited) {
          v.results[h] = Object.fromEntries(C.STREAMS.map((s) => [s, { state: 'rate-limited', notes: ['X rate limit reached. Try again in about 15 minutes.'] }]));
          for (const rest of v.handles.slice(v.idx + 1)) v.results[rest] = Object.fromEntries(C.STREAMS.map((s) => [s, { state: 'rate-limited', notes: ['Not checked (rate limit).'] }]));
          v.error = 'X rate limit reached; the remaining users were not verified.';
          v.idx = v.handles.length;
          break;
        }
        throw e;
      }
    }
    v.status = 'done';
    await saveV(v);
  } catch (e) {
    const v = await getV();
    if (v) { v.status = 'error'; v.error = String((e && e.message) || e); await saveV(v); }
  } finally {
    verifying = false;
  }
}

// ── events ───────────────────────────────────────────────────────────────────
chrome.alarms.create(TICK, { periodInMinutes: 0.5 }); // keep-alive / resume check
chrome.alarms.get(DAILY, (a) => {
  if (!a) chrome.alarms.create(DAILY, { periodInMinutes: 1440, delayInMinutes: 5 });
});
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === TICK || a.name === RESUME) {
    const v = await getV();
    if (v && v.status === 'running' && !verifying) { v.status = 'error'; v.error = 'Verification was interrupted (Chrome restarted). Press Verify again.'; await saveV(v); }
    return run().catch(() => {});
  }
  if (a.name === DAILY) {
    const { config, hostMissing } = await getConfig();
    const job = await getJob();
    if (hostMissing || !config.settings.autoRefresh || (job && job.status === 'running')) return;
    const handles = config.experts.filter((e) => e.selected).map((e) => e.handle);
    if (handles.length) await startJob({ handles, intervalDays: 3, auto: true }).catch(() => {});
  }
});
chrome.runtime.onStartup.addListener(() => run().catch(() => {}));
chrome.runtime.onInstalled.addListener(() => run().catch(() => {}));

chrome.runtime.onMessage.addListener((msg, _s, send) => {
  const reply = (p) =>
    p
      .then((v) => send({ ok: true, ...(v || {}) }))
      .catch((e) => send({ ok: false, error: String(e.message || e) }));
  switch (msg?.type) {
    case 'XCAP_CONFIG':
      reply(getConfig());
      return true;
    case 'XCAP_SET_SELECTED':
      reply(setSelected(msg.handles));
      return true;
    case 'XCAP_ADD_EXPERT':
      reply(addExpert(msg.handle, msg.name));
      return true;
    case 'XCAP_SET_SETTINGS':
      reply(
        hostCall({ type: 'setSettings', settings: msg.settings }).then((r) => {
          if (!r.ok)
            throw new Error(r.hostMissing ? 'Install the KB host first (see README)' : r.error);
          return r;
        })
      );
      return true;
    case 'XCAP_START':
      reply(startJob(msg));
      return true;
    case 'XCAP_STOP':
      reply(
        (async () => {
          const j = await getJob();
          if (j && j.status === 'running') {
            j.status = 'paused';
            await saveJob(j, { force: true });
            run().catch(() => {});
          }
        })()
      );
      return true;
    case 'XCAP_VERIFY': reply(startVerify(msg.handles)); return true;
    case 'XCAP_CANCEL':
      reply(
        (async () => {
          const j = await getJob();
          if (j) {
            for (const h of j.handles) await clearRows(h).catch(() => {});
          }
          await chrome.storage.local.remove('job');
          chrome.alarms.clear(RESUME);
        })()
      );
      return true;
    case 'XCAP_RESUME':
      reply(
        (async () => {
          const j = await getJob();
          if (j && ['paused', 'error', 'login-required'].includes(j.status)) {
            j.status = 'running';
            j.error = null;
            j.resumeAt = null;
            await saveJob(j, { force: true });
            run().catch(() => {});
          }
        })()
      );
      return true;
    default:
      return false; // XCAP_MAKE_BLOB_URL etc. are handled elsewhere
  }
});
