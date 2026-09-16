'use strict';

// NOTE: this file used to also test discoverSystemRoots/checkExternalReferences
// — the old string-matching dead-code heuristic. That heuristic was replaced
// (2026-09-16) by a real full-repo reachability BFS in
// scripts/reachability-graph.js, which has its own dedicated, much more
// thorough test suite at scripts/__tests__/reachabilityGraph.test.js (38
// tests covering entry-root discovery, BFS, API-to-UI tracing, generic-
// basename collision handling, data/ hanging-node detection, etc.). Testing
// the now-deleted old functions here was pure dead weight pointing at
// nothing; getGitReadableFiles is the only export from dead-code-scanner.js
// that's still a real, currently-used function, so it's the only thing left
// under test in this file.
const path = require('path');
const { getGitReadableFiles, rollUpDeadFolders } = require('../../../scripts/dead-code-scanner');

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

  describe('rollUpDeadFolders', () => {
    test('collapses a fully-dead folder into a single folder-level finding', () => {
      const allFiles = ['foo/a.js', 'foo/b.js', 'foo/sub/c.js', 'bar/live.js'];
      const deadSet = new Set(['foo/a.js', 'foo/b.js', 'foo/sub/c.js']);
      const { folders, remaining } = rollUpDeadFolders(deadSet, allFiles);

      expect(folders).toHaveLength(1);
      expect(folders[0].dir).toBe('foo');
      expect(folders[0].files.sort()).toEqual(['foo/a.js', 'foo/b.js', 'foo/sub/c.js']);
      expect(remaining).toEqual([]);
    });

    test('recurses upward: a folder of all-dead subfolders collapses to ONE task at the parent, not one per child', () => {
      const allFiles = [
        'root/childA/x.js',
        'root/childA/y.js',
        'root/childB/z.js',
        'root/childB/nested/w.js',
      ];
      const deadSet = new Set(allFiles); // everything under root/ is dead
      const { folders, remaining } = rollUpDeadFolders(deadSet, allFiles);

      // Must NOT report root/childA and root/childB separately — 'root'
      // itself is fully dead, so it subsumes both children into one finding.
      expect(folders).toHaveLength(1);
      expect(folders[0].dir).toBe('root');
      expect(folders[0].files.sort()).toEqual(allFiles.slice().sort());
      expect(remaining).toEqual([]);
    });

    test('does NOT roll up a directory that has even one live file left in it, anywhere in its subtree', () => {
      const allFiles = ['foo/a.js', 'foo/b.js', 'foo/sub/live.js', 'foo/sub/dead.js'];
      const deadSet = new Set(['foo/a.js', 'foo/b.js', 'foo/sub/dead.js']); // sub/live.js NOT dead
      const { folders, remaining } = rollUpDeadFolders(deadSet, allFiles);

      // 'foo' has a live descendant (foo/sub/live.js) so neither 'foo' nor
      // 'foo/sub' may be collapsed — every dead file reports individually.
      expect(folders).toEqual([]);
      expect(remaining.sort()).toEqual(['foo/a.js', 'foo/b.js', 'foo/sub/dead.js']);
    });

    test('reports the shallowest fully-dead directory, not also its fully-dead children', () => {
      const allFiles = ['a/b/c/x.js', 'a/b/c/y.js', 'a/b/other.js'];
      const deadSet = new Set(allFiles);
      const { folders } = rollUpDeadFolders(deadSet, allFiles);

      // 'a', 'a/b', and 'a/b/c' are all fully dead — only the shallowest
      // ('a') should be reported, since it already covers everything below it.
      expect(folders).toHaveLength(1);
      expect(folders[0].dir).toBe('a');
    });

    test('returns nothing for an empty dead set', () => {
      expect(rollUpDeadFolders(new Set(), ['foo/a.js'])).toEqual({ folders: [], remaining: [] });
    });

    test('leaves a fully-dead top-level single file with no directory as remaining (not collapsible into anything)', () => {
      const allFiles = ['standalone.js', 'foo/a.js'];
      const deadSet = new Set(['standalone.js']);
      const { folders, remaining } = rollUpDeadFolders(deadSet, allFiles);
      expect(folders).toEqual([]);
      expect(remaining).toEqual(['standalone.js']);
    });
  });
});
