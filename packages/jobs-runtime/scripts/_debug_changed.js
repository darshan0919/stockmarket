#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadEnv } = require('../lib/env');
loadEnv();
const db = require('../lib/db');

const NEVER_SYNC = (rel) =>
  rel.startsWith('.locks/') ||
  rel.startsWith('_meta/') ||
  rel.includes('.tmp.') ||
  rel.includes('.corrupt.') ||
  path.basename(rel) === '.env' ||
  path.basename(rel) === '.DS_Store' ||
  /(backup|\.bak|\.orig)$/i.test(rel);

const statePath = () => path.join(db.dataRoot(), '_meta', 'sync-state.json');
const state = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function walkLocal() {
  const root = db.dataRoot();
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs);
      if (entry.isDirectory()) walk(abs);
      else if (!NEVER_SYNC(rel)) out.push(rel);
    }
  })(root);
  return out;
}

const root = db.dataRoot();
const locals = walkLocal();
const changed = [];
for (const rel of locals) {
  const abs = path.join(root, rel);
  const st = state.files[rel];
  const hash = sha256(abs);
  if (!st || st.sha256 !== hash) {
    const size = fs.statSync(abs).size;
    changed.push({ rel, size });
  }
}
changed.sort((a, b) => b.size - a.size);
console.log('total changed:', changed.length);
console.log('total bytes:', changed.reduce((s, c) => s + c.size, 0));
console.log('largest 20:');
for (const c of changed.slice(0, 20)) {
  console.log(`  ${(c.size / 1024 / 1024).toFixed(1)}MB  ${c.rel}`);
}
console.log('files > 10MB:', changed.filter(c => c.size > 10*1024*1024).length);
console.log('files > 20MB (Drive API multipart limit is 5MB, resumable needed above that):', changed.filter(c => c.size > 20*1024*1024).length);
fs.writeFileSync('/tmp/changed_full.json', JSON.stringify(changed, null, 2));
