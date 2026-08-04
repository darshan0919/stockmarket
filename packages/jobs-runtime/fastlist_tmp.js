const { createDriveClient, ensureFolder } = require('@stock/cloud-utils/src/googleDriveApi');
require('./lib/env').loadEnv();


(async () => {
  const t0 = Date.now();
  const { drive } = createDriveClient();
  const rootId = await ensureFolder(drive, 'StockMarket/data/v2');
  console.log('root resolved', Date.now()-t0, 'ms');

  const allFiles = [];
  async function walkFolder(folderId, prefix) {
    let pageToken = null;
    const subfolders = [];
    do {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, md5Checksum)',
        pageSize: 1000,
        pageToken,
      });
      for (const f of res.data.files || []) {
        const rel = prefix ? `${prefix}/${f.name}` : f.name;
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          subfolders.push({ id: f.id, rel });
        } else {
          allFiles.push({ id: f.id, driveRel: rel, modifiedTime: f.modifiedTime, md5: f.md5Checksum || null });
        }
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);
    await Promise.all(subfolders.map(sf => walkFolder(sf.id, sf.rel)));
  }
  await walkFolder(rootId, '');
  console.log('total files', allFiles.length, 'elapsed ms', Date.now()-t0);
  require('fs').writeFileSync('/tmp/remote_listing.json', JSON.stringify(allFiles));
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
