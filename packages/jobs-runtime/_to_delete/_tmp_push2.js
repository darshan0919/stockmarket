'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadEnv } = require('./lib/env');
loadEnv();
const db = require('./lib/db');
const { createDriveClient, uploadFile } = require('@stock/cloud-utils/src/googleDriveApi');
const DRIVE_ROOT = process.env.DATA_V2_DRIVE_ROOT || 'StockMarket/data/v2';
const statePath = () => path.join(db.dataRoot(), '_meta', 'sync-state.json');
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), 'utf8'));
  } catch (_) {
    return { files: {} };
  }
}
function saveState(state) {
  fs.mkdirSync(path.dirname(statePath()), { recursive: true });
  db.writeFileAtomic(statePath(), state);
}
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const rel = 'events-2026.json';
(async () => {
  const state = loadState();
  const { drive } = createDriveClient();
  const root = db.dataRoot();
  const abs = path.join(root, rel);
  const hash = sha256(abs);
  const st = state.files[rel];
  if (st && st.sha256 === hash) {
    console.log('no change');
    return;
  }
  if (st && st.driveId) {
    const meta = await drive.files.get({ fileId: st.driveId, fields: 'id, modifiedTime' });
    if (st.driveModifiedTime && meta.data.modifiedTime !== st.driveModifiedTime) {
      console.log('REMOTE_DRIFTED - need manual merge, not uploading');
      return;
    }
  }
  const res = await uploadFile(drive, DRIVE_ROOT, rel, abs, { fileId: st && st.driveId });
  state.files[rel] = {
    sha256: hash,
    driveId: res.id,
    driveModifiedTime: res.modifiedTime,
    syncedAt: new Date().toISOString(),
  };
  saveState(state);
  console.log('uploaded', JSON.stringify(res));
})();
