const { loadEnv } = require('./lib/env');
loadEnv();
const mod = require('@stock/cloud-utils/src/googleDriveApi');
const { createDriveClient } = mod;
const DRIVE_ROOT = process.env.DATA_V2_DRIVE_ROOT || 'StockMarket/data/v2';
const fs = require('fs');
const logf = '/tmp/pc-run/progress.log';
fs.writeFileSync(logf, '');
const log = (s) => fs.appendFileSync(logf, s + '\n');

(async () => {
  const t0 = Date.now();
  const { drive } = createDriveClient();
  log('client created ' + (Date.now() - t0) + 'ms');

  // Reimplement walkFolder with progress logging
  const { getTimeoutOptions } = mod;
  async function ensureFolderId(path) {
    // use internal via listAllFiles indirectly is hard; just call drive files.list on root by name path manually
  }
  let folderCount = 0,
    fileCount = 0;
  async function walkFolder(folderId, prefix) {
    folderCount++;
    const fc = folderCount;
    const ts = Date.now();
    log(`[${fc}] enter folder "${prefix}" at +${ts - t0}ms`);
    let pageToken = null;
    let pages = 0;
    do {
      const res = await drive.files.list(
        {
          q: `'${folderId}' in parents and trashed = false`,
          fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, md5Checksum)',
          pageSize: 1000,
          pageToken,
        },
        getTimeoutOptions()
      );
      pages++;
      const subfolders = [];
      for (const f of res.data.files || []) {
        const rel = prefix ? `${prefix}/${f.name}` : f.name;
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          subfolders.push({ id: f.id, rel });
        } else {
          fileCount++;
        }
      }
      log(
        `  [${fc}] page ${pages} done at +${Date.now() - t0}ms, subfolders=${subfolders.length}, filesSoFar=${fileCount}`
      );
      for (const sf of subfolders) {
        await walkFolder(sf.id, sf.rel);
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);
  }

  // find root id first
  const { google } = require('googleapis');
  // use ensureFolder via listAllFiles's internal - simplest: call listAllFiles but that's what hangs.
  // Instead, resolve root by walking path segments manually.
  async function findIdByPath(p) {
    const parts = p.split('/').filter(Boolean);
    let parent = 'root';
    for (const part of parts) {
      const res = await drive.files.list(
        {
          q: `name = '${part}' and '${parent}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
          fields: 'files(id,name)',
        },
        getTimeoutOptions()
      );
      if (!res.data.files || !res.data.files.length) throw new Error('not found: ' + part);
      parent = res.data.files[0].id;
    }
    return parent;
  }
  const t1 = Date.now();
  const rootId = await findIdByPath(DRIVE_ROOT);
  log('root resolved ' + (Date.now() - t1) + 'ms id=' + rootId);
  await walkFolder(rootId, '');
  log(
    'DONE total folders=' +
      folderCount +
      ' files=' +
      fileCount +
      ' time=' +
      (Date.now() - t0) +
      'ms'
  );
})().catch((e) => {
  log('ERR ' + e.message);
});
