/**
 * core.js — pure helpers shared by content.js, background.js and the node tests.
 * No chrome.* / DOM access here.
 */
(function (root) {
  const OP = 'UserRepliesTimeline'; // posts + replies + quotes (UserTweets excludes replies)
  // Capture streams = the profile tabs. Each has its own coverage (cache range) per user.
  const OPS = { main: OP, reposts: 'UserRepostsTimeline', articles: 'UserArticlesTweets' };
  const STREAMS = ['main', 'reposts', 'articles'];
  const ALL_MS = 36500 * 86400000;
  const BEARER =
    'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'; // public web-client bearer
  const FALSE_FLAGS = new Set([
    'rweb_video_screen_enabled',
    'responsive_web_profile_redirect_enabled',
    'rweb_tipjar_consumption_enabled',
    'premium_content_api_read_enabled',
    'responsive_web_grok_analyze_button_fetch_trends_enabled',
    'longform_notetweets_inline_media_enabled',
    'responsive_web_enhance_cards_enabled',
    'responsive_web_graphql_skip_user_profile_image_extensions_enabled',
  ]);

  const lc = (s) => String(s || '').toLowerCase();

  function find(o, k, d = 0) {
    if (!o || typeof o !== 'object' || d > 14) return undefined;
    if (k in o) return o[k];
    for (const x of Object.keys(o)) {
      const r = find(o[x], k, d + 1);
      if (r !== undefined) return r;
    }
    return undefined;
  }

  /** One GraphQL tweet result -> compact row (shape consumed by lib/xPosts.js buildDocs). */
  function row(t) {
    if (!t) return null;
    if (t.tweet) t = t.tweet;
    const l = t.legacy;
    if (!l) return null;
    const u = t.core?.user_results?.result;
    const art = t.article?.article_results?.result;
    const rt = l.retweeted_status_result?.result;
    const qt = t.quoted_status_result?.result;
    const note = t.note_tweet?.note_tweet_results?.result?.text;
    return {
      id: t.rest_id || l.id_str,
      at: l.created_at,
      by: u?.core?.screen_name || u?.legacy?.screen_name,
      text: note || l.full_text,
      long: !!note,
      reply_to: l.in_reply_to_status_id_str || null,
      reply_to_user: l.in_reply_to_screen_name || null,
      conv: l.conversation_id_str,
      rt: rt ? row(rt) : null,
      quoted: qt ? row(qt) : null,
      urls: (l.entities?.urls || []).map((x) => x.expanded_url),
      media: (l.extended_entities?.media || l.entities?.media || []).map((m) => ({
        type: m.type,
        url: m.media_url_https,
      })),
      m: {
        rt: l.retweet_count,
        rp: l.reply_count,
        lk: l.favorite_count,
        qt: l.quote_count,
        vw: t.views?.count,
      },
      article: art
        ? {
            title: art.title,
            preview: art.preview_text,
            id: art.rest_id,
            text: art.content_state?.blocks?.map((b) => b.text).join('\n'),
          }
        : null,
    };
  }

  /** Timeline response -> { rows, next } where next is the bottom cursor (or null). */
  function parseTimeline(json) {
    const rows = [];
    let next = null;
    for (const ins of find(json, 'instructions') || []) {
      for (const e of ins.entries || (ins.entry ? [ins.entry] : [])) {
        const c = e.content;
        if (c?.cursorType === 'Bottom') next = c.value;
        const list = [];
        if (c?.itemContent?.tweet_results?.result) list.push(c.itemContent.tweet_results.result);
        (c?.items || []).forEach((it) => {
          const x = it?.item?.itemContent?.tweet_results?.result;
          if (x) list.push(x);
        });
        for (const x of list) {
          const r = row(x);
          if (!r || !r.id) continue;
          if (ins.type === 'TimelinePinEntry') r.pinned = true; // old pinned post must not trip the date-stop
          rows.push(r);
        }
      }
    }
    return { rows, next };
  }

  /** Scrape query id + featureSwitches + fieldToggles for an operation from X's main.js text. */
  function parseOperationMeta(js, op) {
    const i = js.indexOf(`operationName:"${op}"`);
    if (i < 0) return null;
    const from = Math.max(0, i - 60);
    const seg = js.slice(from, i + 4000);
    const list = (re) =>
      ((seg.match(re) || [])[1] || '').replace(/"/g, '').split(',').filter(Boolean);
    const q = (js.slice(from, i).match(/queryId:"([\w-]+)"/) || [])[1];
    if (!q) return null;
    return { q, fs: list(/featureSwitches:\[([^\]]*)\]/), ft: list(/fieldToggles:\[([^\]]*)\]/) };
  }

  function flags(meta) {
    return Object.fromEntries(meta.fs.map((k) => [k, !FALSE_FLAGS.has(k)]));
  }
  function toggles(meta) {
    return Object.fromEntries(
      meta.ft.map((k) => [k, k === 'withArticlePlainText' || k === 'withArticleRichContentState'])
    );
  }

  function buildUrl(op, opMeta, flagMeta, vars) {
    const e = (o) => encodeURIComponent(JSON.stringify(o));
    return `https://x.com/i/api/graphql/${opMeta.q}/${op}?variables=${e(vars)}&features=${e(flags(flagMeta))}&fieldToggles=${e(toggles(flagMeta))}`;
  }

  function parseHandles(text) {
    const out = [];
    for (const raw of String(text || '').split(/[\s,]+/)) {
      const h = raw
        .trim()
        .replace(/^https?:\/\/(x|twitter)\.com\//i, '')
        .replace(/^@+/, '')
        .split(/[/?#]/)[0];
      if (/^\w{1,15}$/.test(h) && !out.some((x) => lc(x) === lc(h))) out.push(h);
    }
    return out;
  }

  /**
   * Window logic. rows = everything captured for one handle (own tweets + context by others).
   * Keeps own rows with at in [startMs, endMs] (either bound may be null) plus the context rows
   * (reply parents, quoted tweets) those own rows point to.
   */
  function finalizeRows(rows, handle, startMs, endMs) {
    const h = lc(handle);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const keep = new Map();
    for (const r of rows) {
      if (lc(r.by) !== h) continue;
      const t = new Date(r.at).getTime();
      if (Number.isNaN(t)) continue;
      if (startMs != null && t < startMs) continue;
      if (endMs != null && t > endMs) continue;
      keep.set(r.id, r);
      const parent = r.reply_to && byId.get(r.reply_to);
      if (parent) keep.set(parent.id, parent);
    }
    return [...keep.values()];
  }

  /** Oldest own-tweet timestamp (ms) in a page of rows, or Infinity. */
  function oldestOwnMs(rows, handle) {
    let m = Infinity;
    for (const r of rows) {
      if (lc(r.by) !== lc(handle) || r.pinned) continue;
      const t = new Date(r.at).getTime();
      if (!Number.isNaN(t)) m = Math.min(m, t);
    }
    return m;
  }

  const OVERLAP_MS = 60 * 60 * 1000; // re-page 1h past the cached edge so nothing slips between runs
  const FRESH_MS = 10 * 60 * 1000; // cached newest edge younger than this needs no 'new' pass

  /**
   * What must be fetched for one handle, given its cached coverage and the requested interval
   * [now - intervalMs, now]. Coverage is one contiguous range, so:
   *   - 'full'  : nothing cached -> page from the top down to the interval start
   *   - 'new'   : cached range ends before now -> page from the top down to the cached edge
   *               (always contiguous with the cache, even if that is further back than the interval)
   *   - 'older' : interval starts before the cached start -> continue from the saved cursor
   *               (or, with no cursor, re-walk from the top, which is slower)
   * Returns [] when the interval is fully cached.
   */
  function planHandle(cov, nowMs, intervalMs) {
    const startMs = nowMs - intervalMs;
    if (!cov) return [{ kind: 'full', cursor: null, stopAtMs: startMs }];
    const phases = [];
    if (nowMs - cov.toMs > FRESH_MS)
      phases.push({ kind: 'new', cursor: null, stopAtMs: cov.toMs - OVERLAP_MS });
    if (!cov.exhausted && startMs < cov.fromMs) {
      phases.push({
        kind: 'older',
        cursor: cov.olderCursor || null,
        stopAtMs: startMs,
        rewalk: !cov.olderCursor,
      });
    }
    return phases;
  }

  /** Coverage patch sent to the host when a phase (or checkpoint of it) is committed. */

  /** Phases for every stream of a user. cov = { main, reposts, articles } (each may be null). Articles are few: always everything. */
  function planAll(cov, nowMs, intervalMs) {
    const out = [];
    for (const stream of STREAMS) {
      for (const p of planHandle(
        (cov || {})[stream] || null,
        nowMs,
        stream === 'articles' ? ALL_MS : intervalMs
      ))
        out.push({ ...p, stream });
    }
    return out;
  }

  function coveragePatch(phase, cov, { exhausted, nextCursor, final }) {
    if (!cov && phase.kind !== 'full') return null; // nothing to extend (e.g. state from an older version)
    if (phase.kind === 'new') {
      if (!final || !cov) return null; // a partial 'new' pass is not contiguous with the cache yet
      return {
        fromMs: cov.fromMs,
        toMs: phase.startedAt,
        exhausted: !!cov.exhausted,
        olderCursor: cov.olderCursor || null,
      };
    }
    const fromMs = exhausted ? 0 : phase.oldestMs;
    if (!Number.isFinite(fromMs)) return null;
    return {
      fromMs,
      toMs: phase.kind === 'full' ? phase.startedAt : cov.toMs,
      exhausted: !!exhausted,
      olderCursor: exhausted ? null : nextCursor || null,
    };
  }

  const INTERVALS = [
    { label: '1 week', days: 7 },
    { label: '2 weeks', days: 14 },
    { label: '1 month', days: 30 },
    { label: '3 months', days: 90 },
    { label: '6 months', days: 182 },
    { label: '1 year', days: 365 },
    { label: '2 years', days: 730 },
    { label: '5 years', days: 1825 },
    { label: 'Everything available', days: 36500 },
  ];

  // ── UI view-model (pure, unit-tested): everything the popup shows is derived from the job + clock ──
  const ACTIVE = ['running', 'paused', 'error', 'login-required'];
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmtDur = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
  };
  const fmtDay = (iso) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const PHASE_LABEL = {
    full: 'Fetching posts',
    new: 'Fetching new posts',
    older: 'Fetching older posts',
  };
  const STREAM_LABEL = { reposts: 'Fetching reposts', articles: 'Fetching articles' };

  const fmtN = (n) => Number(n || 0).toLocaleString('en-US');
  function storedLine(stats) {
    if (!stats) return '';
    return `Stored: ${fmtN(stats.posts)} posts · ${fmtN(stats.replies)} replies · ${fmtN(stats.reposts)} reposts · ${fmtN(stats.articles)} articles`;
  }

  function describeJob(job, now, experts) {
    const statsOf = (h) =>
      (
        (experts || []).find((e) => String(e.handle).toLowerCase() === String(h).toLowerCase()) ||
        {}
      ).stats;
    if (!job)
      return {
        state: 'idle',
        headline: 'Ready',
        detail: 'Pick users and an interval, then start.',
        users: [],
        overallPct: 0,
        primary: { action: 'start', label: 'Start capture' },
        canCancel: false,
        locked: false,
      };
    const cooling = job.status === 'running' && job.resumeAt && job.resumeAt > now;
    const state = cooling ? 'rate-limited' : job.status;
    const n = job.handles.length;
    const cur = job.handles[job.idx];
    const live = ACTIVE.includes(job.status);
    const users = job.handles.map((h, i) => {
      const p = job.per[h] || {};
      const isCur = live && i === job.idx;
      let st = 'queued',
        label = 'Waiting';
      if (p.state === 'done') {
        st = 'done';
        label = 'Saved to KB';
      } else if (p.state === 'cached') {
        st = 'cached';
        label = 'Already up to date';
      } else if (isCur) {
        st = state === 'running' ? 'active' : state;
        label =
          state === 'rate-limited'
            ? `Paused by X · resumes in ${fmtDur(job.resumeAt - now)}`
            : state === 'paused'
              ? 'Paused'
              : state === 'error'
                ? 'Stopped'
                : state === 'login-required'
                  ? 'Needs login'
                  : (STREAM_LABEL[p.stream] || PHASE_LABEL[p.state] || 'Starting…') +
                    (p.rewalk ? ' (re-walking, no saved cursor)' : '');
      }
      const c = p.counts;
      const run =
        p.pages && c
          ? `This run: ${fmtN(c.posts)} posts · ${fmtN(c.replies)} replies · ${fmtN(c.reposts)} reposts · ${fmtN(c.articles)} articles · back to ${p.oldest ? fmtDay(p.oldest) : '–'}`
          : '';
      const detail = [run, storedLine(statsOf(h))].filter(Boolean).join('\n');
      const pct = st === 'done' || st === 'cached' ? 100 : isCur ? p.pct || 0 : 0;
      return { handle: h, state: st, label, detail, pct };
    });
    const doneN = users.filter((u) => u.state === 'done' || u.state === 'cached').length;
    const curPct = users.find((u) => u.state !== 'done' && u.state !== 'cached' && u.pct)?.pct || 0;
    const overallPct = job.status === 'done' ? 100 : Math.round(((doneN + curPct / 100) / n) * 100);

    const fin = (job.summary || []).filter((s) => s.final);
    const rows = fin.reduce((a, s) => a + (s.rows || 0), 0);
    const cachedN = users.filter((u) => u.state === 'cached').length;
    let headline,
      detail = '';
    if (job.status === 'done') {
      headline = rows
        ? `Done — ${rows} new items saved to the KB`
        : 'Done — everything was already up to date';
      detail =
        cachedN && rows
          ? `${cachedN} of ${n} users needed nothing new.`
          : job.hostMissing
            ? 'Bridge missing: saved as JSON downloads, not cached.'
            : '';
    } else if (state === 'rate-limited') {
      headline = `X is limiting requests — resuming in ${fmtDur(job.resumeAt - now)}`;
      detail = 'Normal. Keep Chrome open; it continues by itself.';
    } else if (state === 'paused') headline = `Paused at @${cur} (${job.idx + 1} of ${n})`;
    else if (state === 'error') {
      headline = 'Stopped because of an error';
      detail = job.error || '';
    } else if (state === 'login-required') {
      headline = 'Log in to x.com, then press Resume';
      detail = 'Use this same Chrome profile.';
    } else {
      headline = `Capturing @${cur} (${job.idx + 1} of ${n})`;
      if (job.beat && now - job.beat > 90000)
        detail = `No response from x.com for ${Math.round((now - job.beat) / 1000)}s — check the x.com tab is open and logged in.`;
    }
    const primary =
      state === 'running' || state === 'rate-limited'
        ? { action: 'pause', label: 'Pause' }
        : ['paused', 'error', 'login-required'].includes(state)
          ? { action: 'resume', label: 'Resume' }
          : { action: 'start', label: 'Start capture' };
    return { state, headline, detail, users, overallPct, primary, canCancel: live, locked: live };
  }

  // ── Verify: audit a saved range against X itself and the KB (pure; background.js does the fetching) ──
  const DAY = 86400000;
  /**
   * @param {{handle:string, stream:string, cov:object, newest:{rows:object[]}, edge?:{rows:object[]}|null, edgeError?:string|null,
   *          missing:Set<string>, statuses?:number|null, storedTotal?:number}} a
   * newest = first page of the stream; edge = the page at the saved older cursor; missing = ids from those pages NOT in the KB.
   * @returns {{state:'ok'|'unchecked'|'gap'|'suspect', notes:string[], heal:object[], patch:object|null, checked:number}}
   */
  function assessCoverage(a) {
    const h = lc(a.handle);
    const cov = a.cov;
    const notes = [];
    const own = (rows) => (rows || [])
      .filter((r) => lc(r.by) === h && !r.pinned)
      .map((r) => ({ r, t: Date.parse(r.at) }))
      .filter((x) => !Number.isNaN(x.t));
    const inRange = (t) => t >= cov.fromMs && t <= cov.toMs;
    const heal = new Map();
    let checked = 0, gapMin = Infinity, gapN = 0;
    for (const x of own(a.newest && a.newest.rows)) {
      if (inRange(x.t)) checked++;
      if (a.missing.has(x.r.id)) { heal.set(x.r.id, x.r); if (inRange(x.t)) { gapN++; gapMin = Math.min(gapMin, x.t); } }
    }
    let patch = null;
    let state = 'ok';
    if (gapN) {
      state = 'gap';
      patch = { toMs: gapMin - 1 };
      notes.push(`${gapN} item(s) inside the saved range were missing from the KB (now added). The range was shortened so the next run re-checks from ${new Date(gapMin).toISOString().slice(0, 10)}.`);
    } else if (!checked) {
      state = 'unchecked';
      notes.push('Nothing to compare: the newest items on X are newer than the saved range. Run Start to refresh, then verify again.');
    } else {
      notes.push(`${checked} recent items checked: all stored.`);
    }
    if (cov.olderCursor) {
      let edgeBad = null;
      if (a.edgeError) edgeBad = `X rejected the saved cursor (${a.edgeError})`;
      else if (a.edge) {
        const e = own(a.edge.rows);
        for (const x of e) if (a.missing.has(x.r.id)) heal.set(x.r.id, x.r);
        const top = e.reduce((m, x) => Math.max(m, x.t), 0);
        if (top && top > cov.fromMs + 3 * DAY) edgeBad = 'the saved cursor points at newer posts than the range start';
      }
      if (edgeBad) {
        patch = { ...(patch || {}), olderCursor: null };
        if (state === 'ok') state = 'suspect';
        notes.push(`Older-edge check failed: ${edgeBad}. The cursor was dropped; the next run will walk back again.`);
      }
    }
    if (a.stream === 'main' && a.statuses > 0 && a.storedTotal != null) {
      const pct = Math.round((a.storedTotal / a.statuses) * 100);
      if (cov.exhausted && pct < 80) {
        patch = { ...(patch || {}), exhausted: false, olderCursor: null };
        if (state === 'ok' || state === 'unchecked') state = 'suspect';
        notes.push(`Marked "from the beginning" but only ${a.storedTotal.toLocaleString('en-US')} of ~${a.statuses.toLocaleString('en-US')} tweets are stored (${pct}%). The claim was dropped; run Start to continue.`);
      } else {
        notes.push(`Stored ${a.storedTotal.toLocaleString('en-US')} of ~${a.statuses.toLocaleString('en-US')} tweets on X (${pct}%).`);
      }
    }
    return { state, notes, heal: [...heal.values()], patch, checked };
  }

  const VSTATE = { ok: 'Verified', unchecked: 'Could not compare', gap: 'Gap found and fixed', suspect: 'Needs a re-run', skipped: 'Not captured yet', 'rate-limited': 'Rate-limited, try later', error: 'Error' };
  const STREAM_NAME = { main: 'Posts & replies', reposts: 'Reposts', articles: 'Articles' };

  /** View-model for the Verify run (stored in chrome.storage as `vjob`). */
  function describeVerify(v) {
    if (!v) return null;
    const users = v.handles.map((h) => {
      const rs = (v.results && v.results[h]) || {};
      const streams = STREAMS.filter((s) => rs[s]).map((s) => ({ stream: s, name: STREAM_NAME[s], state: rs[s].state, label: VSTATE[rs[s].state] || rs[s].state, notes: rs[s].notes || [] }));
      const worst = ['error', 'rate-limited', 'suspect', 'gap', 'unchecked'].find((k) => streams.some((x) => x.state === k)) || (streams.length ? 'ok' : 'queued');
      const active = v.status === 'running' && v.handles[v.idx] === h;
      return { handle: h, state: active ? 'active' : worst, streams, label: active ? 'Checking…' : streams.length ? '' : 'Waiting' };
    });
    const flat = users.flatMap((u) => u.streams).filter((x) => x.state !== 'skipped');
    const bad = flat.filter((x) => x.state !== 'ok').length;
    let headline;
    if (v.status === 'running') headline = `Verifying @${v.handles[v.idx]} (${v.idx + 1} of ${v.handles.length})`;
    else if (v.status === 'error') headline = 'Verify stopped because of an error';
    else headline = bad ? `Verify finished: ${bad} of ${flat.length} checks need attention` : `Verify finished: all ${flat.length} checks passed`;
    return { status: v.status, headline, detail: v.error || '', users, busy: v.status === 'running' };
  }

  const api = { assessCoverage, describeVerify,
    OPS,
    STREAMS,
    planAll,
    describeJob,
    fmtDur,
    storedLine,
    OP,
    BEARER,
    OVERLAP_MS,
    FRESH_MS,
    INTERVALS,
    planHandle,
    coveragePatch,
    find,
    row,
    parseTimeline,
    parseOperationMeta,
    flags,
    toggles,
    buildUrl,
    parseHandles,
    finalizeRows,
    oldestOwnMs,
  };
  root.XCap = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
