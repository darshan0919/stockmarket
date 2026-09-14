'use strict';

/**
 * jsonlStore.js — Size-optimized, partitioned JSONL storage engine.
 *
 * Consolidates high-frequency small files into partitioned JSON Lines stores
 * targeting the 100 KB – 5 MB "sweet spot". Features:
 *  - Partitioning schemes: Time (monthly YYYY-MM), Hash Prefix (16-shard), Domain (course, channel)
 *  - O(1) atomic line-appends with advisory file-level locking
 *  - In-memory partition cache (last-write-wins per ID) with instantaneous process-level lookups
 *  - Deduplicating compaction for offline/sync maintenance
 *  - Transparent read/write API for db.js and StorageService
 */

const fs = require('fs');
const path = require('path');

/**
 * Extract YYYY-MM from date string or ID containing YYYY-MM-DD or YYYYMM.
 * @param {string} str
 * @returns {string|null}
 */
function extractYearMonth(str) {
  if (!str || typeof str !== 'string') return null;
  const m1 = str.match(/(\d{4})-(\d{2})/);
  if (m1) return `${m1[1]}-${m1[2]}`;
  const m2 = str.match(/(\d{4})(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}`;
  return null;
}

/**
 * Extract YYYY from date string or ID.
 * @param {string} str
 * @returns {string|null}
 */
function extractYear(str) {
  if (!str || typeof str !== 'string') return null;
  const match = str.match(/(\d{4})/);
  return match ? match[1] : null;
}

/**
 * Extract YYYY-Q[1-4] from date string or ID.
 * Calendar quarters: Q1 (Jan-Mar), Q2 (Apr-Jun), Q3 (Jul-Sep), Q4 (Oct-Dec).
 * @param {string} str
 * @returns {string|null}
 */
function extractQuarter(str) {
  const ym = extractYearMonth(str);
  if (!ym) {
    const y = extractYear(str);
    return y ? `${y}-Q1` : null;
  }
  const [year, monthStr] = ym.split('-');
  const month = parseInt(monthStr, 10);
  if (month >= 1 && month <= 3) return `${year}-Q1`;
  if (month >= 4 && month <= 6) return `${year}-Q2`;
  if (month >= 7 && month <= 9) return `${year}-Q3`;
  if (month >= 10 && month <= 12) return `${year}-Q4`;
  return `${year}-Q1`;
}

/**
 * Quarterly partitioner (e.g. reports-2026-Q1.jsonl).
 * @param {object} [opts]
 * @param {string} [opts.filePrefix='']
 * @param {string} [opts.field='date']
 * @returns {(id: string, record: object|null, hint: object|string|null) => string}
 */
function quarterlyPartitioner(opts = {}) {
  const filePrefix = opts.filePrefix || '';
  const field = opts.field || 'date';
  return (id, record, hint) => {
    let raw = null;
    if (typeof hint === 'string') raw = hint;
    else if (hint && hint[field]) raw = hint[field];
    else if (hint && hint.date) raw = hint.date;
    else if (record && record[field]) raw = record[field];
    else if (record && record.date) raw = record.date;
    else if (id) raw = id;

    const yq = extractQuarter(raw) || 'unknown';
    return `${filePrefix}${yq}.jsonl`;
  };
}

/**
 * Annual partitioner (e.g. conversations-2026.jsonl, events-2026.jsonl).
 * @param {object} [opts]
 * @param {string} [opts.filePrefix='']
 * @param {string} [opts.field='date']
 * @returns {(id: string, record: object|null, hint: object|string|null) => string}
 */
function annualPartitioner(opts = {}) {
  const filePrefix = opts.filePrefix || '';
  const field = opts.field || 'date';
  return (id, record, hint) => {
    let raw = null;
    if (typeof hint === 'string') raw = hint;
    else if (hint && hint[field]) raw = hint[field];
    else if (hint && hint.date) raw = hint.date;
    else if (record && record[field]) raw = record[field];
    else if (record && record.date) raw = record.date;
    else if (id) raw = id;

    const year = extractYear(raw) || 'unknown';
    return `${filePrefix}${year}.jsonl`;
  };
}

/**
 * Time-based partitioner (monthly partitions by default).
 * @param {object} [opts]
 * @param {string} [opts.filePrefix='']
 * @param {string} [opts.field='date']
 * @returns {(id: string, record: object|null, hint: object|string|null) => string}
 */
function timePartitioner(opts = {}) {
  const filePrefix = opts.filePrefix || '';
  const field = opts.field || 'date';
  return (id, record, hint) => {
    let raw = null;
    if (typeof hint === 'string') raw = hint;
    else if (hint && hint[field]) raw = hint[field];
    else if (hint && hint.date) raw = hint.date;
    else if (record && record[field]) raw = record[field];
    else if (record && record.date) raw = record.date;
    else if (id) raw = id;

    const ym = extractYearMonth(raw) || 'unknown';
    return `${filePrefix}${ym}.jsonl`;
  };
}

/**
 * Key-prefix hash partitioner (16 shards 0-f by default).
 * @param {object} [opts]
 * @param {string} [opts.filePrefix='shard_']
 * @returns {(id: string, record: object|null, hint: object|string|null) => string}
 */
function hashPartitioner(opts = {}) {
  const filePrefix = opts.filePrefix || 'shard_';
  return (id, record, hint) => {
    const key = (typeof hint === 'string' ? hint : null) || (record && record.key) || id || '';
    const cleanKey = String(key).toLowerCase().replace(/[^0-9a-f]/g, '');
    const shard = cleanKey.length > 0 ? cleanKey[0] : '0';
    return `${filePrefix}${shard}.jsonl`;
  };
}

/**
 * Domain-based partitioner.
 * @param {object} opts
 * @param {string} [opts.filePrefix='']
 * @param {(id: string, record: object|null, hint: any) => string} opts.keyFn
 * @returns {(id: string, record: object|null, hint: any) => string}
 */
function domainPartitioner(opts = {}) {
  const filePrefix = opts.filePrefix || '';
  const keyFn = opts.keyFn;
  if (typeof keyFn !== 'function') throw new Error('domainPartitioner requires keyFn');
  return (id, record, hint) => {
    const rawKey = keyFn(id, record, hint);
    const safeKey = String(rawKey || 'general').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${filePrefix}${safeKey}.jsonl`;
  };
}

/**
 * Channel-level YouTube partitioner.
 * @returns {(id: string, record: object|null, hint: object|string|null) => string}
 */
function youtubeChannelPartitioner() {
  return (id, record, hint) => {
    const channelId =
      (hint && hint.channelId) ||
      (record && record.channelId) ||
      (hint && typeof hint === 'string' ? hint : '') ||
      '';
    if (channelId.includes('UC5mK0-K-r3KET0kifn-mJMg') || channelId.toLowerCase().includes('anil')) {
      return 'anillamba.jsonl';
    }
    return 'soicfinance.jsonl';
  };
}

/**
 * Single-file partitioner.
 * @param {string} fileName
 * @returns {() => string}
 */
function singlePartitioner(fileName) {
  return () => fileName;
}

class JsonlStore {
  /**
   * @param {object} opts
   * @param {string} opts.baseDir - absolute path to directory containing partition files
   * @param {function} opts.partitioner - (id, record, hint) => partitionFileName
   * @param {string} [opts.idField='id'] - property name for record identifier
   * @param {string} [opts.lockPrefix='jsonl'] - lockfile prefix
   * @param {(filePath: string) => void} [opts.trackTouched] - callback when file is written
   * @param {(name: string, fn: function) => any} [opts.withLock] - advisory lock helper
   */
  constructor(opts = {}) {
    if (!opts.baseDir) throw new Error('JsonlStore requires baseDir');
    if (typeof opts.partitioner !== 'function') throw new Error('JsonlStore requires partitioner');

    this.baseDir = path.resolve(opts.baseDir);
    this.partitioner = opts.partitioner;
    this.idField = opts.idField || 'id';
    this.lockPrefix = opts.lockPrefix || 'jsonl';
    this.trackTouched = opts.trackTouched || (() => {});
    this.withLock = opts.withLock || ((_, fn) => fn());

    // In-memory cache: partitionFileName -> Map<id, record>
    this._cache = new Map();
  }

  /**
   * Resolve relative or absolute partition file path.
   * @param {string} fileName
   * @returns {string}
   */
  getPartitionPath(fileName) {
    return path.join(this.baseDir, fileName);
  }

  /**
   * Load entire partition file into in-memory Map (latest write wins).
   * @param {string} partitionName
   * @returns {Map<string, object>}
   */
  _loadPartition(partitionName) {
    if (this._cache.has(partitionName)) {
      return this._cache.get(partitionName);
    }

    const map = new Map();
    const filePath = this.getPartitionPath(partitionName);
    if (!fs.existsSync(filePath)) {
      this._cache.set(partitionName, map);
      return map;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const record = JSON.parse(trimmed);
        const id = record[this.idField] !== undefined ? String(record[this.idField]) : null;
        if (id !== null) {
          map.set(id, record);
        }
      } catch (_) {
        // Skip corrupt line in JSONL gracefully
      }
    }

    this._cache.set(partitionName, map);
    return map;
  }

  /**
   * Get a single record by ID.
   * @param {string} id
   * @param {any} [hint]
   * @returns {object|null}
   */
  get(id, hint = null) {
    if (id === undefined || id === null) return null;
    const key = String(id);
    const partitionName = this.partitioner(key, null, hint);
    const map = this._loadPartition(partitionName);
    return map.get(key) || null;
  }

  /**
   * Check if a record exists.
   * @param {string} id
   * @param {any} [hint]
   * @returns {boolean}
   */
  has(id, hint = null) {
    return this.get(id, hint) !== null;
  }

  /**
   * Save a single record (appends to partition file, updates memory cache).
   * @param {string} id
   * @param {object} record
   * @param {any} [hint]
   * @returns {void}
   */
  set(id, record, hint = null) {
    this.setMany([record], hint);
  }

  /**
   * Batch save records.
   * @param {Array<object>} records
   * @param {any} [hint]
   * @returns {void}
   */
  setMany(records, hint = null) {
    if (!Array.isArray(records) || records.length === 0) return;

    fs.mkdirSync(this.baseDir, { recursive: true });

    // Group records by partition file
    const byPartition = new Map();
    for (const rec of records) {
      const id = rec[this.idField] !== undefined ? String(rec[this.idField]) : null;
      if (!id) throw new Error(`Record missing idField "${this.idField}"`);
      const partitionName = this.partitioner(id, rec, hint);
      if (!byPartition.has(partitionName)) byPartition.set(partitionName, []);
      byPartition.get(partitionName).push(rec);
    }

    for (const [partitionName, recs] of byPartition) {
      const filePath = this.getPartitionPath(partitionName);
      const lockName = `${this.lockPrefix}-${partitionName.replace(/\.jsonl$/, '')}`;

      this.withLock(lockName, () => {
        // Ensure in-memory map is loaded before appending
        const map = this._loadPartition(partitionName);

        let linesToAppend = '';
        for (const rec of recs) {
          const id = String(rec[this.idField]);
          linesToAppend += JSON.stringify(rec) + '\n';
          map.set(id, rec);
        }

        fs.appendFileSync(filePath, linesToAppend, 'utf8');
        this.trackTouched(filePath);
      });
    }
  }

  /**
   * Find records matching predicate across one or all partitions.
   * @param {(record: object) => boolean} predicate
   * @param {any} [hint] - if provided, restricts search to that partition
   * @returns {Array<object>}
   */
  find(predicate, hint = null) {
    const partitionsToScan = [];
    if (hint) {
      partitionsToScan.push(this.partitioner('', null, hint));
    } else {
      partitionsToScan.push(...this.listPartitions());
    }

    const matches = [];
    for (const p of partitionsToScan) {
      const map = this._loadPartition(p);
      for (const rec of map.values()) {
        if (!predicate || predicate(rec)) {
          matches.push(rec);
        }
      }
    }
    return matches;
  }

  /**
   * Get all records in a partition or across all partitions.
   * @param {any} [hint]
   * @returns {Array<object>}
   */
  all(hint = null) {
    return this.find(null, hint);
  }

  /**
   * Compact a partition file by removing duplicate lines (latest write wins).
   * @param {string} partitionName
   * @returns {{ beforeCount: number, afterCount: number }}
   */
  compact(partitionName) {
    const filePath = this.getPartitionPath(partitionName);
    if (!fs.existsSync(filePath)) return { beforeCount: 0, afterCount: 0 };

    const lockName = `${this.lockPrefix}-${partitionName.replace(/\.jsonl$/, '')}`;
    return this.withLock(lockName, () => {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      const beforeCount = lines.length;

      const map = new Map();
      for (const line of lines) {
        try {
          const rec = JSON.parse(line);
          const id = rec[this.idField] !== undefined ? String(rec[this.idField]) : null;
          if (id !== null) map.set(id, rec);
        } catch (_) {}
      }

      const tmpPath = `${filePath}.compact.tmp.${process.pid}`;
      const compactedContent =
        Array.from(map.values())
          .map((r) => JSON.stringify(r))
          .join('\n') + '\n';

      fs.writeFileSync(tmpPath, compactedContent, 'utf8');
      fs.renameSync(tmpPath, filePath);
      this._cache.set(partitionName, map);
      this.trackTouched(filePath);

      return { beforeCount, afterCount: map.size };
    });
  }

  /**
   * List all partition files currently present in baseDir.
   * @returns {Array<string>}
   */
  listPartitions() {
    if (!fs.existsSync(this.baseDir)) return [];
    return fs
      .readdirSync(this.baseDir)
      .filter((f) => f.endsWith('.jsonl') && !f.includes('.tmp.'))
      .sort();
  }

  /**
   * Clear in-memory cache.
   */
  clearMemoryCache() {
    this._cache.clear();
  }
}

module.exports = {
  JsonlStore,
  timePartitioner,
  quarterlyPartitioner,
  annualPartitioner,
  hashPartitioner,
  domainPartitioner,
  youtubeChannelPartitioner,
  singlePartitioner,
  extractYearMonth,
  extractYear,
  extractQuarter,
};
