'use strict';

const { updateSidecarsConfig } = require('../antigravity-sync-tasks-and-skills');

describe('antigravity-sync: updateSidecarsConfig', () => {
  const PROJ_ID = 'test-project-12345';

  describe('new sidecars', () => {
    test('initializes newly discovered sidecars as disabled (enabled: false)', () => {
      const configData = {
        sidecars: {},
      };
      const syncedFolders = ['dailygainersdigest', 'new-task-digest'];

      const result = updateSidecarsConfig(configData, syncedFolders, PROJ_ID);

      expect(result.sidecars['dailygainersdigest']).toEqual({
        enabled: false,
        projectId: PROJ_ID,
      });
      expect(result.sidecars['new-task-digest']).toEqual({
        enabled: false,
        projectId: PROJ_ID,
      });
    });

    test('initializes sidecars object if missing in configData and sets enabled: false', () => {
      const configData = {};
      const syncedFolders = ['brand-new-sidecar'];

      const result = updateSidecarsConfig(configData, syncedFolders, PROJ_ID);

      expect(result.sidecars).toBeDefined();
      expect(result.sidecars['brand-new-sidecar']).toEqual({
        enabled: false,
        projectId: PROJ_ID,
      });
    });
  });

  describe('existing sidecars state persistence', () => {
    test('persists enabled: true for previously enabled sidecars', () => {
      const configData = {
        sidecars: {
          'daily-deals-digest': {
            enabled: true,
            projectId: 'old-proj-id',
          },
        },
      };
      const syncedFolders = ['daily-deals-digest'];

      const result = updateSidecarsConfig(configData, syncedFolders, PROJ_ID);

      expect(result.sidecars['daily-deals-digest'].enabled).toBe(true);
      expect(result.sidecars['daily-deals-digest'].projectId).toBe(PROJ_ID);
    });

    test('persists enabled: false for previously disabled sidecars', () => {
      const configData = {
        sidecars: {
          'order-book-sync': {
            enabled: false,
            projectId: 'old-proj-id',
          },
        },
      };
      const syncedFolders = ['order-book-sync'];

      const result = updateSidecarsConfig(configData, syncedFolders, PROJ_ID);

      expect(result.sidecars['order-book-sync'].enabled).toBe(false);
      expect(result.sidecars['order-book-sync'].projectId).toBe(PROJ_ID);
    });

    test('preserves mixed existing sidecars while keeping new ones disabled', () => {
      const configData = {
        sidecars: {
          'task-enabled': { enabled: true, projectId: 'old' },
          'task-disabled': { enabled: false, projectId: 'old' },
          'unrelated-task': { enabled: true, projectId: 'other-proj' },
        },
      };
      const syncedFolders = ['task-enabled', 'task-disabled', 'newly-added-task'];

      const result = updateSidecarsConfig(configData, syncedFolders, PROJ_ID);

      // Existing task states preserved
      expect(result.sidecars['task-enabled'].enabled).toBe(true);
      expect(result.sidecars['task-disabled'].enabled).toBe(false);
      // New task initialized to false
      expect(result.sidecars['newly-added-task'].enabled).toBe(false);
      // Project ID updated on synced tasks
      expect(result.sidecars['task-enabled'].projectId).toBe(PROJ_ID);
      expect(result.sidecars['task-disabled'].projectId).toBe(PROJ_ID);
      expect(result.sidecars['newly-added-task'].projectId).toBe(PROJ_ID);
      // Unrelated task untouched
      expect(result.sidecars['unrelated-task']).toEqual({
        enabled: true,
        projectId: 'other-proj',
      });
    });
  });

  describe('edge cases and fallback handling', () => {
    test('defaults to enabled: false when existing entry lacks a boolean enabled property', () => {
      const configData = {
        sidecars: {
          'legacy-entry': {
            projectId: 'legacy-id',
          },
        },
      };
      const syncedFolders = ['legacy-entry'];

      const result = updateSidecarsConfig(configData, syncedFolders, PROJ_ID);

      expect(result.sidecars['legacy-entry'].enabled).toBe(false);
      expect(result.sidecars['legacy-entry'].projectId).toBe(PROJ_ID);
    });

    test('works gracefully when projId is undefined (does not set projectId)', () => {
      const configData = {
        sidecars: {
          'existing-task': { enabled: true, projectId: 'existing-id' },
        },
      };
      const syncedFolders = ['existing-task', 'new-task'];

      const result = updateSidecarsConfig(configData, syncedFolders, undefined);

      expect(result.sidecars['existing-task'].enabled).toBe(true);
      expect(result.sidecars['existing-task'].projectId).toBe('existing-id');
      expect(result.sidecars['new-task']).toEqual({
        enabled: false,
      });
    });

    test('handles empty syncedFolders array without mutating existing sidecars', () => {
      const configData = {
        sidecars: {
          existing: { enabled: true },
        },
      };

      const result = updateSidecarsConfig(configData, [], PROJ_ID);

      expect(result.sidecars).toEqual({
        existing: { enabled: true },
      });
    });
  });
});
