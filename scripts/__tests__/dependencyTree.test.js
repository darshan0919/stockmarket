'use strict';

const {
  resolveImportPath,
  extractDirectDependencies,
  findPackageJsonReferences,
  findScheduledJobReferences,
  findSkillReferences,
  findVariableDeclarations,
  extractVariableDependencies,
  findVariableUsages,
  buildDependencyTree,
  renderTerminalTree,
  renderMermaid,
  renderInteractiveHtml,
  resolveTarget,
} = require('../dependency-tree');

describe('dependency-tree analyzer', () => {
  describe('resolveImportPath', () => {
    test('resolves relative import with direct extension', () => {
      const allFiles = new Set(['scripts/dead-code-scanner.js', 'scripts/dependency-tree.js']);
      const res = resolveImportPath(
        './dead-code-scanner.js',
        'scripts/dependency-tree.js',
        allFiles
      );
      expect(res.resolved).toBe('scripts/dead-code-scanner.js');
      expect(res.isExternal).toBe(false);
    });

    test('resolves relative import without extension', () => {
      const allFiles = new Set([
        'packages/jobs-runtime/lib/db.js',
        'packages/jobs-runtime/dealsDigest.js',
      ]);
      const res = resolveImportPath('./lib/db', 'packages/jobs-runtime/dealsDigest.js', allFiles);
      expect(res.resolved).toBe('packages/jobs-runtime/lib/db.js');
      expect(res.isExternal).toBe(false);
    });

    test('resolves relative import with directory index.js', () => {
      const allFiles = new Set(['cloud-utils/src/index.js', 'cloud-utils/test/runner.js']);
      const res = resolveImportPath('../src', 'cloud-utils/test/runner.js', allFiles);
      expect(res.resolved).toBe('cloud-utils/src/index.js');
      expect(res.isExternal).toBe(false);
    });

    test('resolves workspace package alias @stock/api', () => {
      const allFiles = new Set(['stock-api/src/index.js', 'stock-api/src/utils/companyId.js']);
      const res = resolveImportPath(
        '@stock/api/utils/companyId',
        'packages/jobs-runtime/lib/db.js',
        allFiles
      );
      expect(res.resolved).toBe('stock-api/src/utils/companyId.js');
      expect(res.isExternal).toBe(false);
    });

    test('resolves workspace package root @stock/jobs-runtime', () => {
      const allFiles = new Set([
        'packages/jobs-runtime/index.js',
        'packages/jobs-runtime/lib/db.js',
      ]);
      const res = resolveImportPath('@stock/jobs-runtime', 'screener-api/src/server.js', allFiles);
      expect(res.resolved).toBe('packages/jobs-runtime/index.js');
      expect(res.isExternal).toBe(false);
    });

    test('identifies external npm or node core packages', () => {
      const allFiles = new Set();
      const res = resolveImportPath('fs', 'scripts/dependency-tree.js', allFiles);
      expect(res.resolved).toBeNull();
      expect(res.isExternal).toBe(true);
      expect(res.pkgName).toBe('fs');
    });
  });

  describe('extractDirectDependencies', () => {
    test('extracts CommonJS require calls', () => {
      const content = `
        const fs = require('fs');
        const db = require('./lib/db');
      `;
      const allFiles = new Set(['packages/jobs-runtime/lib/db.js']);
      const deps = extractDirectDependencies(content, 'packages/jobs-runtime/index.js', allFiles);

      expect(deps).toHaveLength(2);
      expect(deps[0]).toMatchObject({ specifier: 'fs', isExternal: true, type: 'external' });
      expect(deps[1]).toMatchObject({
        specifier: './lib/db',
        target: 'packages/jobs-runtime/lib/db.js',
        type: 'import',
        isExternal: false,
      });
    });

    test('extracts ESM imports and dynamic imports', () => {
      const content = `
        import React from 'react';
        import { header } from './components/header';
        const mod = await import('./dynamicMod');
      `;
      const allFiles = new Set(['frontend/components/header.js', 'frontend/dynamicMod.js']);
      const deps = extractDirectDependencies(content, 'frontend/index.js', allFiles);

      expect(deps).toHaveLength(3);
      expect(deps[0].specifier).toBe('react');
      expect(deps[1].target).toBe('frontend/components/header.js');
      expect(deps[2].target).toBe('frontend/dynamicMod.js');
    });

    test('extracts subprocess executions (execSync, spawn)', () => {
      const content = `
        const { execSync } = require('child_process');
        execSync('node scripts/dead-code-scanner.js');
      `;
      const allFiles = new Set(['scripts/dead-code-scanner.js']);
      const deps = extractDirectDependencies(content, 'jobs/runner.js', allFiles);

      const execDep = deps.find((d) => d.type === 'exec');
      expect(execDep).toBeDefined();
      expect(execDep.target).toBe('scripts/dead-code-scanner.js');
    });
  });

  describe('findPackageJsonReferences', () => {
    test('finds package.json script references', () => {
      const fileMap = new Map([
        [
          'package.json',
          JSON.stringify({
            scripts: {
              'dead-code:scan': 'node scripts/dead-code-scanner.js',
              build: 'next build',
            },
          }),
        ],
      ]);

      const refs = findPackageJsonReferences('scripts/dead-code-scanner.js', fileMap);
      expect(refs).toHaveLength(1);
      expect(refs[0].scriptName).toBe('dead-code:scan');
      expect(refs[0].command).toBe('node scripts/dead-code-scanner.js');
    });
  });

  describe('findScheduledJobReferences', () => {
    test('finds scheduled job tasks referencing target script', () => {
      const fileMap = new Map([
        [
          'jobs/Scheduled/periodic-dead-code-scan/SKILL.md',
          `---
name: periodic-dead-code-scan
---
Execute script (bash): \`yarn dead-code:scan\` or \`scripts/dead-code-scanner.js\`
`,
        ],
        ['jobs/Scheduled/other-job/SKILL.md', 'Unrelated task content'],
      ]);

      const refs = findScheduledJobReferences('scripts/dead-code-scanner.js', fileMap);
      expect(refs).toHaveLength(1);
      expect(refs[0].jobName).toBe('periodic-dead-code-scan');
    });
  });

  describe('findSkillReferences', () => {
    test('finds skill markdown and scripts referencing target file', () => {
      const fileMap = new Map([
        [
          'skills/development/dead-code-scanner/SKILL.md',
          'Run dead-code-scanner.js periodically to clean the repository.',
        ],
        ['skills/equity-research/watchlist/SKILL.md', 'Nothing relevant here.'],
      ]);

      const refs = findSkillReferences('scripts/dead-code-scanner.js', fileMap);
      expect(refs).toHaveLength(1);
      expect(refs[0].skillName).toBe('dead-code-scanner');
    });
  });

  describe('findVariableDeclarations and usages', () => {
    test('finds function and variable declarations', () => {
      const fileMap = new Map([
        [
          'packages/jobs-runtime/lib/db.js',
          `
          function saveThesis(companyId, thesis) {
            return true;
          }
          const DEFAULT_TIMEOUT = 5000;
          `,
        ],
      ]);

      const decls = findVariableDeclarations('saveThesis', fileMap);
      expect(decls).toHaveLength(1);
      expect(decls[0].file).toBe('packages/jobs-runtime/lib/db.js');
      expect(decls[0].kind).toBe('function');

      const varDecls = findVariableDeclarations('DEFAULT_TIMEOUT', fileMap);
      expect(varDecls).toHaveLength(1);
      expect(varDecls[0].kind).toBe('variable');
    });

    test('extracts dependencies within a variable body', () => {
      const body = `
        function processData(id) {
          const cleanId = sanitizeCompanyId(id);
          const root = dataRoot();
          return atomicWriteFile(cleanId, root);
        }
      `;
      const fileMap = new Map([
        [
          'lib/testFile.js',
          `
          const { sanitizeCompanyId } = require('./companyId');
          function dataRoot() {}
          function atomicWriteFile() {}
          `,
        ],
      ]);
      const allFiles = new Set(['lib/companyId.js']);

      const deps = extractVariableDependencies(body, 'lib/testFile.js', fileMap, allFiles);
      const names = deps.map((d) => d.name);

      expect(names).toContain('sanitizeCompanyId');
      expect(names).toContain('dataRoot');
      expect(names).toContain('atomicWriteFile');
    });

    test('finds usages and deduplicates per file with matchCount', () => {
      const fileMap = new Map([
        [
          'runner.js',
          `
          const result = saveThesis('NSE:ABC', {});
          saveThesis('NSE:XYZ', {});
          `,
        ],
      ]);

      const usages = findVariableUsages('saveThesis', fileMap);
      expect(usages).toHaveLength(1);
      expect(usages[0].file).toBe('runner.js');
      expect(usages[0].matchCount).toBe(2);
    });
  });

  describe('buildDependencyTree', () => {
    test('builds bi-directional tree with cycle prevention', () => {
      const fileMap = new Map([
        ['a.js', "const b = require('./b');"],
        ['b.js', "const a = require('./a'); const c = require('./c');"],
        ['c.js', "console.log('leaf');"],
      ]);
      const allFiles = new Set(['a.js', 'b.js', 'c.js']);

      const target = { isVariable: false, name: 'a.js', path: 'a.js', line: 1 };
      const tree = buildDependencyTree(target, fileMap, allFiles, { depth: 4, direction: 'both' });

      expect(tree.root.id).toBe('file:a.js');
      expect(tree.downstream).toHaveLength(1); // a -> b
      expect(tree.downstream[0].name).toBe('b.js');
      // In b's children, a.js should be flagged as cycle
      const cycleChild = tree.downstream[0].children.find((c) => c.name === 'a.js');
      expect(cycleChild).toBeDefined();
      expect(cycleChild.isCycle).toBe(true);
    });
  });

  describe('visual renderers', () => {
    const mockTree = {
      root: { id: 'file:test.js', name: 'test.js', path: 'test.js', type: 'target', line: 1 },
      upstream: [
        {
          id: 'pkg:package.json:run',
          name: 'yarn run',
          path: 'package.json',
          type: 'package_script',
          line: 10,
          children: [],
        },
      ],
      downstream: [
        {
          id: 'file:dep.js',
          name: 'dep.js',
          path: 'dep.js',
          type: 'import',
          line: 2,
          children: [],
        },
      ],
      nodes: [
        { id: 'file:test.js', name: 'test.js', path: 'test.js', type: 'target' },
        {
          id: 'pkg:package.json:run',
          name: 'yarn run',
          path: 'package.json',
          type: 'package_script',
          direction: 'upstream',
        },
        {
          id: 'file:dep.js',
          name: 'dep.js',
          path: 'dep.js',
          type: 'import',
          direction: 'downstream',
        },
      ],
      edges: [
        { source: 'pkg:package.json:run', target: 'file:test.js', type: 'package_script' },
        { source: 'file:test.js', target: 'file:dep.js', type: 'import' },
      ],
      meta: {
        target: { name: 'test.js', path: 'test.js' },
        maxDepth: 5,
        direction: 'both',
        stats: { totalNodes: 3, totalEdges: 2, upstreamCount: 1, downstreamCount: 1 },
      },
    };

    test('renderTerminalTree produces formatted console output', () => {
      const output = renderTerminalTree(mockTree);
      expect(output).toContain('DEPENDENCY TREE DIAGRAM:');
      expect(output).toContain('test.js');
      expect(output).toContain('UPSTREAM DEPENDENTS');
      expect(output).toContain('yarn run');
      expect(output).toContain('DOWNSTREAM DEPENDENCIES');
      expect(output).toContain('dep.js');
    });

    test('renderMermaid produces valid markdown with subgraphs', () => {
      const output = renderMermaid(mockTree);
      expect(output).toContain('```mermaid');
      expect(output).toContain('graph LR');
      expect(output).toContain('subgraph Upstream');
      expect(output).toContain('subgraph Downstream');
      expect(output).toContain('```');
    });

    test('renderInteractiveHtml produces self-contained interactive HTML', () => {
      const html = renderInteractiveHtml(mockTree);
      expect(html).toContain('<!doctype html>');
      expect(html).toContain('Dependency Tree');
      expect(html).toContain('<svg id="canvas">');
      expect(html).toContain('layoutGraph()');
      expect(html).toContain('showDrawer(node)');
    });
  });

  describe('resolveTarget', () => {
    test('resolves file target when exact relative path is provided', () => {
      const allFiles = new Set(['packages/jobs-runtime/lib/db.js']);
      const fileMap = new Map();
      const target = resolveTarget('packages/jobs-runtime/lib/db.js', {}, fileMap, allFiles);

      expect(target.isVariable).toBe(false);
      expect(target.path).toBe('packages/jobs-runtime/lib/db.js');
    });

    test('resolves variable target when symbol name matches declaration', () => {
      const allFiles = new Set(['packages/jobs-runtime/lib/db.js']);
      const fileMap = new Map([
        ['packages/jobs-runtime/lib/db.js', 'function saveThesis(companyId, thesis) {}'],
      ]);
      const target = resolveTarget('saveThesis', {}, fileMap, allFiles);

      expect(target.isVariable).toBe(true);
      expect(target.name).toBe('saveThesis');
      expect(target.file).toBe('packages/jobs-runtime/lib/db.js');
    });
  });
});
