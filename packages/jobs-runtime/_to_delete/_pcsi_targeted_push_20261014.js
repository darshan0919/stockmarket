'use strict';
// Targeted push for this run: listAllFiles() in cloud-utils/googleDriveApi.js walks
// the Drive tree one folder at a time with zero concurrency; against this repo's
// current ~600+ folder structure that exceeds any single invocation's time budget
// before a single byte uploads (confirmed via direct probe: ~450-700ms/folder,
// 300+ folders in 170s, still not done). This script uploads exactly the files
// `yarn data:status` already identified as changed, using the SAME uploadFile()
// helper and the SAME data/_meta/sync-state.json state file as scripts/data.js,
// so it stays fully compatible with (and is superseded by) a normal data:push
// once that can run to completion. Modeled on the identical workaround already
// attempted in packages/jobs-runtime/_to_delete/_tmp_pushChanged.js.
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
  'assets/rerating-catalysts/HCLTECH_Output.pdf',
  'assets/rerating-catalysts/HCLTECH_Output_render.html',
  'assets/rerating-catalysts/SHRIRAMFIN_Output.pdf',
  'assets/rerating-catalysts/SHRIRAMFIN_Output_render.html',
  'assets/rerating-catalysts/TCS_Output.pdf',
  'assets/rerating-catalysts/TCS_Output_render.html',
  'cache/company-financials/NSE:INNOMET.json',
  'cache/gainers-scanner/announcements_2026-10-13.json',
  'cache/ignored-announcements_20261014.json',
  'cache/order-announcements/announcements.jsonl',
  'cache/order-book-ledger/NSE:OBSCP.json',
  'cache/pdf-text/shard_0.jsonl',
  'cache/pdf-text/shard_1.jsonl',
  'cache/pdf-text/shard_5.jsonl',
  'cache/pdf-text/shard_6.jsonl',
  'cache/pdf-text/shard_7.jsonl',
  'cache/pdf-text/shard_8.jsonl',
  'cache/pdf-text/shard_9.jsonl',
  'cache/pdf-text/shard_a.jsonl',
  'cache/pdf-text/shard_b.jsonl',
  'cache/pdf-text/shard_c.jsonl',
  'cache/pdf-text/shard_e.jsonl',
  'cache/pdf-text/shard_f.jsonl',
  'cache/post-close-scan-insights-cursor.json',
  'cache/post-close-scan-insights-pending-window.json',
  'cache/post-close-scan-insights-scan.json',
  'cache/rerating-catalysts/briefs/NSE_INDIAGLYCO_711aa4b7.json',
  'companies.json',
  'events-2026.json',
  'notes.json',
  'reports/reports-2026-Q4.jsonl',
  'reports.json',
  'runs/gainers-raw-2026.jsonl',
  'runs/gainers_insights_20261013.json',
  'runs/gainers_research_seed_20261013.json',
  'runs/post-close-scan-insights-timings-20261013.jsonl',
  'runs/post-close-scan-insights-timings-20261014.jsonl',
  'runs/watchlist-insights-cli-timings-20261013.jsonl',
  'runs/watchlist-insights-cli-timings-20261014.jsonl',
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
