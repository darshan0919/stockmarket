'use strict';

const path = require('path');
const {
  getGitReadableFiles,
  discoverSystemRoots,
  checkExternalReferences,
} = require('../../../scripts/dead-code-scanner');

describe('dead-code-scanner', () => {
  const rootDir = path.resolve(__dirname, '../../..');

  describe('getGitReadableFiles', () => {
    test('returns git-readable files excluding node_modules, data, dist, build', () => {
      const files = getGitReadableFiles(rootDir);
      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThan(0);

      // Verify that none of the ignored directory segments are included
      const invalid = files.filter((f) => {
        const parts = f.split('/');
        return (
          parts.includes('node_modules') ||
          parts.includes('.git') ||
          parts.includes('data') ||
          parts.includes('.yarn')
        );
      });
      expect(invalid).toEqual([]);
    });
  });

  describe('discoverSystemRoots', () => {
    test('identifies package.json scripts and server entrypoints as roots', () => {
      const sampleFiles = [
        'package.json',
        'screener-api/package.json',
        'screener-api/src/server.js',
        'screener-web/pages/index.js',
        'jobs/Scheduled/periodic-dead-code-scan/SKILL.md',
        'packages/jobs-runtime/test/sample.test.js',
        'orphan_script.js',
      ];

      const fileContentsMap = new Map([
        ['package.json', JSON.stringify({ scripts: { build: 'node scripts/build.js' } })],
        ['screener-api/package.json', JSON.stringify({ scripts: { start: 'node src/server.js' } })],
        ['screener-api/src/server.js', 'console.log("server");'],
        ['screener-web/pages/index.js', 'export default function Page() {}'],
        ['jobs/Scheduled/periodic-dead-code-scan/SKILL.md', 'run scan'],
        ['packages/jobs-runtime/test/sample.test.js', 'test("ok", () => {})'],
        ['orphan_script.js', 'console.log("orphan");'],
      ]);

      const roots = discoverSystemRoots(sampleFiles, fileContentsMap, rootDir);

      expect(roots.has('package.json')).toBe(true);
      expect(roots.has('screener-api/src/server.js')).toBe(true);
      expect(roots.has('screener-web/pages/index.js')).toBe(true);
      expect(roots.has('jobs/Scheduled/periodic-dead-code-scan/SKILL.md')).toBe(true);
      expect(roots.has('packages/jobs-runtime/test/sample.test.js')).toBe(true);
      expect(roots.has('orphan_script.js')).toBe(false);
    });
  });

  describe('checkExternalReferences', () => {
    test('does not report false references from self or header separators', () => {
      const target = 'orphan_script.js';
      const fileContentsMap = new Map([
        ['orphan_script.js', 'const x = 1;'],
        ['other_file.js', 'const y = 2;'],
      ]);

      const refs = checkExternalReferences(target, fileContentsMap);
      expect(refs).toEqual([]);
    });

    test('detects incoming relative requires and imports', () => {
      const target = 'packages/jobs-runtime/lib/ist.js';
      const fileContentsMap = new Map([
        ['packages/jobs-runtime/lib/ist.js', 'module.exports = { istDate: () => {} };'],
        ['packages/jobs-runtime/consumer.js', 'const ist = require("./lib/ist"); ist.istDate();'],
      ]);

      const refs = checkExternalReferences(target, fileContentsMap);
      expect(refs).toContain('packages/jobs-runtime/consumer.js');
    });

    test('ignores tasks.json and DEAD_CODE_ACTION_ITEMS.md as valid referrers', () => {
      const target = 'dead_script.js';
      const fileContentsMap = new Map([
        ['dead_script.js', 'console.log("dead");'],
        ['data/tasks.json', '{"tasks":[{"title":"Dead Code: dead_script.js"}]}'],
        ['DEAD_CODE_ACTION_ITEMS.md', '### Remove dead_script.js'],
      ]);

      const refs = checkExternalReferences(target, fileContentsMap);
      expect(refs).toEqual([]);
    });
  });
});
