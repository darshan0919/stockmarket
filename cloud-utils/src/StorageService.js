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
const _touched = new Set();
function trackTouched(absPath) {
  try {
    _touched.add(path.relative(resolveDataRoot(), absPath).split(path.sep).join('/'));
  } catch (_) {
    /* best effort */
  }
}

const crypto = require('crypto');

function md5Shard(str) {
  return crypto.createHash('md5').update(String(str)).digest('hex')[0].toLowerCase();
}

function parseShardedPath(localRelPath) {
  const rel = String(localRelPath).replace(/\\/g, '/').replace(/^\/+/, '');

  // 1. Sharded cache stores with MD5 hex keys
  const mHex = rel.match(
    /^cache\/(pdf-text|pdf-text-full|monthly-updates-text|monthly-updates-parsed)\/([0-9a-fA-F]+)\.json$/
  );
  if (mHex) {
    const folder = mHex[1];
    const key = mHex[2];
    const shard = key[0].toLowerCase();
    return { folder, key, shardRelPath: `cache/${folder}/shard_${shard}.jsonl` };
  }

  // cache/doc-extracts/<category>/<hex>.json
  const mDoc = rel.match(/^cache\/doc-extracts\/([^/]+)\/([0-9a-fA-F]+)\.json$/);
  if (mDoc) {
    const category = mDoc[1];
    const key = mDoc[2];
    const shard = key[0].toLowerCase();
    return { folder: `doc-extracts/${category}`, key, shardRelPath: `cache/doc-extracts/${category}/shard_${shard}.jsonl` };
  }

  // 2. High-cardinality stores sharded by md5(key)[0]
  const mTickerShard = rel.match(
    /^cache\/(stockscans-context|company-baselines|event-reaction)\/([^/]+)\.json$/
  );
  if (mTickerShard) {
    const folder = mTickerShard[1];
    const key = mTickerShard[2];
    const shard = md5Shard(key);
    return { folder, key, shardRelPath: `cache/${folder}/shard_${shard}.jsonl` };
  }

  // cache/rerating-catalysts/<subfolder>/<id>.json
  const mCatalyst = rel.match(/^cache\/rerating-catalysts\/([^/]+)\/([^/]+)\.json$/);
  if (mCatalyst) {
    const subfolder = mCatalyst[1];
    const key = mCatalyst[2];
    const shard = md5Shard(key);
    return { folder: `rerating-catalysts/${subfolder}`, key, shardRelPath: `cache/rerating-catalysts/${subfolder}/shard_${shard}.jsonl` };
  }

  // 3. Per-ticker JSONL stores
  const mOrder = rel.match(/^cache\/order-announcements\/([^/]+)\/([^/]+)\.json$/);
  if (mOrder) {
    const ticker = mOrder[1];
    const key = mOrder[2];
    const safeTicker = ticker.replace(/[^a-zA-Z0-9_:-]/g, '_');
    return { folder: 'order-announcements', key, shardRelPath: `cache/order-announcements/${safeTicker}.jsonl` };
  }

  const mConcall = rel.match(/^cache\/concall-notes\/([^/]+)\/([^/]+)\.json$/);
  if (mConcall) {
    const ticker = mConcall[1];
    const key = mConcall[2];
    const safeTicker = ticker.replace(/[^a-zA-Z0-9_:-]/g, '_');
    return { folder: 'concall-notes', key, shardRelPath: `cache/concall-notes/${safeTicker}.jsonl` };
  }

  // 4. Single JSONL stores
  const mScanner = rel.match(/^cache\/gainers-scanner\/([^/]+)\.json$/);
  if (mScanner && !mScanner[1].endsWith('.jsonl') && mScanner[1] !== 'scanner') {
    return { folder: 'gainers-scanner', key: mScanner[1], shardRelPath: 'cache/gainers-scanner/scanner.jsonl' };
  }

  const mMonthScan = rel.match(/^cache\/monthly-updates-scan\/([^/]+)\.json$/);
  if (mMonthScan && !mMonthScan[1].endsWith('.jsonl') && mMonthScan[1] !== 'scans') {
    return { folder: 'monthly-updates-scan', key: mMonthScan[1], shardRelPath: 'cache/monthly-updates-scan/scans.jsonl' };
  }

  // 5. Daily run dumps in runs/
  const mRun = rel.match(
    /^runs\/(gainers_raw|gainers_insights|gainers_why|volume_rocketing_raw|volume_rocketing_insights|digest|ipo_subscription)_(\d{4})\d{4}\.json$/
  );
  if (mRun) {
    const prefix = mRun[1].replace(/_/g, '-');
    const year = mRun[2];
    const key = path.basename(rel, '.json');
    return { folder: 'runs', key, shardRelPath: `runs/${prefix}-${year}.jsonl` };
  }

  return null;
}

const _shardCache = new Map();

function loadShard(shardRelPath) {
  if (_shardCache.has(shardRelPath)) {
    return _shardCache.get(shardRelPath);
  }
  const map = new Map();
  const absPath = path.join(resolveDataRoot(), shardRelPath);
  if (!fs.existsSync(absPath)) {
    _shardCache.set(shardRelPath, map);
    return map;
  }
  try {
    const content = fs.readFileSync(absPath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const record = JSON.parse(trimmed);
        const id = record._key || record.id || record.hash;
        if (id) map.set(String(id), record);
      } catch (_) {}
    }
  } catch (_) {}
  _shardCache.set(shardRelPath, map);
  return map;
}

class StorageService {
  /** Run manifest (docs/DATA_RULES.md §8): data-root-relative paths written by this process. */
  static touchedFiles() {
    return [..._touched].sort();
  }

  static clearShardCache() {
    _shardCache.clear();
  }

  static parseShardedPath(localRelPath) {
    return parseShardedPath(localRelPath);
  }

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
    const sharded = parseShardedPath(rel);

    if (sharded) {
      const absShardPath = path.join(resolveDataRoot(), sharded.shardRelPath);
      fs.mkdirSync(path.dirname(absShardPath), { recursive: true });
      const shardMap = loadShard(sharded.shardRelPath);
      const storedRecord = { ...jsonObject, _key: sharded.key };
      shardMap.set(sharded.key, storedRecord);
      fs.appendFileSync(absShardPath, JSON.stringify(storedRecord) + '\n', 'utf8');
      trackTouched(absShardPath);
      return;
    }

    const absPath = path.join(resolveDataRoot(), rel);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    const tmp = `${absPath}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(jsonObject, null, 2) + '\n');
    fs.renameSync(tmp, absPath);
    trackTouched(absPath);
  }

  static async saveContent(localRelPath, content) {
    const rel = this._guard(localRelPath);
    const absPath = path.join(resolveDataRoot(), rel);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    const tmp = `${absPath}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, absPath);
    trackTouched(absPath);
  }

  static readJson(localRelPath) {
    const rel = String(localRelPath).replace(/\\/g, '/').replace(/^\/+/, '');
    const sharded = parseShardedPath(rel);

    if (sharded) {
      const shardMap = loadShard(sharded.shardRelPath);
      const record = shardMap.get(sharded.key);
      if (!record) return null;
      const copy = { ...record };
      delete copy._key;
      return copy;
    }

    const absPath = path.join(resolveDataRoot(), rel);
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
