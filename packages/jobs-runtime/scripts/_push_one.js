#!/usr/bin/env node
'use strict';
// Scratch: push a single named file, bypassing the full-tree walk/listing that
// data.js push does. Deleted at end of the post-close-scan-insights run.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadEnv } = require('../lib/env');
loadEnv();
const db = require('../lib/db');
const { createDriveClient, uploadFile } = require('@stock/cloud-utils/src/googleDriveApi');

const DRIVE_ROOT = process.env.DATA_V2_DRIVE_ROOT || 'StockMarket/data/v2';
const statePath = () => path.join(db.dataRoot(), '_meta', 'sync-state.json');
function loadState() { try { return JSON.parse(fs.readFileSync(statePath(), 'utf8')); } catch (_) { return { files: {} }; } }
function saveState(s) { fs.mkdirSync(path.dirname(statePath()), { recursive: true }); db.writeFileAtomic(statePath(), s); }
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

(async () => {
  const rel = process.argv[2];
  if (!rel) { console.error('usage: _push_one.js <relative-path>'); process.exit(1); }
  const { drive } = createDriveClient();
  const abs = path.join(db.dataRoot(), rel);
  const state = loadState();
  const res = await uploadFile(drive, DRIVE_ROOT, rel, abs);
  state.files[rel] = { sha256: sha256(abs), driveId: res.id, syncedAt: new Date().toISOString() };
  saveState(state);
  console.log('uploaded', rel, res.id);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
