'use strict';

const fs = require('fs');
const path = require('path');

const DATE_KEYS = ["created_at", "date", "datetime", "timestamp", "created", "time"];
const TEXT_KEYS = ["text", "full_text", "tweet", "content", "body"];
const ID_KEYS = ["id", "id_str", "tweet_id", "status_id"];
const AUTHOR_KEYS = ["author", "user", "username", "screen_name", "handle"];
const REPLY_ID_KEYS = ["in_reply_to_status_id", "in_reply_to_status_id_str", "in_reply_to_id", "reply_to_id"];
const REPLY_USER_KEYS = ["in_reply_to_screen_name", "in_reply_to_user", "reply_to_user"];
const LIKE_KEYS = ["like_count", "favorite_count", "favourite_count", "likes"];
const RT_KEYS = ["retweet_count", "rt_count", "retweets"];
const REPLY_COUNT_KEYS = ["reply_count", "replies"];

function first(obj, keys, defaultVal = null) {
  if (!obj || typeof obj !== 'object') return defaultVal;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") {
      return obj[k];
    }
  }
  return defaultVal;
}

function parseDate(s) {
  if (s === null || s === undefined || s === "") return null;
  if (typeof s === 'number') {
    try {
      return new Date(s < 1e12 ? s * 1000 : s).toISOString();
    } catch (e) {
      return null;
    }
  }
  s = String(s).trim();
  try {
    const d = new Date(s);
    if (!isNaN(d.valueOf())) return d.toISOString();
  } catch (e) {}
  return null;
}

function _int(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function normaliseTweet(raw, sourceFormat) {
  const text = first(raw, TEXT_KEYS, "");
  if (!text) return null;
  const strText = String(text);
  
  const isRetweet = /^RT\s+@/.test(strText) || Boolean(raw.retweeted_status);
  const inReplyToId = first(raw, REPLY_ID_KEYS);

  return {
    id: first(raw, ID_KEYS) !== null ? String(first(raw, ID_KEYS)) : null,
    date: parseDate(first(raw, DATE_KEYS)),
    author: first(raw, AUTHOR_KEYS) ? String(first(raw, AUTHOR_KEYS)) : null,
    text: strText,
    is_reply: inReplyToId !== null,
    in_reply_to_id: inReplyToId !== null ? String(inReplyToId) : null,
    in_reply_to_user: first(raw, REPLY_USER_KEYS),
    in_reply_to_text: null,
    is_retweet: isRetweet,
    quoted_text: (raw.quoted_status && typeof raw.quoted_status === 'object') ? raw.quoted_status.text : null,
    like_count: _int(first(raw, LIKE_KEYS)),
    retweet_count: _int(first(raw, RT_KEYS)),
    reply_count: _int(first(raw, REPLY_COUNT_KEYS)),
    source_format: sourceFormat,
  };
}

function parseApiV2(text) {
  const obj = JSON.parse(text);
  if (typeof obj !== 'object' || !obj.data) return [];
  const data = Array.isArray(obj.data) ? obj.data : [obj.data];
  
  for (const t of data) {
    if (t && typeof t.public_metrics === 'object') {
      if (t.like_count === undefined) t.like_count = t.public_metrics.like_count;
      if (t.retweet_count === undefined) t.retweet_count = t.public_metrics.retweet_count;
      if (t.reply_count === undefined) t.reply_count = t.public_metrics.reply_count;
    }
    const refs = t.referenced_tweets || [];
    for (const r of refs) {
      if (r.type === "replied_to") t.in_reply_to_status_id = r.id;
    }
  }
  return data.map(t => normaliseTweet(t, "api_v2")).filter(Boolean);
}

function parseNdjson(text) {
  const out = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      const n = normaliseTweet(obj, "ndjson");
      if (n) out.push(n);
    } catch (e) {}
  }
  return out;
}

function parseJsonArray(text) {
  const obj = JSON.parse(text);
  if (Array.isArray(obj)) {
    return obj.map(t => normaliseTweet(t, "json_array")).filter(Boolean);
  }
  return [];
}

function parseCsv(text) {
  const out = [];
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return out;
  const header = lines[0].split(',').map(s => s.trim());
  
  // Basic naive CSV parser
  for (let i = 1; i < lines.length; i++) {
    const row = {};
    const cols = lines[i].split(',');
    for (let j = 0; j < Math.min(header.length, cols.length); j++) {
      row[header[j]] = cols[j].trim();
    }
    const n = normaliseTweet(row, "csv");
    if (n) out.push(n);
  }
  return out;
}

function parseRawText(text) {
  const blocks = text.trim().split(/\n\s*\n/);
  const out = [];
  let i = 0;
  for (const block of blocks) {
    const b = block.trim();
    if (!b) continue;
    const dateMatch = b.match(/^\s*(\d{4}-\d{2}-\d{2}[T\s\d:.+-]*)/);
    const date = dateMatch ? parseDate(dateMatch[1]) : null;
    out.push({
      id: `raw_${i++}`,
      date,
      author: null,
      text: b,
      is_reply: false,
      in_reply_to_id: null,
      in_reply_to_user: null,
      in_reply_to_text: null,
      is_retweet: false,
      quoted_text: null,
      like_count: null,
      retweet_count: null,
      reply_count: null,
      source_format: "raw_text",
    });
  }
  return out;
}

function sniffAndParse(text) {
  const head = text.trimStart().substring(0, 512);
  
  if (head.startsWith("{")) {
    try {
      const obj = JSON.parse(text);
      if (typeof obj === 'object' && obj.data) return parseApiV2(text);
    } catch (e) {}
  }
  
  if (head.startsWith("[")) {
    try {
      return parseJsonArray(text);
    } catch(e) {}
  }

  const sampleLines = text.split('\n').filter(l => l.trim()).slice(0, 10);
  if (sampleLines.length && sampleLines.every(l => l.trimStart().startsWith("{"))) {
    return parseNdjson(text);
  }

  if (sampleLines.length) {
    const firstLine = sampleLines[0];
    if (firstLine.includes(',')) {
      const firstLineLower = firstLine.toLowerCase();
      if ([...TEXT_KEYS, ...ID_KEYS, ...DATE_KEYS].some(k => firstLineLower.includes(k))) {
        return parseCsv(text);
      }
    }
  }

  return parseRawText(text);
}

function parsePath(targetPath) {
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    const allTweets = [];
    const files = fs.readdirSync(targetPath);
    for (const file of files) {
      if (file.startsWith('.')) continue;
      const fullPath = path.join(targetPath, file);
      if (fs.statSync(fullPath).isFile()) {
        try {
          allTweets.push(...parsePath(fullPath));
        } catch (e) {
          console.warn(`[warn] failed to parse ${fullPath}: ${e.message}`);
        }
      }
    }
    return allTweets;
  }
  const text = fs.readFileSync(targetPath, 'utf-8');
  return sniffAndParse(text);
}

function resolveReplyContext(tweets) {
  const byId = {};
  for (const t of tweets) {
    if (t.id) byId[t.id] = t;
  }
  for (const t of tweets) {
    if (t.in_reply_to_id && byId[t.in_reply_to_id]) {
      t.in_reply_to_text = byId[t.in_reply_to_id].text;
    }
  }
  return tweets;
}

function parseTweetDump(targetPath) {
  const src = path.resolve(targetPath);
  if (!fs.existsSync(src)) {
    throw new Error(`Path does not exist: ${src}`);
  }

  let tweets = parsePath(src);
  if (!tweets || tweets.length === 0) {
    throw new Error("No tweets parsed. The format may be unsupported.");
  }

  tweets = resolveReplyContext(tweets);

  if (tweets.some(t => t.date)) {
    tweets.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }

  return tweets;
}

module.exports = {
  parseTweetDump,
  sniffAndParse,
  resolveReplyContext,
  normaliseTweet
};
