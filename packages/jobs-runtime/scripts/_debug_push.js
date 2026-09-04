#!/usr/bin/env node
'use strict';
// Temporary debug driver: same logic as data.js push, but logs per-file progress.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadEnv } = require('../lib/env');
loadEnv();
const db = require('../lib/db');
const {
  createDriveClient,
  uploadFile,
  listAllFiles,
} = require('@stock/cloud-utils/src/googleDriveApi');

const DRIVE_ROOT = process.env.DATA_V2_DRIVE_ROOT || 'StockMarket/data/v2';
const NEVER_SYNC = (rel) =>
  rel.startsWith('.locks/') ||
  rel.startsWith('_meta/') ||
  rel.includes('.tmp.') ||
  rel.includes('.corrupt.') ||
  path.basename(rel) === '.env' ||
  path.basename(rel) === '.DS_Store' ||
  /(backup|\.bak|\.orig)$/i.test(rel);

const statePath = () => path.join(db.dataRoot(), '_meta', 'sync-state.json');
function loadState() {
  try { return JSON.parse(fs.readFileSync(statePath(), 'utf8')); } catch (_) { return { files: {} }; }
}
function saveState(state) {
  fs.mkdirSync(path.dirname(statePath()), { recursive: true });
  db.writeFileAtomic(statePath(), state);
}
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

// Budget-bounded, no-remote-listing variant: `data.js status` already confirmed
// 0 drift against Drive, so we skip the ~80s listAllFiles() call and just push
// files whose local sha256 differs from sync-state, stopping cleanly (not mid
// -request) once a wall-clock budget is hit so repeated invocations converge.
const BUDGET_MS = Number(process.argv[2] || 150000);

(async () => {
  const t0 = Date.now();
  const state = loadState();
  process.stderr.write(`[t+${Date.now()-t0}ms] loading drive client\n`);
  const { drive } = createDriveClient();
  process.stderr.write(`[t+${Date.now()-t0}ms] walking local\n`);
  const locals = walkLocal();
  process.stderr.write(`[t+${Date.now()-t0}ms] local files: ${locals.length}\n`);

  const MAX_SIZE = 20 * 1024 * 1024; // skip >20MB — 30s AbortSignal in googleDriveApi.js can't
                                       // complete a multipart upload that large from this sandbox's
                                       // link; those files are pre-existing (not from tonight's run)
                                       // and need a resumable-upload fix, not a rushed workaround here.
  let uploaded = 0, skipped = 0, remaining = 0, deferredLarge = 0;
  const root = db.dataRoot();
  for (const rel of locals) {
    if (Date.now() - t0 > BUDGET_MS) { remaining++; continue; }
    const abs = path.join(root, rel);
    const size = fs.statSync(abs).size;
    const hash = sha256(abs);
    const st = state.files[rel];
    if (st && st.sha256 === hash) { skipped++; continue; }
    if (size > MAX_SIZE) { deferredLarge++; continue; }
    process.stderr.write(`[t+${Date.now()-t0}ms] uploading ${rel} (${uploaded+1})\n`);
    const res = await uploadFile(drive, DRIVE_ROOT, rel, abs);
    state.files[rel] = { sha256: sha256(abs), driveId: res.id, syncedAt: new Date().toISOString() };
    uploaded++;
    saveState(state);
  }
  process.stderr.write(`[t+${Date.now()-t0}ms] DONE uploaded=${uploaded} skipped=${skipped} deferredLarge(>20MB)=${deferredLarge} remaining(budget-cut)=${remaining}\n`);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
