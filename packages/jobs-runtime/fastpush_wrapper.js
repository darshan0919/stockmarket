'use strict';
// Monkey-patch listAllFiles with a parallelized folder-walk (same output shape)
// before data.js's push() (imported from the same cached module) runs — the
// original sequential per-folder walk was timing out against our exec-time cap
// even though the actual remote tree is small (985 files). Read-only listing
// change only; upload/state logic is untouched.
const gdrive = require('@stock/cloud-utils/src/googleDriveApi');

async function fastListAllFiles(drive, rootPath) {
  const rootId = await gdrive.ensureFolder(drive, rootPath);
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
          allFiles.push({
            id: f.id,
            name: f.name,
            driveRel: rel,
            size: parseInt(f.size || '0', 10),
            modifiedTime: f.modifiedTime,
            md5: f.md5Checksum || null,
          });
        }
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);
    await Promise.all(subfolders.map((sf) => walkFolder(sf.id, sf.rel)));
  }
  await walkFolder(rootId, '');
  return allFiles;
}

gdrive.listAllFiles = fastListAllFiles;

process.argv[2] = 'push';
require('./scripts/data.js');
