'use strict';
require('./lib/env').loadEnv();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./lib/db');
const { createDriveClient, uploadFile, ensureFolder } = require('@stock/cloud-utils/src/googleDriveApi');

const DRIVE_ROOT = process.env.DATA_V2_DRIVE_ROOT || 'StockMarket/data/v2';
const NEVER_SYNC = (rel) =>
  rel.startsWith('.locks/') || rel.startsWith('_meta/') || rel.includes('.tmp.') ||
  rel.includes('.corrupt.') || path.basename(rel) === '.env' || path.basename(rel) === '.DS_Store' ||
  /(backup|\.bak|\.orig)$/i.test(rel) ||
  /^reports\/rpt_artifact-migration_.*\.json$/.test(rel);

const statePath = () => path.join(db.dataRoot(), '_meta', 'sync-state.json');
function loadState() { try { return JSON.parse(fs.readFileSync(statePath(), 'utf8')); } catch (_) { return { files: {} }; } }
function saveState(state) { fs.mkdirSync(path.dirname(statePath()), { recursive: true }); db.writeFileAtomic(statePath(), state); }
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const md5 = (file) => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');

function walkLocal() {
  const root = db.dataRoot();
  const out = [];
  const visit = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) visit(abs);
      else out.push(path.relative(root, abs).split(path.sep).join('/'));
    }
  };
  visit(root);
  return out.filter((rel) => !NEVER_SYNC(rel));
}

async function fastListAllFiles(drive, rootPath) {
  const rootId = await ensureFolder(drive, rootPath);
  const allFiles = [];
  async function walkFolder(folderId, prefix) {
    let pageToken = null;
    const subfolders = [];
    do {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, md5Checksum)',
        pageSize: 1000, pageToken,
      });
      for (const f of res.data.files || []) {
        const rel = prefix ? `${prefix}/${f.name}` : f.name;
        if (f.mimeType === 'application/vnd.google-apps.folder') subfolders.push({ id: f.id, rel });
        else allFiles.push({ id: f.id, driveRel: rel, modifiedTime: f.modifiedTime, md5: f.md5Checksum || null });
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);
    await Promise.all(subfolders.map((sf) => walkFolder(sf.id, sf.rel)));
  }
  await walkFolder(rootId, '');
  return allFiles;
}

async function pool(items, n, fn) {
  let i = 0;
  const workers = new Array(Math.min(n, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

(async () => {
  const t0 = Date.now();
  const state = loadState();
  const { drive } = createDriveClient();
  const locals = walkLocal();
  const root = db.dataRoot();
  const remoteList = await fastListAllFiles(drive, DRIVE_ROOT);
  const remote = new Map(remoteList.map((f) => [f.driveRel, f]));
  console.log('listing done', Date.now() - t0, 'ms; locals', locals.length, 'remote', remoteList.length);

  const toUpload = [];
  for (const rel of locals) {
    const abs = path.join(root, rel);
    const hash = sha256(abs);
    const st = state.files[rel];
    const remoteEntry = remote.get(rel);
    const remoteDrifted = remoteEntry && st && st.driveModifiedTime && remoteEntry.modifiedTime !== st.driveModifiedTime;
    if (st && st.sha256 === hash && !remoteDrifted) continue; // in sync
    if (remoteEntry && remoteEntry.md5 && remoteEntry.md5 === md5(abs) && !remoteDrifted) {
      state.files[rel] = { sha256: hash, driveId: remoteEntry.id, driveModifiedTime: remoteEntry.modifiedTime, syncedAt: new Date().toISOString() };
      continue; // adopt, no upload needed
    }
    toUpload.push({ rel, abs, hash });
  }
  saveState(state);
  console.log('to upload:', toUpload.length, 'elapsed', Date.now() - t0, 'ms');

  let uploaded = 0;
  const errors = [];
  await pool(toUpload, 8, async ({ rel, abs, hash }) => {
    try {
      const res = await uploadFile(drive, DRIVE_ROOT, rel, abs);
      state.files[rel] = { sha256: hash, driveId: res.id, syncedAt: new Date().toISOString() };
      uploaded++;
      console.log(`[fastpush] ↑ ${rel}`);
    } catch (e) {
      errors.push(`${rel}: ${e.message}`);
    }
  });
  saveState(state);
  console.log('DONE uploaded=', uploaded, 'errors=', errors.length, 'elapsed', Date.now() - t0, 'ms');
  if (errors.length) { errors.forEach(e => console.error('ERR', e)); }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
