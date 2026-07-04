'use strict';

const fs = require('fs');
const path = require('path');

// We use the existing driveDataStore and googleDriveApi for the underlying logic
// but we abstract it via this DataStore class.
const driveDataStore = require('../../jobs/lib/driveDataStore');
const driveApi = require('../../jobs/lib/googleDriveApi');

class DataStore {
  constructor(context = {}) {
    this.projectRoot = context.projectRoot || process.cwd();
    this.driveRoot = context.driveRoot || driveDataStore.resolveDriveRoot();
    this.email = context.email || process.env.COWORK_DRIVE_EMAIL;
    this.dataRoot = driveDataStore.resolveDataRoot();
  }

  static open(opts = {}) {
    return new DataStore(opts.context || {});
  }

  locate(key) {
    // Determine the local path based on key mapping
    // Here we can just use the key as a relative path for simplicity
    const localRel = key;
    const localPath = path.join(this.dataRoot, localRel);
    
    // We can use classifyLocalDocument to get the driveRel
    const doc = driveDataStore.classifyLocalDocument(localRel);
    const driveRel = doc ? doc.driveRel : key;

    const hasLocal = fs.existsSync(localPath);
    
    // Determining if it exists on drive without reading is complex synchronously,
    // so we return paths.
    return {
      local: localPath,
      drive: driveRel,
      source: hasLocal ? 'local' : 'drive'
    };
  }

  async read(key) {
    const loc = this.locate(key);
    if (fs.existsSync(loc.local)) {
      return fs.promises.readFile(loc.local);
    }
    
    // Fallback to drive
    const transport = driveDataStore.detectTransport();
    if (transport === 'local-mount' && this.driveRoot) {
      const drivePath = path.join(this.driveRoot, loc.drive);
      if (fs.existsSync(drivePath)) {
        return fs.promises.readFile(drivePath);
      }
    } else if (transport === 'api') {
      const { drive } = driveApi.createDriveClient();
      const rootPath = process.env.COWORK_DRIVE_PATH || driveApi.DEFAULT_ROOT_PATH;
      // Download to temp file or memory? The spec says return local file if present else Drive.
      // So we can download it to the local cache and then read it.
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
    // Mark dirty for push (implicitly handled by driveDataStore's push logic which checks mtime)
  }

  async pull(prefix) {
    // Hydrate local from Drive (bounded, timeout)
    // We'll rely on the existing syncFromDrive logic which we can scope to a prefix if needed,
    // but for now we just do a full sync or scoped sync if supported.
    await driveDataStore.syncFromDrive({ dataRoot: this.dataRoot, driveRoot: this.driveRoot });
  }

  async push(prefix) {
    // Mirror local -> Drive (bounded, timeout)
    await driveDataStore.syncToDrive({ dataRoot: this.dataRoot, driveRoot: this.driveRoot });
  }
}

module.exports = DataStore;
