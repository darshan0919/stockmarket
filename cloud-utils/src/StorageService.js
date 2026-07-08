'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

/**
 * Data Ecosystem v2 root: <repo>/data (override: DATA_V2_DIR).
 * Legacy jobs/data & COWORK_DATA_DIR/WI_DATA_DIR envs are retired.
 */
function resolveDataRoot() {
  const explicit = process.env.DATA_V2_DIR;
  return path.resolve(expandHome(explicit || path.join(__dirname, '..', '..', 'data')));
}

/**
 * StorageService — v2 FILE helper (docs/DATA_ECOSYSTEM.md).
 *
 * Only for non-collection artifacts under data/: `runs/` (raw per-run dumps),
 * `cache/` (regenerable derivables + small dedupe-state blobs), `assets/`
 * (rendered HTML/PDF). Collections (companies/reports/notes/theses/validation/
 * events-*.json) must ONLY be touched via packages/jobs-runtime/lib/db.js.
 *
 * No per-file Drive uploads here anymore — syncing is done once per run by
 * `packages/jobs-runtime/scripts/data.js push` (push-only, keeps local files).
 */
class StorageService {
  static init() {
    const root = resolveDataRoot();
    ['runs', 'cache', 'assets'].forEach((dir) => {
      fs.mkdirSync(path.join(root, dir), { recursive: true });
    });
  }

  static _guard(localRelPath) {
    const rel = String(localRelPath).replace(/\\/g, '/');
    if (/^(companies|reports|notes|theses|validation|events-\d{4}-\d{2})\.json$/.test(rel)) {
      throw new Error(
        `StorageService must not write collection file "${rel}" — use packages/jobs-runtime/lib/db.js`
      );
    }
    return rel;
  }

  static async saveJson(localRelPath, jsonObject) {
    const rel = this._guard(localRelPath);
    const absPath = path.join(resolveDataRoot(), rel);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    const tmp = `${absPath}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(jsonObject, null, 2) + '\n');
    fs.renameSync(tmp, absPath);
  }

  static async saveContent(localRelPath, content) {
    const rel = this._guard(localRelPath);
    const absPath = path.join(resolveDataRoot(), rel);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    const tmp = `${absPath}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, absPath);
  }

  static readJson(localRelPath) {
    const absPath = path.join(resolveDataRoot(), localRelPath);
    if (!fs.existsSync(absPath)) return null;
    return JSON.parse(fs.readFileSync(absPath, 'utf8'));
  }

  static readContent(localRelPath) {
    const absPath = path.join(resolveDataRoot(), localRelPath);
    if (!fs.existsSync(absPath)) return null;
    return fs.readFileSync(absPath, 'utf8');
  }

  /**
   * Standardized v2 paths for a dated run artifact:
   * JSON dump → runs/, rendered HTML/PDF → assets/. Flat names (no folders).
   */
  static getEventDtoPaths(prefix, date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const baseName = `${prefix}_${yyyy}${mm}${dd}`;
    return {
      jsonPath: `runs/${baseName}.json`,
      htmlPath: `assets/${baseName}.html`,
      pdfPath: `assets/${baseName}.pdf`,
      assetsMap: { json: `${baseName}.json`, html: `${baseName}.html`, pdf: `${baseName}.pdf` },
    };
  }
}

module.exports = StorageService;
module.exports.resolveDataRoot = resolveDataRoot;
