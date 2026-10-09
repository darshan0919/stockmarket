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

describe('antigravity-sync: compressDescription and writeRouterSkill', () => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const { compressDescription, writeRouterSkill } = require('../antigravity-sync-tasks-and-skills');

  describe('compressDescription', () => {
    test('returns empty string when description is null or empty', () => {
      expect(compressDescription('')).toBe('');
      expect(compressDescription(null)).toBe('');
    });

    test('preserves short descriptions as-is', () => {
      const shortDesc = 'Single-quarter result interpretation for Indian listed companies.';
      expect(compressDescription(shortDesc)).toBe(shortDesc);
    });

    test('compresses verbose descriptions under maxLen while preserving first sentence and trigger phrases', () => {
      const longDesc =
        'Stage 2 of the 2-skill quarterly-result pipeline for Indian listed companies across Business, Risk, Management. ' +
        'Use whenever the user uploads a quarterly investor presentation or result PDF and asks "analyse this quarter". ' +
        'Also supports single-statement quality modes via --statement income|balance-sheet|cashflow: a lean, bulk-safe path that grades ONE financial statement. ' +
        'Output is a deterministic Drive-shareable PDF report opening with a bird-eye KPI strip. NOT for two-quarter forensic diffs or transcript-only dives.';

      const result = compressDescription(longDesc, 280);
      expect(result.length).toBeLessThanOrEqual(280);
      expect(result).toContain('Stage 2');
      expect(result).toContain('Use whenever');
    });

    test('strips leading YAML block indicators like >- or >', () => {
      const yamlDesc =
        '>-\n  A specialized equity research skill for company valuation.\n  Use when requested.';
      const result = compressDescription(yamlDesc);
      expect(result.startsWith('>-')).toBe(false);
      expect(result.startsWith('>')).toBe(false);
      expect(result).toContain('A specialized equity research skill');
    });
  });

  describe('writeRouterSkill', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-skill-test-'));
    });

    afterEach(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('creates router SKILL.md pointing to repo source and deletes extraneous files', () => {
      // Simulate an old dirty skill directory with leftover files
      fs.writeFileSync(path.join(tmpDir, 'old-script.js'), 'console.log("debris");');
      fs.writeFileSync(path.join(tmpDir, 'reference.md'), '# Old reference');

      writeRouterSkill(
        'test-skill',
        'Test skill description for unit tests. Use when testing router generation.',
        'skills/equity-research/test-skill/SKILL.md',
        tmpDir
      );

      const files = fs.readdirSync(tmpDir);
      expect(files).toEqual(['SKILL.md']);

      const content = fs.readFileSync(path.join(tmpDir, 'SKILL.md'), 'utf8');
      expect(content).toContain('name: test-skill');
      expect(content).toContain('Router for the "test-skill" skill');
      expect(content).toContain('skills/registry.json');
      expect(content).toContain('skills/equity-research/test-skill/SKILL.md');
      expect(content).not.toContain('old-script.js');
    });
  });
});
