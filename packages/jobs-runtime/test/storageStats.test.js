'use strict';

const {
  formatBytes,
  getCollectionStorageStats,
  renderStorageStatsTable,
  printStorageStatsTable,
} = require('../lib/storageStats');
const db = require('../lib/db');

describe('storageStats library', () => {
  describe('formatBytes', () => {
    test('formats bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(null)).toBe('0 B');
      expect(formatBytes(undefined)).toBe('0 B');
      expect(formatBytes(512)).toBe('512 B');
      expect(formatBytes(2048)).toBe('2.0 KB');
      expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB');
      expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.50 GB');
    });
  });

  describe('getCollectionStorageStats', () => {
    test('returns structured stats for all collections, transcripts, cache, and runs', () => {
      const stats = getCollectionStorageStats(db.dataRoot());
      expect(Array.isArray(stats)).toBe(true);
      expect(stats.length).toBeGreaterThanOrEqual(25);

      for (const row of stats) {
        expect(row).toHaveProperty('collection');
        expect(row).toHaveProperty('scope');
        expect(row).toHaveProperty('totalBytes');
        expect(row).toHaveProperty('fileCount');
        expect(row).toHaveProperty('storageDesign');

        expect(typeof row.collection).toBe('string');
        expect(typeof row.scope).toBe('string');
        expect(typeof row.totalBytes).toBe('number');
        expect(typeof row.fileCount).toBe('number');
        expect(typeof row.storageDesign).toBe('string');
      }

      const scopes = new Set(stats.map((r) => r.scope));
      expect(scopes.has('Collection')).toBe(true);
      expect(scopes.has('Transcripts')).toBe(true);
      expect(scopes.has('Cache')).toBe(true);
      expect(scopes.has('Runs')).toBe(true);
    });
  });

  describe('renderStorageStatsTable', () => {
    test('renders table with all required headers and total footer', () => {
      const stats = getCollectionStorageStats(db.dataRoot());
      const table = renderStorageStatsTable(stats);

      expect(table).toContain('COLLECTION STORAGE DESIGN & SIZING SUMMARY');
      expect(table).toContain('Collection');
      expect(table).toContain('Scope');
      expect(table).toContain('Total Size');
      expect(table).toContain('File Count');
      expect(table).toContain('Storage Design');
      expect(table).toContain('TOTAL (');
      expect(table).toContain('All Scopes');
      expect(table).toContain('100 KB – 10 MB Sweet Spot');
    });
  });

  describe('printStorageStatsTable', () => {
    test('executes without throwing and outputs table', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      try {
        printStorageStatsTable(db.dataRoot());
        expect(spy).toHaveBeenCalled();
        const logged = spy.mock.calls[0][0];
        expect(logged).toContain('COLLECTION STORAGE DESIGN & SIZING SUMMARY');
      } finally {
        spy.mockRestore();
      }
    });
  });
});
