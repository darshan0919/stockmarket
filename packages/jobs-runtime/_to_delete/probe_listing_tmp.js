const { loadEnv } = require('./lib/env');
loadEnv();
const { createDriveClient, ensureFolder } = require('@stock/cloud-utils/src/googleDriveApi');
const DRIVE_ROOT = process.env.DATA_V2_DRIVE_ROOT || 'StockMarket/data/v2';
(async () => {
  const { drive } = createDriveClient();
  const rootId = await ensureFolder(drive, DRIVE_ROOT);
  console.log('rootId resolved:', rootId, 'at', Date.now());
  let folderCount = 0,
    fileCount = 0;
  async function walkFolder(folderId, prefix, depth) {
    folderCount++;
    const t0 = Date.now();
    let pageToken = null;
    let localFiles = 0;
    const subfolders = [];
    do {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType)',
        pageSize: 1000,
        pageToken,
      });
      for (const f of res.data.files || []) {
        if (f.mimeType === 'application/vnd.google-apps.folder') subfolders.push(f);
        else {
          fileCount++;
          localFiles++;
        }
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);
    console.log(
      `[${Date.now()}] depth=${depth} folder="${prefix}" files=${localFiles} subfolders=${subfolders.length} tookMs=${Date.now() - t0} totalFoldersSoFar=${folderCount} totalFilesSoFar=${fileCount}`
    );
    for (const sf of subfolders) {
      await walkFolder(sf.id, prefix ? `${prefix}/${sf.name}` : sf.name, depth + 1);
    }
  }
  await walkFolder(rootId, '', 0);
  console.log('DONE total folders:', folderCount, 'total files:', fileCount);
})().catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
});
