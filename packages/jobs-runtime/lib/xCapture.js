'use strict';

/**
 * xCapture — the single write path from captured X rows into the KB.
 *
 * Used by the native-messaging host (Chrome extension) and by importXPosts.js (capture.js files).
 *   1. Raw rows are appended to data/cache/x-posts-raw/<handle>.jsonl (needed to rebuild threads /
 *      reply-parent context across separate capture runs; rows are never fetched twice).
 *   2. Only the conversations touched by the new rows are rebuilt from the full raw union and upserted
 *      into the `x-posts` collection (stable ids, so re-runs never duplicate).
 *   3. Coverage in data/x-experts.json is advanced.
 */

const fs = require('fs');
const path = require('path');
const db = require('./db');
const { buildDocs, groupKeyOf, isPureRetweet } = require('./xPosts');
const experts = require('./xExperts');

const lc = (s) => String(s || '').toLowerCase();

function rawPath(handle) {
  return path.join(db.dataRoot(), 'cache', 'x-posts-raw', `${lc(handle)}.jsonl`);
}

function loadRaw(handle) {
  const map = new Map();
  let text = '';
  try {
    text = fs.readFileSync(rawPath(handle), 'utf8');
  } catch (_) {
    return map;
  }
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r && r.id) map.set(r.id, r); // later line wins
    } catch (_) {
      /* skip torn line */
    }
  }
  return map;
}

function appendRaw(handle, rows) {
  if (!rows.length) return;
  const file = rawPath(handle);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

/**
 * @param {string} handle
 * @param {Array<object>} rows  captured rows (own + context)
 * @param {{ coverage?: {fromMs:number,toMs:number,exhausted?:boolean,olderCursor?:string|null}, stream?: 'main'|'originals'|'reposts'|'articles', name?: string }} [opts]
 */
/**
 * What is stored for a handle, counted per tweet (what you see on X): posts (own tweets that are not
 * replies to someone else, incl. every tweet of a self-thread), replies (to others), quotes (own tweets
 * that quote another; counted inside posts/replies too) and reposts (pure retweets; kept in the raw
 * cache only, never as KB docs). `docs` = KB items after grouping threads.
 */
function statsFrom(rows, docs, handle) {
  const h = lc(handle);
  const s = { v: 3, posts: 0, replies: 0, quotes: 0, reposts: 0, articles: 0, docs: docs.length };
  for (const r of rows) {
    if (!r || lc(r.by) !== h) continue;
    if (isPureRetweet(r)) {
      s.reposts++;
      continue;
    }
    if (r.reply_to && lc(r.reply_to_user) !== h) s.replies++;
    else s.posts++;
    if (r.quoted) s.quotes++;
    if (r.article && (r.article.title || r.article.text)) s.articles++;
  }
  s.updatedAt = new Date().toISOString();
  return s;
}

function computeStats(handle) {
  const rows = [...loadRaw(handle).values()];
  return statsFrom(rows, buildDocs(rows, handle), handle);
}

function commitRows(handle, rows, opts = {}) {
  const reg = experts.load();
  if (!reg.experts[lc(handle)]) experts.addExpert(handle, opts.name);

  const raw = loadRaw(handle);
  const fresh = [];
  for (const r of rows || []) {
    if (!r || !r.id) continue;
    const prev = raw.get(r.id);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(r)) fresh.push(r);
    raw.set(r.id, r);
  }
  appendRaw(handle, fresh);

  const touched = new Set(
    fresh.filter((r) => lc(r.by) === lc(handle)).map((r) => groupKeyOf(r, handle))
  );
  const allDocs = buildDocs([...raw.values()], handle, { name: opts.name });
  const docs = allDocs.filter((d) => touched.has(d.key));
  for (const d of docs) d.creator = 'x-posts-capture';
  if (docs.length) db.saveXPosts(docs);

  experts.setStats(handle, statsFrom([...raw.values()], allDocs, handle));
  let coverage = null;
  if (opts.coverage)
    coverage = experts.updateCoverage(handle, opts.coverage, opts.stream || 'main');
  return { rowsAdded: fresh.length, docsWritten: docs.length, coverage };
}

module.exports = { commitRows, computeStats, loadRaw, rawPath };
