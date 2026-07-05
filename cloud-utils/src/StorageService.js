'use strict';

const fs = require('fs');
const path = require('path');
const driveApi = require('./googleDriveApi');
const os = require('os');

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveDataRoot() {
  const explicit =
    process.env.COWORK_DATA_DIR ||
    process.env.WI_DATA_DIR ||
    (process.env.GAINERS_OUTPUT_DIR ? path.dirname(process.env.GAINERS_OUTPUT_DIR) : null) ||
    (process.env.IV_CACHE_DIR ? path.dirname(process.env.IV_CACHE_DIR) : null);
  return path.resolve(expandHome(explicit || path.join(__dirname, '..', '..', 'jobs', 'data')));
}
class StorageService {
  /**
   * Initializes the base directory structures.
   */
  static init() {
    const root = resolveDataRoot();
    ['entities', 'events', 'documents'].forEach(dir => {
      fs.mkdirSync(path.join(root, dir), { recursive: true });
    });
  }

  /**
   * Save a JSON object locally and trigger an async upload to Google Drive.
   * 
   * @param {string} localRelPath - The relative path within the data root (e.g., 'entities/companies/A/AAPL/meta.json')
   * @param {object} jsonObject - The data to store
   * @param {boolean} [sync=false] - If true, await the Drive upload instead of fire-and-forget
   */
  static async saveJson(localRelPath, jsonObject, sync = false) {
    const root = resolveDataRoot();
    const absPath = path.join(root, localRelPath);
    
    // 1. Ensure directory exists and write locally
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, JSON.stringify(jsonObject, null, 2) + '\n');
    
    return this._uploadToDrive(localRelPath, absPath, sync);
  }

  /**
   * Save plain text or HTML content locally and trigger an async upload to Google Drive.
   * 
   * @param {string} localRelPath
   * @param {string} content
   * @param {boolean} [sync=false]
   */
  static async saveContent(localRelPath, content, sync = false) {
    const root = resolveDataRoot();
    const absPath = path.join(root, localRelPath);
    
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content);
    
    return this._uploadToDrive(localRelPath, absPath, sync);
  }

  static async _uploadToDrive(localRelPath, absPath, sync) {
    if (!driveApi.isApiConfigured()) return;
    const { drive } = driveApi.createDriveClient();
    const driveRootPath = process.env.COWORK_DRIVE_PATH || driveApi.DEFAULT_ROOT_PATH;
    const driveRel = localRelPath;
    
    const uploadPromise = driveApi.uploadFile(drive, driveRootPath, driveRel, absPath)
      .then(res => {
        if (process.env.COWORK_DRIVE_LOG === '1') {
          console.error(`[StorageService] Uploaded ${driveRel} to Drive (${res.action})`);
        }
      })
      .catch(err => {
        console.error(`[StorageService] Failed to upload ${driveRel}:`, err.message);
      });

    if (sync) {
      await uploadPromise;
    }
  }

  /**
   * Save an entity with append-only versioning.
   * Updates the materialized view and stores a versioned copy.
   * 
   * @param {string} entityType - e.g., 'companies'
   * @param {string} partition - e.g., 'A'
   * @param {string} entityId - e.g., 'AAPL'
   * @param {object} jsonObject - The entity data
   */
  static async saveEntity(entityType, partition, entityId, jsonObject) {
    const timestamp = Date.now();
    
    // Materialized view
    const metaPath = `entities/${entityType}/${partition}/${entityId}/meta.json`;
    // Append-only history
    const historyPath = `entities/${entityType}/${partition}/${entityId}/history/${timestamp}.json`;
    
    // Fire off both saves (they internally fire-and-forget the Drive upload unless sync=true)
    await Promise.all([
      this.saveJson(metaPath, jsonObject, false),
      this.saveJson(historyPath, jsonObject, false)
    ]);
  }
  
  /**
   * Reads a local JSON file.
   * @param {string} localRelPath 
   * @returns {object|null}
   */
  static readJson(localRelPath) {
    const root = resolveDataRoot();
    const absPath = path.join(root, localRelPath);
    if (!fs.existsSync(absPath)) return null;
    return JSON.parse(fs.readFileSync(absPath, 'utf8'));
  }

  /**
   * Reads a local text file.
   * @param {string} localRelPath 
   * @returns {string|null}
   */
  static readContent(localRelPath) {
    const root = resolveDataRoot();
    const absPath = path.join(root, localRelPath);
    if (!fs.existsSync(absPath)) return null;
    return fs.readFileSync(absPath, 'utf8');
  }

  /**
   * Helper to generate standardized DTO asset paths for time-series events.
   * @param {string} prefix - e.g., 'digest'
   * @param {Date} date - Event date
   * @param {string} baseFolder - e.g., 'documents/deals_digest'
   * @returns {object} { jsonPath, htmlPath, pdfPath, assetsMap }
   */
  static getEventDtoPaths(prefix, date, baseFolder) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    
    // Partition by YYYY/MM to avoid huge folders
    const partition = `${yyyy}/${mm}`;
    const baseName = `${prefix}_${yyyy}${mm}${dd}`;
    
    return {
      jsonPath: `${baseFolder}/${partition}/${baseName}.json`,
      htmlPath: `${baseFolder}/${partition}/${baseName}.html`,
      pdfPath: `${baseFolder}/${partition}/${baseName}.pdf`,
      assetsMap: {
        json: `${baseName}.json`,
        html: `${baseName}.html`,
        pdf: `${baseName}.pdf`
      }
    };
  }
}

module.exports = StorageService;
