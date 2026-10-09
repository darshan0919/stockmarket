#!/usr/bin/env node
'use strict';
/**
 * One-off backfill: re-run buildDocs over the raw capture cache and save ONLY the docs that were
 * previously dropped for having no text (image-only posts: frameworks, charts). Idempotent (ids are
 * deterministic). Pure script. Usage: node rebuildXPostsImageOnly.js [--dry-run] [handle ...]
 */
const { buildDocs } = require('../lib/xPosts');
const { loadRaw } = require('../lib/xCapture');
const db = require('../lib/db');

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const handles = args.filter((a) => !a.startsWith('--'));
const targets = handles.length
  ? handles
  : ['SureshKBN', 'Shashank1171', 'ishmohit1', 'thechartist26'];
const out = {};
for (const h of targets) {
  const docs = buildDocs([...loadRaw(h).values()], h, { name: h });
  const imageOnly = docs.filter((d) => !String(d.text || '').trim() && !(d.articles || []).length);
  for (const d of imageOnly) d.creator = 'x-posts-capture';
  out[h] = { docs: docs.length, imageOnly: imageOnly.length };
  if (!dry && imageOnly.length) db.saveXPosts(imageOnly);
}
console.log(JSON.stringify({ dry, out }, null, 1));
