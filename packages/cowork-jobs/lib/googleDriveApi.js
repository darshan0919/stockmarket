'use strict';

/**
 * Google Drive API v3 wrapper for cowork-jobs data sync.
 *
 * Provides file upload/download/list via the REST API using OAuth2 refresh tokens.
 * This is the "remote transport" used by driveDataStore when no local Google Drive
 * mount is detected but GOOGLE_REFRESH_TOKEN is set.
 *
 * Folder IDs are cached in-memory per session to avoid repeated lookups.
 * The root folder path on Drive is: StockMarket/cowork-jobs/v1 (configurable).
 */

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const DEFAULT_ROOT_PATH = 'StockMarket/cowork-jobs/v1';

let _google = null;
function getGoogle() {
  if (!_google) {
    try {
      _google = require('googleapis').google;
    } catch {
      throw new Error(
        'googleapis package is required for Drive API mode. Run: yarn add googleapis'
      );
    }
  }
  return _google;
}

/**
 * Create a Google Drive API client from env vars or explicit credentials.
 * @param {object} [opts]
 * @param {string} [opts.clientId]     - OAuth2 client ID
 * @param {string} [opts.clientSecret] - OAuth2 client secret
 * @param {string} [opts.refreshToken] - OAuth2 refresh token (long-lived)
 * @returns {{ drive: object, auth: object }}
 */
function createDriveClient(opts = {}) {
  const google = getGoogle();
  const clientId = opts.clientId || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = opts.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = opts.refreshToken || process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Google Drive API requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN. ' +
        'Run `yarn cowork:data:auth` to set up credentials.'
    );
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });

  const drive = google.drive({ version: 'v3', auth });
  return { drive, auth };
}

/**
 * In-memory folder ID cache: { 'StockMarket/cowork-jobs/v1/gainers/2026/06' → 'driveId123' }
 */
const _folderCache = new Map();

/**
 * Find or create a folder on Google Drive, returning its ID.
 * Walks the path segments from root, creating each folder if missing.
 *
 * @param {object} drive - googleapis drive client
 * @param {string} folderPath - slash-separated path (e.g. 'StockMarket/cowork-jobs/v1/gainers/2026')
 * @returns {Promise<string>} - Drive folder ID
 */
async function ensureFolder(drive, folderPath) {
  const segments = folderPath.split('/').filter(Boolean);
  let parentId = 'root';
  let builtPath = '';

  for (const seg of segments) {
    builtPath = builtPath ? `${builtPath}/${seg}` : seg;

    if (_folderCache.has(builtPath)) {
      parentId = _folderCache.get(builtPath);
      continue;
    }

    // Search for existing folder
    const query = [
      `name = '${seg.replace(/'/g, "\\'")}'`,
      `'${parentId}' in parents`,
      "mimeType = 'application/vnd.google-apps.folder'",
      'trashed = false',
    ].join(' and ');

    const res = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      pageSize: 1,
    });

    if (res.data.files && res.data.files.length > 0) {
      parentId = res.data.files[0].id;
    } else {
      // Create folder
      const created = await drive.files.create({
        requestBody: {
          name: seg,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId],
        },
        fields: 'id',
      });
      parentId = created.data.id;
    }

    _folderCache.set(builtPath, parentId);
  }

  return parentId;
}

/**
 * Upload a local file to Google Drive at the given driveRel path.
 *
 * @param {object} drive - googleapis drive client
 * @param {string} rootPath - Drive root folder path (e.g. 'StockMarket/cowork-jobs/v1')
 * @param {string} driveRel - relative path within the root (e.g. 'gainers/2026/06/26/gainers_raw.json')
 * @param {string} localPath - absolute local file path
 * @returns {Promise<{id: string, name: string, action: string}>}
 */
async function uploadFile(drive, rootPath, driveRel, localPath) {
  const dir = path.posix.dirname(driveRel);
  const name = path.posix.basename(driveRel);
  const fullDir = dir && dir !== '.' ? `${rootPath}/${dir}` : rootPath;
  const folderId = await ensureFolder(drive, fullDir);

  // Check if file already exists
  const query = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    `'${folderId}' in parents`,
    'trashed = false',
  ].join(' and ');

  const existing = await drive.files.list({
    q: query,
    fields: 'files(id, name, size, modifiedTime)',
    pageSize: 1,
  });

  const media = {
    body: fs.createReadStream(localPath),
  };

  if (existing.data.files && existing.data.files.length > 0) {
    // Update existing file
    const fileId = existing.data.files[0].id;
    const res = await drive.files.update({
      fileId,
      media,
      fields: 'id, name',
    });
    return { id: res.data.id, name: res.data.name, action: 'updated' };
  }

  // Create new file
  const res = await drive.files.create({
    requestBody: {
      name,
      parents: [folderId],
    },
    media,
    fields: 'id, name',
  });
  return { id: res.data.id, name: res.data.name, action: 'created' };
}

/**
 * Download a file from Google Drive to a local path.
 *
 * @param {object} drive - googleapis drive client
 * @param {string} rootPath - Drive root folder path
 * @param {string} driveRel - relative path within the root
 * @param {string} localPath - absolute local destination
 * @returns {Promise<boolean>} - true if file was downloaded, false if not found
 */
async function downloadFile(drive, rootPath, driveRel, localPath) {
  const fileId = await findFileId(drive, rootPath, driveRel);
  if (!fileId) return false;

  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );

  fs.mkdirSync(path.dirname(localPath), { recursive: true });

  return new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(localPath);
    res.data.pipe(ws);
    ws.on('finish', () => resolve(true));
    ws.on('error', reject);
  });
}

/**
 * Find a file's Drive ID by its relative path.
 *
 * @param {object} drive
 * @param {string} rootPath
 * @param {string} driveRel
 * @returns {Promise<string|null>}
 */
async function findFileId(drive, rootPath, driveRel) {
  const dir = path.posix.dirname(driveRel);
  const name = path.posix.basename(driveRel);
  const fullDir = dir && dir !== '.' ? `${rootPath}/${dir}` : rootPath;

  let folderId;
  try {
    folderId = await ensureFolder(drive, fullDir);
  } catch {
    return null;
  }

  const query = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    `'${folderId}' in parents`,
    "mimeType != 'application/vnd.google-apps.folder'",
    'trashed = false',
  ].join(' and ');

  const res = await drive.files.list({
    q: query,
    fields: 'files(id)',
    pageSize: 1,
  });

  return res.data.files && res.data.files.length > 0
    ? res.data.files[0].id
    : null;
}

/**
 * List all files recursively under a Drive folder path.
 *
 * @param {object} drive
 * @param {string} rootPath - Drive root folder path
 * @returns {Promise<Array<{id: string, name: string, driveRel: string, size: number, modifiedTime: string}>>}
 */
async function listAllFiles(drive, rootPath) {
  const rootId = await ensureFolder(drive, rootPath);
  const allFiles = [];

  async function walkFolder(folderId, prefix) {
    let pageToken = null;
    do {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields:
          'nextPageToken, files(id, name, mimeType, size, modifiedTime)',
        pageSize: 100,
        pageToken,
      });

      for (const f of res.data.files || []) {
        const rel = prefix ? `${prefix}/${f.name}` : f.name;
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          await walkFolder(f.id, rel);
        } else {
          allFiles.push({
            id: f.id,
            name: f.name,
            driveRel: rel,
            size: parseInt(f.size || '0', 10),
            modifiedTime: f.modifiedTime,
          });
        }
      }

      pageToken = res.data.nextPageToken;
    } while (pageToken);
  }

  await walkFolder(rootId, '');
  return allFiles;
}

/**
 * Check if the Drive API is configured (credentials present in env).
 * @returns {boolean}
 */
function isApiConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
  );
}

/** Clear the in-memory folder ID cache (useful for tests). */
function clearFolderCache() {
  _folderCache.clear();
}

module.exports = {
  DEFAULT_ROOT_PATH,
  createDriveClient,
  ensureFolder,
  uploadFile,
  downloadFile,
  findFileId,
  listAllFiles,
  isApiConfigured,
  clearFolderCache,
};
