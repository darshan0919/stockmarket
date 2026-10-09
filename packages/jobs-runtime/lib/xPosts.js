'use strict';

/**
 * xPosts — turn raw X timeline captures into KB-ready "x-post" documents.
 *
 * Pure functions (no I/O, no LLM): the importer script feeds captured rows in,
 * gets documents out, and db.saveXPosts() persists them.
 *
 * Document granularity (what ask-expert searches over):
 *   - thread : the expert's original post + their own follow-up replies in the
 *              same conversation, joined in order
 *   - reply  : the expert replying to someone else (parent text kept as context)
 *   - quote  : the expert quote-tweeting someone (quoted text kept as context)
 *   - post   : a standalone original post
 * Pure retweets are dropped (not the expert's own words).
 *
 * Captured row shape (see tools/x-timeline-capture/capture.js):
 *   { id, at, by, text, long, reply_to, reply_to_user, conv, rt, quoted,
 *     urls[], media[{type,url}], m:{rt,rp,lk,qt,vw}, article:{title,preview,text}|null }
 */

const TCO_RE = /https?:\/\/t\.co\/\w+/g;

const lc = (s) => String(s || '').toLowerCase();

/** Numeric-string compare for tweet ids (snowflakes exceed 2^53). */
function cmpId(a, b) {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function toIso(createdAt) {
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function cleanText(t) {
  return String(t || '')
    .replace(TCO_RE, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hasPhoto(r) {
  return Boolean(r && (r.media || []).some((m) => m && m.type === 'photo'));
}

function isPureRetweet(row) {
  return Boolean(row.rt) || /^RT @\w+:/.test(row.text || '');
}

function statusUrl(handle, id) {
  return `https://x.com/${handle}/status/${id}`;
}

/** Unique non-self-referential links (drops x.com status links back to the expert). */
function externalUrls(rows) {
  const out = new Set();
  for (const r of rows) {
    for (const u of r.urls || []) {
      if (!u) continue;
      if (/^https?:\/\/(x|twitter)\.com\/[^/]+\/status\//i.test(u)) continue;
      out.add(u);
    }
  }
  return [...out];
}

function sumMetrics(rows) {
  const m = { likes: 0, replies: 0, retweets: 0, quotes: 0, views: 0 };
  for (const r of rows) {
    const x = r.m || {};
    m.likes += Number(x.lk || 0);
    m.replies += Number(x.rp || 0);
    m.retweets += Number(x.rt || 0);
    m.quotes += Number(x.qt || 0);
    m.views = Math.max(m.views, Number(x.vw || 0));
  }
  return m;
}

/**
 * @param {Array<object>} rows       every captured row (own tweets + context tweets by others)
 * @param {string}        handle     expert handle without '@'
 * @param {{name?: string}} [opts]
 * @returns {Array<object>} documents (no envelope — db.saveXPosts adds it)
 */
function buildDocs(rows, handle, opts = {}) {
  const h = lc(handle);
  const byId = new Map();
  for (const r of rows) if (r && r.id) byId.set(r.id, r);

  const own = rows.filter((r) => r && r.id && lc(r.by) === h && !isPureRetweet(r));
  const groups = new Map(); // groupKey -> { kind, key, rows[] }

  for (const r of own) {
    const replyToOther = r.reply_to && lc(r.reply_to_user) !== h;
    let key;
    let kind;
    if (replyToOther) {
      key = `reply:${r.id}`;
      kind = 'reply';
    } else if (r.reply_to) {
      key = `conv:${r.conv || r.reply_to}`;
      kind = 'thread';
    } else {
      key = `conv:${r.conv || r.id}`;
      kind = r.quoted ? 'quote' : 'post';
    }
    if (!groups.has(key)) groups.set(key, { kind, key: key.slice(key.indexOf(':') + 1), rows: [] });
    const g = groups.get(key);
    g.rows.push(r);
    if (g.rows.length > 1 && g.kind !== 'reply') g.kind = 'thread';
  }

  const docs = [];
  for (const g of groups.values()) {
    g.rows.sort((a, b) => cmpId(a.id, b.id));
    const first = g.rows[0];
    const last = g.rows[g.rows.length - 1];

    let context = null;
    if (g.kind === 'reply') {
      const parent = byId.get(first.reply_to);
      context = {
        by: parent?.by || first.reply_to_user || null,
        id: first.reply_to,
        text: parent ? cleanText(parent.text) : null,
      };
    } else if (first.quoted) {
      context = {
        by: first.quoted.by || null,
        id: first.quoted.id,
        text: cleanText(first.quoted.text),
      };
    }

    const text = g.rows
      .map((r) => cleanText(r.text))
      .filter(Boolean)
      .join('\n\n');
    if (!text && !g.rows.some((r) => r.article) && !g.rows.some(hasPhoto)) continue; // image-only posts (frameworks, charts) are content

    const articles = g.rows
      .filter((r) => r.article && (r.article.title || r.article.text))
      .map((r) => ({
        title: r.article.title || null,
        preview: r.article.preview || null,
        text: r.article.text || null,
      }));
    const media = g.rows.flatMap((r) => r.media || []);

    docs.push({
      type: 'x-post',
      handle,
      name: opts.name || handle,
      kind: g.kind,
      key: g.key, // stable identity: conversation id (threads/posts) or the reply's own id
      rootId: first.id,
      publishedAt: toIso(first.at),
      lastAt: toIso(last.at),
      tweetIds: g.rows.map((r) => r.id),
      text,
      context,
      urls: externalUrls(g.rows),
      media,
      articles,
      metrics: sumMetrics(g.rows),
      url: statusUrl(handle, first.id),
    });
  }
  // Reposts: the expert amplified someone else's post. Searchable (text = the original), clearly labelled.
  for (const r of rows) {
    if (!r || !r.id || lc(r.by) !== h || !isPureRetweet(r)) continue;
    const o = r.rt || null;
    const text = cleanText(o ? o.text : (r.text || '').replace(/^RT @\w+:\s*/, ''));
    const oArticle =
      o && o.article && (o.article.title || o.article.text)
        ? [
            {
              title: o.article.title || null,
              preview: o.article.preview || null,
              text: o.article.text || null,
            },
          ]
        : [];
    if (!text && !oArticle.length && !hasPhoto(o)) continue;
    docs.push({
      type: 'x-post',
      handle,
      name: opts.name || handle,
      kind: 'repost',
      key: `repost-${r.id}`,
      rootId: r.id,
      publishedAt: toIso(r.at),
      lastAt: toIso(r.at),
      tweetIds: [r.id],
      text,
      context: {
        by: (o && o.by) || (r.text || '').match(/^RT @(\w+):/)?.[1] || null,
        id: (o && o.id) || null,
        text: null,
      },
      urls: externalUrls(o ? [o] : []),
      media: (o && o.media) || [],
      articles: oArticle,
      metrics: sumMetrics(o ? [o] : []),
      url: statusUrl((o && o.by) || handle, (o && o.id) || r.id),
    });
  }
  docs.sort((a, b) => (a.publishedAt < b.publishedAt ? -1 : 1));
  return docs;
}

/** Slim index entry stored in x-posts.json (full body lives in the shard). */
function toIndexEntry(doc, partitionName) {
  return {
    id: doc.id,
    type: doc.type,
    creator: doc.creator,
    creationTime: doc.creationTime,
    modifiedTime: doc.modifiedTime,
    handle: doc.handle,
    name: doc.name,
    kind: doc.kind,
    key: doc.key,
    rootId: doc.rootId,
    publishedAt: doc.publishedAt,
    preview: (doc.text || '').slice(0, 160),
    url: doc.url,
    tweetCount: doc.tweetIds.length,
    hasMedia: doc.media.length > 0,
    hasArticle: doc.articles.length > 0,
    body: `x-posts/${partitionName}`,
  };
}

/** Group key a captured own row belongs to (same rule buildDocs uses). */
function groupKeyOf(row, handle) {
  const h = lc(handle);
  if (isPureRetweet(row)) return `repost-${row.id}`;
  if (row.reply_to && lc(row.reply_to_user) !== h) return row.id;
  if (row.reply_to) return row.conv || row.reply_to;
  return row.conv || row.id;
}

module.exports = { buildDocs, toIndexEntry, cleanText, cmpId, isPureRetweet, groupKeyOf };
