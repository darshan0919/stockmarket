#!/usr/bin/env node
'use strict';

/**
 * dependency-tree.js — Multi-path visual dependency tree analyzer & generator.
 *
 * Generates visual dependency tree diagrams for any given variable or file across:
 *  - Direct imports/requires (CommonJS, ESM, workspace package aliases)
 *  - Skill references (skills/** SKILL.md, scripts, registry)
 *  - Scheduled job references (jobs/Scheduled/**, jobs/**)
 *  - package.json script references (root and workspace package.json scripts)
 *  - Dynamic child_process execution (execSync, spawn, fork, shell scripts)
 *  - Variable/symbol declarations, callers, and internal dependencies
 *
 * Output formats:
 *  - Terminal ASCII/Unicode colored tree
 *  - Mermaid graph diagram (markdown-ready)
 *  - Interactive standalone HTML diagram (SVG tree, zoom/pan, inspector drawer, filters)
 *  - JSON graph DTO
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');

// ── Workspace Alias Mappings ──────────────────────────────────────────────────

const WORKSPACE_PACKAGES = {
  '@stock/api': {
    root: 'stock-api',
    main: 'stock-api/src/index.js',
    subpathPrefix: 'stock-api/src',
    exports: {
      '.': 'stock-api/src/index.js',
      './utils/*': 'stock-api/src/utils/*.js',
      './fetchers/*': 'stock-api/src/fetchers/*.js',
      './analyzers/*': 'stock-api/src/analyzers/*.js',
      './stockscansClient': 'stock-api/src/clients/StockscansClient.js',
    },
  },
  '@stock/jobs-runtime': {
    root: 'packages/jobs-runtime',
    main: 'packages/jobs-runtime/index.js',
    subpathPrefix: 'packages/jobs-runtime',
  },
  '@stock/jobs': {
    root: 'jobs',
    main: 'jobs/index.js',
    subpathPrefix: 'jobs',
  },
  '@stock/cloud-utils': {
    root: 'cloud-utils',
    main: 'cloud-utils/src/index.js',
    subpathPrefix: 'cloud-utils/src',
  },
  'screener-api': {
    root: 'screener-api',
    main: 'screener-api/src/index.js',
    subpathPrefix: 'screener-api/src',
  },
  'screener-web': {
    root: 'screener-web',
    main: 'screener-web/src/index.js',
    subpathPrefix: 'screener-web',
  },
};

const CODE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.json', '.mjs', '.cjs'];
const IGNORED_PATH_SEGMENTS = [
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  '.yarn',
  'data',
  '.cache',
];

// ── File System Utilities ─────────────────────────────────────────────────────

/**
 * Gather all git-readable / active repository files.
 * @param {string} [rootDir=ROOT_DIR] Root directory.
 * @returns {string[]} Relative file paths.
 */
function getRepoFiles(rootDir = ROOT_DIR) {
  let tracked = [];
  let untracked = [];
  const gitEnv = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_OPTIONAL_LOCKS: '0',
  };

  try {
    tracked = execSync('git ls-files', {
      cwd: rootDir,
      encoding: 'utf-8',
      env: gitEnv,
      stdio: ['pipe', 'pipe', 'ignore'],
    })
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch (_e) {
    tracked = [];
  }

  try {
    untracked = execSync('git ls-files --others --exclude-standard', {
      cwd: rootDir,
      encoding: 'utf-8',
      env: gitEnv,
      stdio: ['pipe', 'pipe', 'ignore'],
    })
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch (_e) {
    untracked = [];
  }

  const all = Array.from(new Set([...tracked, ...untracked]));
  return all.filter((f) => {
    const parts = f.split('/');
    if (IGNORED_PATH_SEGMENTS.some((seg) => parts.includes(seg))) return false;
    return fs.existsSync(path.join(rootDir, f));
  });
}

/**
 * Safely read a file as a string.
 * @param {string} filePath Absolute or relative path.
 * @returns {string} File content or empty string on error.
 */
function readFileSafe(filePath) {
  try {
    const full = path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath);
    return fs.readFileSync(full, 'utf-8');
  } catch (_e) {
    return '';
  }
}

/**
 * Normalize repository relative path with forward slashes.
 * @param {string} p File path.
 * @returns {string} Normalized path relative to ROOT_DIR.
 */
function toRelPath(p) {
  if (!p) return '';
  const abs = path.isAbsolute(p) ? p : path.resolve(ROOT_DIR, p);
  return path.relative(ROOT_DIR, abs).replace(/\\/g, '/');
}

// ── Import & Path Resolution ──────────────────────────────────────────────────

/**
 * Resolve an import/require specifier from a source file into a repo relative file path.
 * @param {string} importPath The specifier string (e.g. './lib/db', '@stock/api/utils/companyId').
 * @param {string} sourceFile Repo relative path of the file containing the import.
 * @param {Set<string>} allFiles Set of all repo relative files.
 * @returns {{ resolved: string|null, isExternal: boolean, pkgName?: string }}
 */
function resolveImportPath(importPath, sourceFile, allFiles) {
  if (!importPath || typeof importPath !== 'string') {
    return { resolved: null, isExternal: false };
  }

  // 1. Relative import (./ or ../)
  if (importPath.startsWith('.')) {
    const sourceDir = path.dirname(path.join(ROOT_DIR, sourceFile));
    const targetBase = path.resolve(sourceDir, importPath);
    const targetRel = path.relative(ROOT_DIR, targetBase).replace(/\\/g, '/');

    // Direct match
    if (allFiles.has(targetRel)) {
      return { resolved: targetRel, isExternal: false };
    }

    // Try extensions
    for (const ext of CODE_EXTENSIONS) {
      if (allFiles.has(targetRel + ext)) {
        return { resolved: targetRel + ext, isExternal: false };
      }
    }

    // Try index files
    for (const ext of CODE_EXTENSIONS) {
      const idx = `${targetRel}/index${ext}`;
      if (allFiles.has(idx)) {
        return { resolved: idx, isExternal: false };
      }
    }

    return { resolved: null, isExternal: false };
  }

  // 2. Workspace packages
  for (const [pkgName, meta] of Object.entries(WORKSPACE_PACKAGES)) {
    if (importPath === pkgName) {
      if (allFiles.has(meta.main)) {
        return { resolved: meta.main, isExternal: false, pkgName };
      }
      return { resolved: meta.root, isExternal: false, pkgName };
    }

    if (importPath.startsWith(pkgName + '/')) {
      const sub = importPath.slice(pkgName.length + 1);

      // Check explicit export map if present
      if (meta.exports) {
        for (const [pattern, targetPattern] of Object.entries(meta.exports)) {
          if (
            pattern.endsWith('/*') &&
            importPath.startsWith(pkgName + '/' + pattern.slice(2, -2))
          ) {
            const remainder = importPath.slice((pkgName + '/' + pattern.slice(2, -2)).length + 1);
            const resolvedFile = targetPattern.replace('*.js', remainder + '.js');
            if (allFiles.has(resolvedFile)) {
              return { resolved: resolvedFile, isExternal: false, pkgName };
            }
          }
          if (pattern === './' + sub) {
            if (allFiles.has(targetPattern)) {
              return { resolved: targetPattern, isExternal: false, pkgName };
            }
          }
        }
      }

      // Default subpath convention
      const direct = `${meta.subpathPrefix}/${sub}`;
      if (allFiles.has(direct)) {
        return { resolved: direct, isExternal: false, pkgName };
      }
      for (const ext of CODE_EXTENSIONS) {
        if (allFiles.has(direct + ext)) {
          return { resolved: direct + ext, isExternal: false, pkgName };
        }
        if (allFiles.has(`${direct}/index${ext}`)) {
          return { resolved: `${direct}/index${ext}`, isExternal: false, pkgName };
        }
      }
    }
  }

  // 3. Built-in or external npm package
  const isExternal = !importPath.startsWith('/') && !importPath.startsWith('.');
  return { resolved: null, isExternal, pkgName: importPath.split('/')[0] };
}

// ── AST / Regex Extractors ────────────────────────────────────────────────────

/**
 * Extract imports/requires and dynamic exec calls from file content.
 * @param {string} content File text.
 * @param {string} sourceFile Repo relative path.
 * @param {Set<string>} allFiles Set of all repo files.
 * @returns {Array<{ target: string|null, specifier: string, line: number, type: string, isExternal: boolean, snippet: string }>}
 */
function extractDirectDependencies(content, sourceFile, allFiles) {
  const deps = [];
  const lines = content.split('\n');

  // Regex patterns
  // 1. require('...') or require("...")
  const requireRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  // 2. import ... from '...' or import '...'
  const importRegex =
    /(?:import\s+(?:[\w*\s{},]*\s+from\s+)?|export\s+(?:[\w*\s{},]*\s+from\s+)?)['"`]([^'"`]+)['"`]/g;
  // 3. dynamic import('...')
  const dynamicImportRegex = /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  // 4. child_process exec/spawn/fork
  const execRegex = /(?:execSync|exec|execFile|spawn|fork)\s*\(\s*['"`]([^'"`]+)['"`]/g;

  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1;

    // Check require
    let m;
    while ((m = requireRegex.exec(lineText)) !== null) {
      const specifier = m[1];
      const res = resolveImportPath(specifier, sourceFile, allFiles);
      deps.push({
        target: res.resolved,
        specifier,
        line: lineNum,
        type: res.isExternal ? 'external' : 'import',
        isExternal: res.isExternal,
        snippet: lineText.trim(),
      });
    }

    // Check import/export
    while ((m = importRegex.exec(lineText)) !== null) {
      const specifier = m[1];
      const res = resolveImportPath(specifier, sourceFile, allFiles);
      deps.push({
        target: res.resolved,
        specifier,
        line: lineNum,
        type: res.isExternal ? 'external' : 'import',
        isExternal: res.isExternal,
        snippet: lineText.trim(),
      });
    }

    // Check dynamic import
    while ((m = dynamicImportRegex.exec(lineText)) !== null) {
      const specifier = m[1];
      const res = resolveImportPath(specifier, sourceFile, allFiles);
      deps.push({
        target: res.resolved,
        specifier,
        line: lineNum,
        type: res.isExternal ? 'external' : 'import',
        isExternal: res.isExternal,
        snippet: lineText.trim(),
      });
    }

    // Check exec
    while ((m = execRegex.exec(lineText)) !== null) {
      const cmd = m[1];
      // Try to find referenced script file within the command
      let matchedFile = null;
      const tokens = cmd.split(/\s+/);
      for (const tok of tokens) {
        const cleanTok = tok.replace(/["';`]/g, '');
        if (CODE_EXTENSIONS.some((ext) => cleanTok.endsWith(ext))) {
          const res = resolveImportPath(cleanTok, sourceFile, allFiles);
          if (res.resolved) {
            matchedFile = res.resolved;
            break;
          }
          if (allFiles.has(cleanTok)) {
            matchedFile = cleanTok;
            break;
          }
        }
      }
      deps.push({
        target: matchedFile,
        specifier: cmd,
        line: lineNum,
        type: 'exec',
        isExternal: !matchedFile,
        snippet: lineText.trim(),
      });
    }
  });

  return deps;
}

/**
 * Find declarations of a variable / function / class in a file or across repo.
 * @param {string} varName Variable name.
 * @param {Map<string, string>} fileMap Map of relPath -> content.
 * @param {string} [targetFile] Optional target file to restrict search.
 * @returns {Array<{ file: string, line: number, kind: string, snippet: string, body?: string }>}
 */
function findVariableDeclarations(varName, fileMap, targetFile = null) {
  const results = [];
  const escaped = varName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

  // Declaration regexes:
  // 1. function foo( or async function foo(
  const fnDecl = new RegExp(`(?:async\\s+)?function\\s+${escaped}\\s*\\(`, 'g');
  // 2. const/let/var foo =
  const varDecl = new RegExp(`(?:const|let|var)\\s+${escaped}\\s*=`, 'g');
  // 3. class Foo
  const classDecl = new RegExp(`class\\s+${escaped}\\b`, 'g');
  // 4. Object property export: foo: function or foo(...) { or foo,
  const methodDecl = new RegExp(
    `(?:^|\\s|,)${escaped}\\s*(?:\\([^)]*\\)\\s*{|:\\s*(?:function|\\([^)]*\\)\\s*=>))`,
    'g'
  );

  const filesToSearch = targetFile ? [targetFile] : Array.from(fileMap.keys());

  for (const relPath of filesToSearch) {
    // Only search code files
    const ext = path.extname(relPath).toLowerCase();
    if (!CODE_EXTENSIONS.includes(ext)) continue;

    const content = fileMap.get(relPath) || '';
    if (!content.includes(varName)) continue;

    const lines = content.split('\n');
    lines.forEach((lineText, idx) => {
      const lineNum = idx + 1;
      let kind = null;

      if (fnDecl.test(lineText)) kind = 'function';
      else if (varDecl.test(lineText)) kind = 'variable';
      else if (classDecl.test(lineText)) kind = 'class';
      else if (methodDecl.test(lineText)) kind = 'method';

      // Reset regex indices
      fnDecl.lastIndex = 0;
      varDecl.lastIndex = 0;
      classDecl.lastIndex = 0;
      methodDecl.lastIndex = 0;

      if (kind) {
        // Extract basic body block if possible
        const bodyLines = lines.slice(idx, Math.min(idx + 50, lines.length)).join('\n');
        results.push({
          file: relPath,
          line: lineNum,
          kind,
          snippet: lineText.trim(),
          body: bodyLines,
        });
      }
    });
  }

  return results;
}

/**
 * Extract downstream dependencies (internal function calls, variables, and imports) used inside a variable's body.
 * @param {string} body Source text of variable/function definition.
 * @param {string} file Rel path of defining file.
 * @param {Map<string, string>} fileMap Map of relPath -> content.
 * @param {Set<string>} allFiles Set of all repo files.
 * @returns {Array<{ name: string, type: string, target?: string, line?: number }>}
 */
function extractVariableDependencies(body, file, fileMap, allFiles) {
  if (!body) return [];

  const found = new Map();
  const fileContent = fileMap.get(file) || '';
  const fileDirectDeps = extractDirectDependencies(fileContent, file, allFiles);

  // Common language keywords / built-ins to ignore
  const BUILTINS = new Set([
    'if',
    'else',
    'return',
    'function',
    'const',
    'let',
    'var',
    'async',
    'await',
    'try',
    'catch',
    'finally',
    'for',
    'while',
    'switch',
    'case',
    'break',
    'continue',
    'new',
    'throw',
    'this',
    'typeof',
    'instanceof',
    'void',
    'delete',
    'in',
    'of',
    'true',
    'false',
    'null',
    'undefined',
    'NaN',
    'Infinity',
    'Object',
    'Array',
    'String',
    'Number',
    'Boolean',
    'RegExp',
    'Date',
    'Promise',
    'JSON',
    'Math',
    'console',
    'process',
    'require',
    'module',
    'exports',
    'Error',
    'Set',
    'Map',
    'WeakMap',
    'WeakSet',
    'Symbol',
    'Buffer',
    'setTimeout',
    'clearTimeout',
    'setInterval',
    'clearInterval',
    'fs',
    'path',
    'crypto',
  ]);

  // Find all identifier calls or usages in body
  const idRegex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
  let m;
  while ((m = idRegex.exec(body)) !== null) {
    const id = m[1];
    if (BUILTINS.has(id)) continue;
    if (id.length < 2) continue;

    // Check if it's imported from another file in this file
    const importedFrom = fileDirectDeps.find((dep) => {
      return dep.snippet && dep.snippet.includes(id);
    });

    if (importedFrom && importedFrom.target) {
      if (!found.has(`import:${id}`)) {
        found.set(`import:${id}`, {
          name: id,
          type: 'import_var',
          target: importedFrom.target,
          snippet: `imported from ${importedFrom.target}`,
        });
      }
    } else {
      // Check if it's declared locally in this file
      if (!found.has(`local:${id}`)) {
        found.set(`local:${id}`, {
          name: id,
          type: 'local_var',
          target: file,
          snippet: `local identifier in ${file}`,
        });
      }
    }
  }

  return Array.from(found.values()).slice(0, 25);
}

// ── Upstream Reference Detectors ──────────────────────────────────────────────

/**
 * Find all package.json scripts that reference a target file.
 * @param {string} targetFile Repo relative path.
 * @param {Map<string, string>} fileMap Map of relPath -> content.
 * @returns {Array<{ file: string, scriptName: string, command: string, line: number }>}
 */
function findPackageJsonReferences(targetFile, fileMap) {
  const refs = [];
  const baseName = path.basename(targetFile);
  const pkgFiles = Array.from(fileMap.keys()).filter((f) => path.basename(f) === 'package.json');

  for (const pkgFile of pkgFiles) {
    const content = fileMap.get(pkgFile) || '';
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (_e) {
      continue;
    }

    const scripts = parsed.scripts || {};
    const pkgDir = path.dirname(pkgFile);
    const lines = content.split('\n');

    for (const [scriptName, command] of Object.entries(scripts)) {
      if (typeof command !== 'string') continue;

      // Check if command references targetFile
      const relFromPkg = path.relative(pkgDir, targetFile).replace(/\\/g, '/');
      const matches =
        command.includes(targetFile) ||
        command.includes(relFromPkg) ||
        command.includes(`./${relFromPkg}`) ||
        command.split(/\s+/).some((token) => token.replace(/["';`]/g, '') === baseName);

      if (matches) {
        // Find line number in package.json
        const lineIdx = lines.findIndex((l) => l.includes(`"${scriptName}"`));
        refs.push({
          file: pkgFile,
          scriptName,
          command,
          line: lineIdx >= 0 ? lineIdx + 1 : 1,
        });
      }
    }
  }

  return refs;
}

/**
 * Find all scheduled jobs (jobs/Scheduled/**) referencing a target file or variable.
 * @param {string} target Target path or variable name.
 * @param {Map<string, string>} fileMap Map of relPath -> content.
 * @param {boolean} [isVariable=false] Whether target is a variable.
 * @returns {Array<{ jobName: string, file: string, line: number, snippet: string }>}
 */
function findScheduledJobReferences(target, fileMap, isVariable = false) {
  const refs = [];
  const baseName = path.basename(target);
  const nameNoExt = path.basename(target, path.extname(target));

  for (const [relPath, content] of fileMap.entries()) {
    if (!relPath.startsWith('jobs/Scheduled/')) continue;

    const parts = relPath.split('/');
    const jobName = parts[2]; // jobs/Scheduled/<job-name>/...
    const lines = content.split('\n');
    let firstMatch = null;
    let matchCount = 0;

    lines.forEach((lineText, idx) => {
      let matched = false;
      if (isVariable) {
        const varRegex = new RegExp(`\\b${target.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`);
        matched = varRegex.test(lineText);
      } else {
        matched =
          lineText.includes(target) ||
          lineText.includes(baseName) ||
          (nameNoExt.length >= 4 && lineText.includes(nameNoExt));
      }

      if (matched) {
        matchCount++;
        if (!firstMatch) {
          firstMatch = {
            jobName,
            file: relPath,
            line: idx + 1,
            snippet: lineText.trim(),
          };
        }
      }
    });

    if (firstMatch) {
      firstMatch.matchCount = matchCount;
      refs.push(firstMatch);
    }
  }

  return refs;
}

/**
 * Find all skill references (skills/**) referencing a target file or variable.
 * @param {string} target Target path or variable name.
 * @param {Map<string, string>} fileMap Map of relPath -> content.
 * @param {boolean} [isVariable=false] Whether target is a variable.
 * @returns {Array<{ skillName: string, file: string, line: number, snippet: string, matchCount?: number }>}
 */
function findSkillReferences(target, fileMap, isVariable = false) {
  const refs = [];
  const baseName = path.basename(target);
  const nameNoExt = path.basename(target, path.extname(target));

  for (const [relPath, content] of fileMap.entries()) {
    if (!relPath.startsWith('skills/')) continue;
    if (relPath.endsWith('.test.js') || relPath.endsWith('.spec.js')) continue;

    // Determine skill name
    const parts = relPath.split('/');
    let skillName = parts[1] || 'skills';
    if (['equity-research', 'tooling', 'development'].includes(parts[1]) && parts[2]) {
      skillName = parts[2];
    }

    const lines = content.split('\n');
    let firstMatch = null;
    let matchCount = 0;

    lines.forEach((lineText, idx) => {
      let matched = false;
      if (isVariable) {
        const varRegex = new RegExp(`\\b${target.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`);
        matched = varRegex.test(lineText);
      } else {
        matched =
          lineText.includes(target) ||
          lineText.includes(baseName) ||
          (nameNoExt.length >= 4 && lineText.includes(nameNoExt));
      }

      if (matched) {
        matchCount++;
        if (!firstMatch) {
          firstMatch = {
            skillName,
            file: relPath,
            line: idx + 1,
            snippet: lineText.trim(),
          };
        }
      }
    });

    if (firstMatch) {
      firstMatch.matchCount = matchCount;
      refs.push(firstMatch);
    }
  }

  return refs;
}

/**
 * Find all files importing/requiring target file.
 * @param {string} targetFile Repo relative path.
 * @param {Map<string, string>} fileMap Map of relPath -> content.
 * @param {Set<string>} allFiles Set of all repo files.
 * @returns {Array<{ file: string, line: number, snippet: string, specifier: string }>}
 */
function findDirectImportsToTarget(targetFile, fileMap, allFiles) {
  const refs = [];

  for (const [relPath, content] of fileMap.entries()) {
    if (relPath === targetFile) continue;
    const deps = extractDirectDependencies(content, relPath, allFiles);
    for (const dep of deps) {
      if (dep.target === targetFile) {
        refs.push({
          file: relPath,
          line: dep.line,
          snippet: dep.snippet,
          specifier: dep.specifier,
        });
      }
    }
  }

  return refs;
}

/**
 * Find all usages / references of a variable across the repository.
 * @param {string} varName Variable name.
 * @param {Map<string, string>} fileMap Map of relPath -> content.
 * @param {string} [declFile] Defining file path to separate internal vs external usages.
 * @returns {Array<{ file: string, line: number, snippet: string, isDeclaration: boolean, matchCount?: number, lines?: number[] }>}
 */
function findVariableUsages(varName, fileMap, declFile = null) {
  const usages = [];
  const regex = new RegExp(`\\b${varName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`);

  for (const [relPath, content] of fileMap.entries()) {
    if (!content.includes(varName)) continue;
    const lines = content.split('\n');
    let firstMatch = null;
    const matchLines = [];

    lines.forEach((lineText, idx) => {
      if (regex.test(lineText)) {
        const isDecl = relPath === declFile && /(?:function|const|let|var|class)\s+/.test(lineText);
        if (!isDecl) {
          matchLines.push(idx + 1);
          if (!firstMatch) {
            firstMatch = {
              file: relPath,
              line: idx + 1,
              snippet: lineText.trim(),
              isDeclaration: false,
            };
          }
        }
      }
    });

    if (firstMatch) {
      firstMatch.matchCount = matchLines.length;
      firstMatch.lines = matchLines;
      usages.push(firstMatch);
    }
  }

  return usages;
}

// ── Recursive Tree Builder ───────────────────────────────────────────────────

/**
 * Build a complete bi-directional dependency tree.
 * @param {Object} target Target descriptor.
 * @param {Map<string, string>} fileMap Map of relPath -> content.
 * @param {Set<string>} allFiles Set of all repo files.
 * @param {Object} [options] Recursion options.
 * @returns {Object} Tree model with root, upstream, downstream, nodes, and edges.
 */
function buildDependencyTree(target, fileMap, allFiles, options = {}) {
  const maxDepth = options.depth !== undefined ? options.depth : 5;
  const direction = options.direction || 'both'; // 'both' | 'upstream' | 'downstream'

  const nodes = new Map();
  const edges = [];

  function addNode(node) {
    if (!nodes.has(node.id)) {
      nodes.set(node.id, { ...node });
    }
    return nodes.get(node.id);
  }

  function addEdge(sourceId, targetId, edgeMeta = {}) {
    const key = `${sourceId}->${targetId}:${edgeMeta.type || ''}`;
    edges.push({ id: key, source: sourceId, target: targetId, ...edgeMeta });
  }

  // Define Root Node
  const rootNodeId = target.isVariable
    ? `var:${target.name}@${target.file || 'any'}`
    : `file:${target.path}`;

  const rootNode = addNode({
    id: rootNodeId,
    name: target.name || path.basename(target.path),
    path: target.path || target.file || '',
    type: 'target',
    isVariable: Boolean(target.isVariable),
    direction: 'root',
    line: target.line || 1,
    snippet:
      target.snippet ||
      (target.path ? `Target file: ${target.path}` : `Target variable: ${target.name}`),
    meta: target,
  });

  // ── 1. Trace Downstream (Dependencies) ──────────────────────────────────────
  function traceDownstream(currentFile, currentDepth, visitedChain) {
    if (currentDepth >= maxDepth) return [];

    const content = fileMap.get(currentFile);
    if (!content) return [];

    const deps = extractDirectDependencies(content, currentFile, allFiles);
    const children = [];

    for (const dep of deps) {
      if (!dep.target && !dep.isExternal) continue;

      const targetId = dep.target ? `file:${dep.target}` : `ext:${dep.specifier}`;
      const isCycle = visitedChain.has(targetId);

      const childNode = addNode({
        id: targetId,
        name: dep.target ? path.basename(dep.target) : dep.specifier,
        path: dep.target || '',
        type: dep.isExternal ? 'external' : dep.type,
        direction: 'downstream',
        line: dep.line,
        snippet: dep.snippet,
        isCycle,
      });

      addEdge(`file:${currentFile}`, targetId, {
        type: dep.type,
        line: dep.line,
        snippet: dep.snippet,
        direction: 'downstream',
      });

      let subChildren = [];
      if (dep.target && !isCycle && allFiles.has(dep.target)) {
        const nextChain = new Set(visitedChain);
        nextChain.add(targetId);
        subChildren = traceDownstream(dep.target, currentDepth + 1, nextChain);
      }

      children.push({
        ...childNode,
        isCycle,
        children: subChildren,
      });
    }

    return children;
  }

  // ── 2. Trace Upstream (Dependents / Inbound) ──────────────────────────────────
  function traceUpstream(currentFile, currentDepth, visitedChain) {
    if (currentDepth >= maxDepth) return [];

    const children = [];
    const currentId = `file:${currentFile}`;

    // A. Direct imports from other files
    const importingFiles = findDirectImportsToTarget(currentFile, fileMap, allFiles);
    for (const imp of importingFiles) {
      const parentId = `file:${imp.file}`;
      const isCycle = visitedChain.has(parentId);

      const parentNode = addNode({
        id: parentId,
        name: path.basename(imp.file),
        path: imp.file,
        type: 'import',
        direction: 'upstream',
        line: imp.line,
        snippet: imp.snippet,
        isCycle,
      });

      addEdge(parentId, currentId, {
        type: 'import',
        line: imp.line,
        snippet: imp.snippet,
        direction: 'upstream',
      });

      let subChildren = [];
      if (!isCycle) {
        const nextChain = new Set(visitedChain);
        nextChain.add(parentId);
        subChildren = traceUpstream(imp.file, currentDepth + 1, nextChain);
      }

      children.push({
        ...parentNode,
        isCycle,
        children: subChildren,
      });
    }

    // B. package.json scripts (leaves in tree)
    const pkgRefs = findPackageJsonReferences(currentFile, fileMap);
    for (const pkg of pkgRefs) {
      const pkgNodeId = `pkg:${pkg.file}:${pkg.scriptName}`;
      const pkgNode = addNode({
        id: pkgNodeId,
        name: `yarn ${pkg.scriptName}`,
        path: pkg.file,
        type: 'package_script',
        direction: 'upstream',
        line: pkg.line,
        snippet: `"${pkg.scriptName}": "${pkg.command}"`,
      });

      addEdge(pkgNodeId, currentId, {
        type: 'package_script',
        line: pkg.line,
        snippet: pkg.command,
        direction: 'upstream',
      });

      children.push({ ...pkgNode, children: [] });
    }

    // C. Scheduled jobs (jobs/Scheduled/**)
    const jobRefs = findScheduledJobReferences(currentFile, fileMap, false);
    for (const job of jobRefs) {
      const jobNodeId = `job:${job.jobName}`;
      const jobNode = addNode({
        id: jobNodeId,
        name: job.jobName,
        path: job.file,
        type: 'job',
        direction: 'upstream',
        line: job.line,
        snippet: job.snippet,
      });

      addEdge(jobNodeId, currentId, {
        type: 'job',
        line: job.line,
        snippet: job.snippet,
        direction: 'upstream',
      });

      children.push({ ...jobNode, children: [] });
    }

    // D. Skills (skills/**)
    const skillRefs = findSkillReferences(currentFile, fileMap, false);
    for (const skill of skillRefs) {
      const skillNodeId = `skill:${skill.skillName}`;
      const skillNode = addNode({
        id: skillNodeId,
        name: skill.skillName,
        path: skill.file,
        type: 'skill',
        direction: 'upstream',
        line: skill.line,
        snippet: skill.snippet,
      });

      addEdge(skillNodeId, currentId, {
        type: 'skill',
        line: skill.line,
        snippet: skill.snippet,
        direction: 'upstream',
      });

      children.push({ ...skillNode, children: [] });
    }

    return children;
  }

  let downstreamTree = [];
  let upstreamTree = [];

  if (target.isVariable) {
    // Variable Target Handling
    const varDecl = target.declaration;
    const definingFile = target.file;

    // Downstream of variable: what identifiers/calls are inside the variable body
    if (direction === 'both' || direction === 'downstream') {
      const varDeps = extractVariableDependencies(varDecl?.body, definingFile, fileMap, allFiles);
      for (const vd of varDeps) {
        const vdId = `var_dep:${vd.name}@${vd.target || definingFile}`;
        const vdNode = addNode({
          id: vdId,
          name: vd.name,
          path: vd.target || definingFile,
          type: vd.type,
          direction: 'downstream',
          snippet: vd.snippet,
        });

        addEdge(rootNodeId, vdId, {
          type: vd.type,
          snippet: vd.snippet,
          direction: 'downstream',
        });

        downstreamTree.push({ ...vdNode, children: [] });
      }
    }

    // Upstream of variable: what files, skills, and jobs reference this variable
    if (direction === 'both' || direction === 'upstream') {
      const usages = findVariableUsages(target.name, fileMap, definingFile);
      for (const use of usages) {
        if (use.isDeclaration) continue; // skip declaration line
        const useNodeId = `usage:${use.file}`;
        const countSuffix = use.matchCount > 1 ? ` (+${use.matchCount - 1} more)` : '';
        const useNode = addNode({
          id: useNodeId,
          name: `${path.basename(use.file)}${countSuffix}`,
          path: use.file,
          type: 'variable_usage',
          direction: 'upstream',
          line: use.line,
          snippet: use.snippet,
        });

        addEdge(useNodeId, rootNodeId, {
          type: 'variable_call',
          line: use.line,
          snippet: use.snippet,
          direction: 'upstream',
        });

        upstreamTree.push({ ...useNode, children: [] });
      }

      // Skills referencing this variable
      const skillVarRefs = findSkillReferences(target.name, fileMap, true);
      for (const skr of skillVarRefs) {
        const skrId = `skill:${skr.skillName}`;
        const countSuffix = skr.matchCount > 1 ? ` (+${skr.matchCount - 1} more)` : '';
        const skrNode = addNode({
          id: skrId,
          name: `${skr.skillName}${countSuffix}`,
          path: skr.file,
          type: 'skill',
          direction: 'upstream',
          line: skr.line,
          snippet: skr.snippet,
        });

        addEdge(skrId, rootNodeId, {
          type: 'skill',
          line: skr.line,
          snippet: skr.snippet,
          direction: 'upstream',
        });

        upstreamTree.push({ ...skrNode, children: [] });
      }

      // Jobs referencing this variable
      const jobVarRefs = findScheduledJobReferences(target.name, fileMap, true);
      for (const jbr of jobVarRefs) {
        const jbrId = `job:${jbr.jobName}`;
        const countSuffix = jbr.matchCount > 1 ? ` (+${jbr.matchCount - 1} more)` : '';
        const jbrNode = addNode({
          id: jbrId,
          name: `${jbr.jobName}${countSuffix}`,
          path: jbr.file,
          type: 'job',
          direction: 'upstream',
          line: jbr.line,
          snippet: jbr.snippet,
        });

        addEdge(jbrId, rootNodeId, {
          type: 'job',
          line: jbr.line,
          snippet: jbr.snippet,
          direction: 'upstream',
        });

        upstreamTree.push({ ...jbrNode, children: [] });
      }
    }
  } else {
    // File Target Handling
    if (direction === 'both' || direction === 'downstream') {
      const visited = new Set([`file:${target.path}`]);
      downstreamTree = traceDownstream(target.path, 0, visited);
    }
    if (direction === 'both' || direction === 'upstream') {
      const visited = new Set([`file:${target.path}`]);
      upstreamTree = traceUpstream(target.path, 0, visited);
    }
  }

  return {
    root: rootNode,
    upstream: upstreamTree,
    downstream: downstreamTree,
    nodes: Array.from(nodes.values()),
    edges,
    meta: {
      target,
      maxDepth,
      direction,
      timestamp: new Date().toISOString(),
      stats: {
        totalNodes: nodes.size,
        totalEdges: edges.length,
        upstreamCount: upstreamTree.length,
        downstreamCount: downstreamTree.length,
      },
    },
  };
}

// ── Visual Renderers ──────────────────────────────────────────────────────────

/**
 * Render terminal box-drawing tree with ANSI colors.
 * @param {Object} tree Model returned by buildDependencyTree.
 * @returns {string} Formatted terminal string.
 */
function renderTerminalTree(tree) {
  const lines = [];

  // ANSI color helpers
  const reset = '\x1b[0m';
  const bold = '\x1b[1m';
  const cyan = '\x1b[36m';
  const green = '\x1b[32m';
  const yellow = '\x1b[33m';
  const magenta = '\x1b[35m';
  const blue = '\x1b[34m';
  const gray = '\x1b[90m';
  const red = '\x1b[31m';

  const typeBadges = {
    target: `${bold}${magenta}🎯 [TARGET]${reset}`,
    import: `${green}📥 [IMPORT]${reset}`,
    package_script: `${cyan}📦 [PACKAGE.JSON]${reset}`,
    job: `${yellow}⚡ [JOB]${reset}`,
    skill: `${magenta}🧠 [SKILL]${reset}`,
    exec: `${yellow}⚙️ [EXEC]${reset}`,
    variable: `${blue}🏷️ [VARIABLE]${reset}`,
    variable_usage: `${blue}📞 [USAGE]${reset}`,
    import_var: `${green}📥 [IMPORTED VAR]${reset}`,
    local_var: `${gray}🔹 [LOCAL VAR]${reset}`,
    external: `${gray}🌐 [EXTERNAL]${reset}`,
  };

  const root = tree.root;
  lines.push('');
  lines.push(
    `${bold}══════════════════════════════════════════════════════════════════════════════${reset}`
  );
  lines.push(
    `${bold}🔍 DEPENDENCY TREE DIAGRAM: ${cyan}${root.name}${reset} ${typeBadges[root.type] || ''}`
  );
  if (root.path)
    lines.push(`   ${gray}Path: ${root.path}${root.line ? `:${root.line}` : ''}${reset}`);
  lines.push(
    `${bold}══════════════════════════════════════════════════════════════════════════════${reset}`
  );
  lines.push('');

  function printBranch(nodesList, prefix, _isLastLevel = false) {
    nodesList.forEach((node, idx) => {
      const isLast = idx === nodesList.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const badge = typeBadges[node.type] || `[${node.type}]`;
      const cycleMark = node.isCycle ? ` ${red}(circular cycle)${reset}` : '';
      const lineMark = node.line ? `${gray}:${node.line}${reset}` : '';

      lines.push(
        `${prefix}${connector}${badge} ${bold}${node.name}${reset}${lineMark}${cycleMark}`
      );
      if (node.path && node.path !== node.name) {
        lines.push(`${prefix}${isLast ? '    ' : '│   '}${gray}↳ ${node.path}${reset}`);
      }
      if (node.snippet) {
        lines.push(
          `${prefix}${isLast ? '    ' : '│   '}${gray}"${node.snippet.slice(0, 80)}"${reset}`
        );
      }

      if (node.children && node.children.length > 0) {
        const nextPrefix = prefix + (isLast ? '    ' : '│   ');
        printBranch(node.children, nextPrefix, isLast);
      }
    });
  }

  // Upstream
  if (tree.upstream && tree.upstream.length > 0) {
    lines.push(
      `${bold}${cyan}▲ UPSTREAM DEPENDENTS / REFERENCED BY (${tree.upstream.length})${reset}`
    );
    printBranch(tree.upstream, '  ', false);
    lines.push('');
  } else if (tree.meta.direction !== 'downstream') {
    lines.push(`${gray}▲ UPSTREAM: No incoming references found.${reset}`);
    lines.push('');
  }

  // Downstream
  if (tree.downstream && tree.downstream.length > 0) {
    lines.push(`${bold}${green}▼ DOWNSTREAM DEPENDENCIES (${tree.downstream.length})${reset}`);
    printBranch(tree.downstream, '  ', false);
    lines.push('');
  } else if (tree.meta.direction !== 'upstream') {
    lines.push(`${gray}▼ DOWNSTREAM: No outgoing dependencies found.${reset}`);
    lines.push('');
  }

  lines.push(
    `${gray}Summary: ${tree.meta.stats.totalNodes} nodes, ${tree.meta.stats.totalEdges} relations, max depth ${tree.meta.maxDepth}${reset}`
  );
  lines.push('');

  return lines.join('\n');
}

/**
 * Render valid Mermaid diagram code.
 * @param {Object} tree Model returned by buildDependencyTree.
 * @returns {string} Mermaid markdown snippet.
 */
function renderMermaid(tree) {
  const lines = ['```mermaid', 'graph LR'];

  function cleanId(raw) {
    return 'node_' + raw.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  function escapeLabel(str) {
    if (!str) return '';
    return str.replace(/["[\](){}]/g, '');
  }

  // Styling classes
  lines.push('  %% Styling classes');
  lines.push('  classDef target fill:#7c6af7,stroke:#9d8eff,stroke-width:3px,color:#ffffff;');
  lines.push('  classDef importNode fill:#064e3b,stroke:#10b981,color:#ecfdf5;');
  lines.push('  classDef scriptNode fill:#134e4a,stroke:#14b8a6,color:#ccfbf1;');
  lines.push('  classDef jobNode fill:#713f12,stroke:#eab308,color:#fef9c3;');
  lines.push('  classDef skillNode fill:#581c87,stroke:#a855f7,color:#faf5ff;');
  lines.push('  classDef varNode fill:#1e3a8a,stroke:#3b82f6,color:#eff6ff;');
  lines.push('  classDef extNode fill:#27272a,stroke:#71717a,color:#f4f4f5;');

  const classMap = {
    target: 'target',
    import: 'importNode',
    package_script: 'scriptNode',
    job: 'jobNode',
    skill: 'skillNode',
    exec: 'scriptNode',
    variable: 'varNode',
    variable_usage: 'varNode',
    import_var: 'varNode',
    local_var: 'varNode',
    external: 'extNode',
  };

  const MAX_MERMAID_NODES = 60;
  const nodesToRender = tree.nodes.slice(0, MAX_MERMAID_NODES);
  const nodeIdsToRender = new Set(nodesToRender.map((n) => n.id));

  // Root Target
  const rootNode = tree.root;
  const rootCid = cleanId(rootNode.id);
  lines.push(`  ${rootCid}(["🎯 ${escapeLabel(rootNode.name)}"]):::target`);

  // Upstream Subgraph
  const upNodes = nodesToRender.filter((n) => n.direction === 'upstream');
  if (upNodes.length > 0) {
    lines.push('  subgraph Upstream ["▲ Upstream (Dependents)"]');
    upNodes.forEach((n) => {
      const cid = cleanId(n.id);
      const label = escapeLabel(n.name || n.path || cid);
      lines.push(`    ${cid}["${label}"]:::${classMap[n.type] || 'importNode'}`);
    });
    lines.push('  end');
  }

  // Downstream Subgraph
  const downNodes = nodesToRender.filter((n) => n.direction === 'downstream');
  if (downNodes.length > 0) {
    lines.push('  subgraph Downstream ["▼ Downstream (Dependencies)"]');
    downNodes.forEach((n) => {
      const cid = cleanId(n.id);
      const label = escapeLabel(n.name || n.path || cid);
      lines.push(`    ${cid}["${label}"]:::${classMap[n.type] || 'extNode'}`);
    });
    lines.push('  end');
  }

  // Edges
  lines.push('  %% Edges');
  tree.edges.forEach((e) => {
    if (nodeIdsToRender.has(e.source) && nodeIdsToRender.has(e.target)) {
      const sId = cleanId(e.source);
      const tId = cleanId(e.target);
      const edgeLabel = e.type ? `|${escapeLabel(e.type)}|` : '';
      lines.push(`  ${sId} -->${edgeLabel} ${tId}`);
    }
  });

  if (tree.nodes.length > MAX_MERMAID_NODES) {
    lines.push(
      `  %% Note: Diagram capped at top ${MAX_MERMAID_NODES} nodes for readability. See full interactive HTML.`
    );
  }

  lines.push('```');
  return lines.join('\n');
}

/**
 * Render modern interactive standalone HTML diagram.
 * Zero external CDN dependencies, works fully offline.
 * @param {Object} tree Model returned by buildDependencyTree.
 * @returns {string} Standalone HTML document.
 */
function renderInteractiveHtml(tree) {
  const treeJson = JSON.stringify(tree);
  const rootName = tree.root.name || 'Target';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dependency Tree — ${escapeHtml(rootName)}</title>
  <style>
    :root {
      --bg: #0f0f11;
      --surface: #17171c;
      --surface-card: #1f1f26;
      --border: #2b2b36;
      --border-hover: #3d3d4e;
      --accent: #7c6af7;
      --accent-dim: #5446c7;
      --text: #e5e5f0;
      --muted: #7b7b94;
      --muted-light: #a5a5bc;
      --green: #4ade80;
      --green-bg: rgba(74, 222, 128, 0.12);
      --yellow: #facc15;
      --yellow-bg: rgba(250, 204, 21, 0.12);
      --purple: #c084fc;
      --purple-bg: rgba(192, 132, 252, 0.12);
      --blue: #38bdf8;
      --blue-bg: rgba(56, 189, 248, 0.12);
      --teal: #2dd4bf;
      --teal-bg: rgba(45, 212, 191, 0.12);
      --red: #f87171;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
    }
    header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 12px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      z-index: 20;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand h1 {
      font-size: 1.15rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .badge {
      background: var(--surface-card);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 3px 10px;
      font-size: 0.75rem;
      color: var(--muted-light);
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .btn {
      background: var(--surface-card);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.8rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .btn:hover {
      background: var(--border);
      border-color: var(--border-hover);
    }
    .btn-accent {
      background: var(--accent);
      border-color: var(--accent);
      color: white;
      font-weight: 600;
    }
    .btn-accent:hover {
      background: var(--accent-dim);
    }
    .search-input {
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.8rem;
      width: 220px;
      outline: none;
    }
    .search-input:focus {
      border-color: var(--accent);
    }
    .filters {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 20px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      font-size: 0.8rem;
      overflow-x: auto;
    }
    .filter-chip {
      padding: 3px 8px;
      border-radius: 4px;
      cursor: pointer;
      border: 1px solid transparent;
      user-select: none;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .filter-chip.active {
      border-color: currentColor;
    }
    .main-area {
      flex: 1;
      display: flex;
      position: relative;
      overflow: hidden;
    }
    #viewport {
      flex: 1;
      cursor: grab;
      position: relative;
      overflow: hidden;
    }
    #viewport.dragging {
      cursor: grabbing;
    }
    svg#canvas {
      width: 100%;
      height: 100%;
      user-select: none;
    }
    /* SVG Node styling */
    .tree-node {
      cursor: pointer;
      transition: transform 0.15s ease;
    }
    .tree-node:hover rect {
      stroke-width: 2px;
      filter: brightness(1.2);
    }
    .tree-node rect {
      rx: 6;
      ry: 6;
      stroke-width: 1.5px;
    }
    .tree-edge {
      fill: none;
      stroke: var(--border-hover);
      stroke-width: 1.5px;
      transition: stroke 0.15s ease;
    }
    .tree-edge.highlighted {
      stroke: var(--accent);
      stroke-width: 2.5px;
    }
    /* Drawer */
    #drawer {
      width: 380px;
      background: var(--surface);
      border-left: 1px solid var(--border);
      padding: 20px;
      overflow-y: auto;
      display: none;
      flex-direction: column;
      gap: 16px;
      z-index: 10;
    }
    #drawer.open {
      display: flex;
    }
    .drawer-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid var(--border);
      padding-bottom: 12px;
    }
    .drawer-header h3 {
      font-size: 1.05rem;
      word-break: break-all;
    }
    .drawer-prop {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.82rem;
    }
    .drawer-prop label {
      color: var(--muted);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 0.7rem;
      letter-spacing: 0.05em;
    }
    .code-box {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px;
      font-family: monospace;
      font-size: 0.8rem;
      white-space: pre-wrap;
      word-break: break-all;
      color: #93c5fd;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <h1>🌳 Dependency Tree</h1>
      <span class="badge" id="rootBadge">${escapeHtml(tree.root.name)}</span>
      <span class="badge" style="background: var(--surface);">${tree.meta.stats.totalNodes} Nodes</span>
      <span class="badge" style="background: var(--surface);">${tree.meta.stats.totalEdges} Relations</span>
    </div>
    <div class="toolbar">
      <input type="text" id="searchInput" class="search-input" placeholder="Filter nodes..." />
      <button class="btn" id="btnZoomIn">➕ Zoom In</button>
      <button class="btn" id="btnZoomOut">➖ Zoom Out</button>
      <button class="btn" id="btnReset">🔄 Reset</button>
      <button class="btn" id="btnExportMermaid">📋 Copy Mermaid</button>
    </div>
  </header>

  <div class="filters">
    <span style="color: var(--muted); margin-right: 8px;">Filter:</span>
    <span class="filter-chip active" data-type="all" style="color: var(--text); background: var(--surface-card);">All</span>
    <span class="filter-chip active" data-type="import" style="color: var(--green); background: var(--green-bg);">Imports</span>
    <span class="filter-chip active" data-type="package_script" style="color: var(--teal); background: var(--teal-bg);">package.json</span>
    <span class="filter-chip active" data-type="job" style="color: var(--yellow); background: var(--yellow-bg);">Scheduled Jobs</span>
    <span class="filter-chip active" data-type="skill" style="color: var(--purple); background: var(--purple-bg);">Skills</span>
    <span class="filter-chip active" data-type="variable" style="color: var(--blue); background: var(--blue-bg);">Variables</span>
  </div>

  <div class="main-area">
    <div id="viewport">
      <svg id="canvas">
        <g id="transformGroup">
          <g id="edgesGroup"></g>
          <g id="nodesGroup"></g>
        </g>
      </svg>
    </div>

    <div id="drawer">
      <div class="drawer-header">
        <div>
          <h3 id="drawerTitle">Node Details</h3>
          <span id="drawerType" class="badge" style="margin-top: 6px;">type</span>
        </div>
        <button class="btn" id="btnCloseDrawer" style="padding: 2px 8px;">✕</button>
      </div>
      <div class="drawer-prop">
        <label>File Path</label>
        <span id="drawerPath" style="font-family: monospace; word-break: break-all;">-</span>
      </div>
      <div class="drawer-prop" id="drawerLineRow">
        <label>Line Number</label>
        <span id="drawerLine">-</span>
      </div>
      <div class="drawer-prop">
        <label>Code Snippet / Reference</label>
        <div id="drawerSnippet" class="code-box">-</div>
      </div>
    </div>
  </div>

  <script>
    const DATA = ${treeJson};

    const typeColors = {
      target: { fill: '#3b2d71', stroke: '#7c6af7', text: '#ffffff' },
      import: { fill: '#064e3b', stroke: '#10b981', text: '#ecfdf5' },
      package_script: { fill: '#134e4a', stroke: '#14b8a6', text: '#ccfbf1' },
      job: { fill: '#713f12', stroke: '#eab308', text: '#fef9c3' },
      skill: { fill: '#581c87', stroke: '#a855f7', text: '#faf5ff' },
      variable: { fill: '#1e3a8a', stroke: '#3b82f6', text: '#eff6ff' },
      variable_usage: { fill: '#1e3a8a', stroke: '#3b82f6', text: '#eff6ff' },
      import_var: { fill: '#1e3a8a', stroke: '#3b82f6', text: '#eff6ff' },
      local_var: { fill: '#1e3a8a', stroke: '#3b82f6', text: '#eff6ff' },
      external: { fill: '#27272a', stroke: '#71717a', text: '#f4f4f5' },
    };

    // Layout configuration
    let zoom = 1;
    let panX = 400;
    let panY = 300;
    let isDragging = false;
    let startX, startY;
    let activeFilter = 'all';

    const canvas = document.getElementById('canvas');
    const viewport = document.getElementById('viewport');
    const transformGroup = document.getElementById('transformGroup');
    const edgesGroup = document.getElementById('edgesGroup');
    const nodesGroup = document.getElementById('nodesGroup');
    const drawer = document.getElementById('drawer');

    // Pan & Zoom handlers
    viewport.addEventListener('mousedown', (e) => {
      if (e.target.closest('.tree-node')) return;
      isDragging = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
      viewport.classList.add('dragging');
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      updateTransform();
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
      viewport.classList.remove('dragging');
    });

    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = 1.1;
      if (e.deltaY < 0) zoom *= zoomFactor;
      else zoom /= zoomFactor;
      zoom = Math.max(0.2, Math.min(3, zoom));
      updateTransform();
    }, { passive: false });

    function updateTransform() {
      transformGroup.setAttribute('transform', \`translate(\${panX}, \${panY}) scale(\${zoom})\`);
    }

    document.getElementById('btnZoomIn').onclick = () => { zoom = Math.min(3, zoom * 1.2); updateTransform(); };
    document.getElementById('btnZoomOut').onclick = () => { zoom = Math.max(0.2, zoom / 1.2); updateTransform(); };
    document.getElementById('btnReset').onclick = () => {
      zoom = 1;
      panX = viewport.clientWidth / 2 - 100;
      panY = viewport.clientHeight / 2 - 50;
      updateTransform();
    };

    // Calculate hierarchical tree coordinates
    function layoutGraph() {
      const nodeMap = new Map();
      DATA.nodes.forEach(n => nodeMap.set(n.id, { ...n, x: 0, y: 0 }));

      // Center root at 0, 0
      const rootId = DATA.root.id;
      const rootNode = nodeMap.get(rootId);
      if (rootNode) {
        rootNode.x = 0;
        rootNode.y = 0;
      }

      function getSubtreeHeight(n) {
        if (!n.children || n.children.length === 0) return 1;
        let sum = 0;
        n.children.forEach(c => { sum += getSubtreeHeight(c); });
        return Math.max(1, sum);
      }

      function layoutTree(nList, depth, direction, startY, unitHeight) {
        let yCursor = startY;
        nList.forEach(n => {
          const item = nodeMap.get(n.id);
          const h = getSubtreeHeight(n);
          const nodeCenterY = yCursor + (h * unitHeight) / 2 - (unitHeight / 2);
          if (item) {
            item.x = direction * depth * 320;
            item.y = nodeCenterY;
          }
          if (n.children && n.children.length > 0) {
            layoutTree(n.children, depth + 1, direction, yCursor, unitHeight);
          }
          yCursor += h * unitHeight;
        });
      }

      const upstreamNodes = DATA.upstream || [];
      const downNodes = DATA.downstream || [];
      const unit = 68;

      const upTotalH = upstreamNodes.reduce((sum, n) => sum + getSubtreeHeight(n), 0);
      const downTotalH = downNodes.reduce((sum, n) => sum + getSubtreeHeight(n), 0);

      layoutTree(upstreamNodes, 1, -1, -(upTotalH * unit) / 2, unit);
      layoutTree(downNodes, 1, 1, -(downTotalH * unit) / 2, unit);

      return nodeMap;
    }

    function renderGraph() {
      const positions = layoutGraph();
      edgesGroup.innerHTML = '';
      nodesGroup.innerHTML = '';

      const searchVal = document.getElementById('searchInput').value.toLowerCase().trim();

      // Render Edges
      DATA.edges.forEach(edge => {
        const s = positions.get(edge.source);
        const t = positions.get(edge.target);
        if (!s || !t) return;

        // Apply active filter
        if (activeFilter !== 'all') {
          if (s.type !== activeFilter && t.type !== activeFilter && s.type !== 'target' && t.type !== 'target') return;
        }

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const dx = (t.x - s.x) / 2;
        const d = \`M \${s.x} \${s.y} C \${s.x + dx} \${s.y}, \${t.x - dx} \${t.y}, \${t.x} \${t.y}\`;
        path.setAttribute('d', d);
        path.setAttribute('class', 'tree-edge');
        path.setAttribute('id', \`edge_\${edge.id}\`);
        edgesGroup.appendChild(path);
      });

      // Render Nodes
      positions.forEach(node => {
        if (activeFilter !== 'all' && node.type !== 'target' && !node.type.includes(activeFilter)) return;

        const isMatch = searchVal ? (node.name.toLowerCase().includes(searchVal) || (node.path && node.path.toLowerCase().includes(searchVal))) : true;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'tree-node');
        g.setAttribute('transform', \`translate(\${node.x}, \${node.y})\`);
        g.style.opacity = isMatch ? '1' : '0.2';

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        const width = 220;
        const height = 44;
        rect.setAttribute('x', -width / 2);
        rect.setAttribute('y', -height / 2);
        rect.setAttribute('width', width);
        rect.setAttribute('height', height);

        const colors = typeColors[node.type] || typeColors.import;
        rect.setAttribute('fill', colors.fill);
        rect.setAttribute('stroke', isMatch && searchVal ? '#facc15' : colors.stroke);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', 0);
        text.setAttribute('y', -2);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', colors.text);
        text.setAttribute('font-size', '12px');
        text.setAttribute('font-weight', '600');
        text.textContent = node.name.length > 24 ? node.name.slice(0, 22) + '...' : node.name;

        const subText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        subText.setAttribute('x', 0);
        subText.setAttribute('y', 14);
        subText.setAttribute('text-anchor', 'middle');
        subText.setAttribute('fill', '#94a3b8');
        subText.setAttribute('font-size', '10px');
        subText.textContent = \`[\${node.type}]\`;

        g.appendChild(rect);
        g.appendChild(text);
        g.appendChild(subText);

        g.onclick = (e) => {
          e.stopPropagation();
          showDrawer(node);
        };

        nodesGroup.appendChild(g);
      });
    }

    function showDrawer(node) {
      document.getElementById('drawerTitle').textContent = node.name;
      document.getElementById('drawerType').textContent = node.type;
      document.getElementById('drawerPath').textContent = node.path || '-';
      document.getElementById('drawerLine').textContent = node.line || '-';
      document.getElementById('drawerSnippet').textContent = node.snippet || '-';
      drawer.classList.add('open');
    }

    document.getElementById('btnCloseDrawer').onclick = () => {
      drawer.classList.remove('open');
    };

    // Filter Chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.onclick = () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activeFilter = chip.getAttribute('data-type');
        renderGraph();
      };
    });

    document.getElementById('searchInput').oninput = () => {
      renderGraph();
    };

    document.getElementById('btnExportMermaid').onclick = () => {
      const mermaidCode = DATA.mermaid || '';
      navigator.clipboard.writeText(mermaidCode).then(() => {
        alert('Mermaid diagram markdown copied to clipboard!');
      }).catch(() => {
        prompt('Copy Mermaid markdown:', mermaidCode);
      });
    };

    // Initialize layout
    document.getElementById('btnReset').click();
    renderGraph();
  </script>
</body>
</html>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Target Resolution ─────────────────────────────────────────────────────────

/**
 * Resolve target input into a structured target object.
 * @param {string} targetInput Target string (path or variable name).
 * @param {Object} cliFlags CLI flags (--file, --var, etc.).
 * @param {Map<string, string>} fileMap Map of relPath -> content.
 * @param {Set<string>} allFiles Set of all repo files.
 * @returns {Object} Target descriptor.
 */
function resolveTarget(targetInput, cliFlags, fileMap, allFiles) {
  // Explicit variable flag
  if (cliFlags.var) {
    const varName = cliFlags.var;
    const targetFile = cliFlags.file ? toRelPath(cliFlags.file) : null;
    const declarations = findVariableDeclarations(varName, fileMap, targetFile);

    return {
      isVariable: true,
      name: varName,
      file: targetFile || (declarations.length > 0 ? declarations[0].file : null),
      line: declarations.length > 0 ? declarations[0].line : 1,
      snippet: declarations.length > 0 ? declarations[0].snippet : '',
      declaration: declarations[0] || null,
      allDeclarations: declarations,
    };
  }

  // Explicit file flag
  if (cliFlags.file && !targetInput) {
    targetInput = cliFlags.file;
  }

  if (!targetInput) {
    throw new Error('No target specified. Provide a file path or variable name.');
  }

  // Normalize targetInput path
  const normalizedPath = toRelPath(targetInput);

  // 1. Exact match in allFiles
  if (allFiles.has(normalizedPath)) {
    return {
      isVariable: false,
      name: path.basename(normalizedPath),
      path: normalizedPath,
      line: 1,
    };
  }

  // 2. Try with extensions
  for (const ext of CODE_EXTENSIONS) {
    if (allFiles.has(normalizedPath + ext)) {
      return {
        isVariable: false,
        name: path.basename(normalizedPath + ext),
        path: normalizedPath + ext,
        line: 1,
      };
    }
  }

  // 3. Basename or partial path search
  const matches = Array.from(allFiles).filter((f) => {
    return (
      f === targetInput ||
      f.endsWith('/' + targetInput) ||
      path.basename(f) === targetInput ||
      path.basename(f, path.extname(f)) === targetInput
    );
  });

  if (matches.length === 1) {
    return {
      isVariable: false,
      name: path.basename(matches[0]),
      path: matches[0],
      line: 1,
    };
  } else if (matches.length > 1) {
    // If multiple files match, pick the most exact or shortest relative path
    const sorted = [...matches].sort((a, b) => a.length - b.length);
    return {
      isVariable: false,
      name: path.basename(sorted[0]),
      path: sorted[0],
      line: 1,
      candidates: matches,
    };
  }

  // 4. If not a file, check if it is a variable declaration across the repo
  const varDecls = findVariableDeclarations(targetInput, fileMap);
  if (varDecls.length > 0) {
    return {
      isVariable: true,
      name: targetInput,
      file: varDecls[0].file,
      line: varDecls[0].line,
      snippet: varDecls[0].snippet,
      declaration: varDecls[0],
      allDeclarations: varDecls,
    };
  }

  // Fallback: treat as file path even if not yet in git
  return {
    isVariable: false,
    name: path.basename(normalizedPath),
    path: normalizedPath,
    line: 1,
  };
}

// ── CLI Runner ────────────────────────────────────────────────────────────────

/**
 * Parse CLI arguments.
 * @param {string[]} args Process argv slice.
 * @returns {{ targetInput: string|null, flags: Object }}
 */
function parseArgs(args) {
  const flags = {
    direction: 'both',
    depth: 5,
    format: 'all',
    output: null,
    open: false,
    file: null,
    var: null,
    json: false,
  };

  let targetInput = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--open') {
      flags.open = true;
    } else if (arg === '--json') {
      flags.json = true;
      flags.format = 'json';
    } else if (arg === '--file' || arg === '-f') {
      flags.file = args[++i];
    } else if (arg.startsWith('--file=')) {
      flags.file = arg.slice('--file='.length);
    } else if (arg === '--var' || arg === '-v') {
      flags.var = args[++i];
    } else if (arg.startsWith('--var=')) {
      flags.var = arg.slice('--var='.length);
    } else if (arg === '--depth' || arg === '-l') {
      flags.depth = parseInt(args[++i], 10) || 5;
    } else if (arg.startsWith('--depth=')) {
      flags.depth = parseInt(arg.slice('--depth='.length), 10) || 5;
    } else if (arg === '--direction' || arg === '-d') {
      flags.direction = args[++i];
    } else if (arg.startsWith('--direction=')) {
      flags.direction = arg.slice('--direction='.length);
    } else if (arg === '--format') {
      flags.format = args[++i];
    } else if (arg.startsWith('--format=')) {
      flags.format = arg.slice('--format='.length);
    } else if (arg === '--output' || arg === '-o') {
      flags.output = args[++i];
    } else if (arg.startsWith('--output=')) {
      flags.output = arg.slice('--output='.length);
    } else if (!arg.startsWith('-') && !targetInput) {
      targetInput = arg;
    }
  }

  return { targetInput, flags };
}

/**
 * Print CLI Help message.
 */
function printHelp() {
  console.log(`
Usage:
  yarn dep:tree <target> [options]
  node scripts/dependency-tree.js <target> [options]

Arguments:
  <target>                     File path or variable/symbol name to analyze

Options:
  -f, --file <path>            Scope analysis to a specific file
  -v, --var <name>             Explicitly specify variable/symbol name
  -d, --direction <dir>        Tree direction: 'both' (default), 'upstream', 'downstream'
  -l, --depth <num>            Maximum recursion depth (default: 5)
  --format <fmt>               Output format: 'all' (default), 'text', 'mermaid', 'html', 'json'
  -o, --output <file>          Custom output path for generated HTML / Mermaid diagram
  --open                       Automatically open generated HTML diagram in default browser
  --json                       Output machine-readable JSON graph DTO
  -h, --help                   Display this help message

Examples:
  yarn dep:tree packages/jobs-runtime/lib/db.js
  yarn dep:tree scripts/dead-code-scanner.js
  yarn dep:tree saveThesis
  yarn dep:tree --file packages/jobs-runtime/lib/db.js --var saveThesis
  yarn dep:tree stockscans.js --format=html --open
`);
}

/**
 * Main execution entry point.
 */
function main() {
  const { targetInput, flags } = parseArgs(process.argv.slice(2));

  if (flags.help || (!targetInput && !flags.file && !flags.var)) {
    printHelp();
    process.exit(0);
  }

  // 1. Gather all files and map content
  const repoFiles = getRepoFiles();
  const allFiles = new Set(repoFiles);
  const fileMap = new Map();

  repoFiles.forEach((f) => {
    fileMap.set(f, readFileSafe(f));
  });

  // 2. Resolve Target
  const target = resolveTarget(targetInput, flags, fileMap, allFiles);

  // 3. Build Dependency Tree
  const tree = buildDependencyTree(target, fileMap, allFiles, {
    depth: flags.depth,
    direction: flags.direction,
  });

  // Attach Mermaid string to tree DTO
  tree.mermaid = renderMermaid(tree);

  // 4. Render Formats
  if (flags.json || flags.format === 'json') {
    console.log(JSON.stringify(tree, null, 2));
    return;
  }

  // Terminal Tree Output
  if (flags.format === 'all' || flags.format === 'text') {
    const termOutput = renderTerminalTree(tree);
    console.log(termOutput);
  }

  // Mermaid Output
  if (flags.format === 'mermaid') {
    console.log(tree.mermaid);
  }

  // HTML Output
  if (flags.format === 'all' || flags.format === 'html') {
    const html = renderInteractiveHtml(tree);
    const sanitizedTarget = (target.name || 'target').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const defaultOutDir = path.join(ROOT_DIR, 'data', 'runs');
    if (!fs.existsSync(defaultOutDir)) {
      fs.mkdirSync(defaultOutDir, { recursive: true });
    }
    const outputPath = flags.output
      ? path.resolve(flags.output)
      : path.join(defaultOutDir, `dep-tree-${sanitizedTarget}.html`);

    fs.writeFileSync(outputPath, html, 'utf-8');
    console.log(`🌐 Visual HTML Tree generated: file://${outputPath}`);

    if (flags.open) {
      try {
        execSync(`open "${outputPath}"`);
      } catch (_e) {
        // Fallback for non-mac or environments without open
      }
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  getRepoFiles,
  resolveImportPath,
  extractDirectDependencies,
  findVariableDeclarations,
  extractVariableDependencies,
  findPackageJsonReferences,
  findScheduledJobReferences,
  findSkillReferences,
  findDirectImportsToTarget,
  findVariableUsages,
  buildDependencyTree,
  renderTerminalTree,
  renderMermaid,
  renderInteractiveHtml,
  resolveTarget,
};
