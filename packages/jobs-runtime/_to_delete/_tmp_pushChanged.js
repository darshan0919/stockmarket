'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadEnv } = require('./lib/env');
loadEnv();
const db = require('./lib/db');
const { createDriveClient, uploadFile } = require('@stock/cloud-utils/src/googleDriveApi');

const DRIVE_ROOT = process.env.DATA_V2_DRIVE_ROOT || 'StockMarket/data/v2';
const IS_COLLECTION = (rel) =>
  /^(companies|reports|notes|theses|validation|conversations|prompts|ipos|supportive-investors|unsupportive-investors|learnyst-lessons|youtube-transcripts|x-posts|knowledge-units|signal-ledger|events-\d{4}(-\d{2})?)\.json$/.test(
    rel
  );
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

const FILES = [
  'cache/concall-notes/notes.jsonl',
  'cache/order-announcements/announcements.jsonl',
  'cache/order-book-ledger/NSE:VIVIANA.json',
  'cache/post-close-scan-insights-cursor.json',
  'cache/post-close-scan-insights-pending-window.json',
  'cache/post-close-scan-insights-scan.json',
  'cache/trading-holidays-2026.json',
  'companies.json',
  'events-2026.json',
  'runs/post-close-scan-insights-timings-20261012.jsonl',
  'runs/watchlist-insights-cli-timings-20261012.jsonl',
];

(async () => {
  const state = loadState();
  const { drive } = createDriveClient();
  const root = db.dataRoot();
  const results = [];
  for (const rel of FILES) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      results.push({ rel, status: 'missing-local' });
      continue;
    }
    const hash = sha256(abs);
    const st = state.files[rel];
    if (st && st.sha256 === hash) {
      results.push({ rel, status: 'already-synced-no-change' });
      continue;
    }
    if (IS_COLLECTION(rel) && st && st.driveId) {
      try {
        const meta = await drive.files.get({ fileId: st.driveId, fields: 'id, modifiedTime' });
        if (st.driveModifiedTime && meta.data.modifiedTime !== st.driveModifiedTime) {
          results.push({
            rel,
            status: 'REMOTE_DRIFTED_NEEDS_MERGE',
            remoteModifiedTime: meta.data.modifiedTime,
          });
          continue;
        }
      } catch (e) {
        results.push({ rel, status: 'drift-check-failed', error: e.message });
        continue;
      }
    }
    try {
      const res = await uploadFile(drive, DRIVE_ROOT, rel, abs, { fileId: st && st.driveId });
      state.files[rel] = {
        sha256: hash,
        driveId: res.id,
        driveModifiedTime: res.modifiedTime,
        syncedAt: new Date().toISOString(),
      };
      saveState(state);
      results.push({ rel, status: 'uploaded', action: res.action, driveId: res.id });
    } catch (e) {
      results.push({ rel, status: 'upload-failed', error: e.message });
    }
  }
  console.log(JSON.stringify(results, null, 2));
})();
