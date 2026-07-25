'use strict';

const fs = require('fs');
const path = require('path');
const { StorageService, ...driveApi } = require('@stock/cloud-utils');
const {
  resolveDataRoot,
  detectTransport,
  resolveDriveRoot,
} = require('../../packages/jobs-runtime/lib/driveDataStore');

class DataStore {
  constructor(context = {}) {
    this.projectRoot = context.projectRoot || process.cwd();
    this.driveRoot = context.driveRoot || resolveDriveRoot();
    this.email = context.email || process.env.COWORK_DRIVE_EMAIL;
    this.dataRoot = resolveDataRoot();
  }

  static open(opts = {}) {
    return new DataStore(opts.context || {});
  }

  locate(key) {
    // The key is now assumed to be the exact relative path in the modern
    // structured layout (entities/, events/, documents/)
    const localRel = key;
    const localPath = path.join(this.dataRoot, localRel);
    const driveRel = key;
    const hasLocal = fs.existsSync(localPath);

    return {
      local: localPath,
      drive: driveRel,
      source: hasLocal ? 'local' : 'drive',
    };
  }

  async read(key) {
    const loc = this.locate(key);
    if (fs.existsSync(loc.local)) {
      return fs.promises.readFile(loc.local);
    }

    // Fallback to drive
    const transport = detectTransport();
    if (transport === 'local-mount' && this.driveRoot) {
      const drivePath = path.join(this.driveRoot, loc.drive);
      if (fs.existsSync(drivePath)) {
        return fs.promises.readFile(drivePath);
      }
    } else if (transport === 'api') {
      const { drive } = driveApi.createDriveClient();
      const rootPath = process.env.COWORK_DRIVE_PATH || driveApi.DEFAULT_ROOT_PATH;
      try {
        const downloaded = await driveApi.downloadFile(drive, rootPath, loc.drive, loc.local);
        if (downloaded) {
          return fs.promises.readFile(loc.local);
        }
      } catch (e) {
        console.warn(`Drive API read failed for ${key}:`, e.message);
      }
    }

    const err = new Error(`NotFound: ${key}`);
    err.code = 'ENOENT';
    throw err;
  }

  async write(key, buf, options = {}) {
    const loc = this.locate(key);
    fs.mkdirSync(path.dirname(loc.local), { recursive: true });
    await fs.promises.writeFile(loc.local, buf);
    // Write-through to Drive
    if (options.sync) {
      await StorageService._uploadToDrive(key, loc.local, true);
    } else {
      StorageService._uploadToDrive(key, loc.local, false);
    }
  }

  async pull(prefix) {
    // For now, assume transport handles full sync, or we skip since pulling all is expensive
    // If needed, this would interact with the new GoogleDrive API sync layer
  }

  async push(prefix) {
    // Mirror local -> Drive for a specific prefix, if necessary.
    // Usually handled implicitly via saveEntity/saveJson.
  }
}

module.exports = DataStore;
