#!/usr/bin/env node
'use strict';

/**
 * reachability-graph.js — Full-repository dead-code reachability engine.
 *
 * Rebuilds dead-code detection from first principles as a graph reachability
 * problem, rather than the "does this string appear anywhere" heuristic that
 * scripts/dead-code-scanner.js's Category D previously used.
 *
 * Definition of "dead": a node in the codebase graph is dead if and only if
 * it is NOT reachable from any of the four entry-point categories:
 *
 *   1. Skills          — every file under skills/**
 *   2. Scheduled jobs   — every file under jobs/Scheduled/**
 *   3. package.json scripts — every script command in every package.json
 *   4. UI entry points  — screener-web/pages/**, browser-extension roots
 *                          (any directory containing a manifest.json), and
 *                          standalone dashboards (tools/tasks/index.html)
 *
 * Backend API / library code (screener-api/**, stock-api/**, shared libs)
 * must additionally trace back to a UI entry point specifically — being
 * wired into server.js routing alone is not enough, because a route that no
 * frontend ever calls is still dead in practice. See traceRouteUsage().
 *
 * data/ is not graph-walked file-by-file (23k+ files, no import edges to
 * follow). Instead each top-level data/ entry is treated as one reachability
 * unit: "referenced" if some code path uses packages/jobs-runtime/lib/db.js
 * (or a sanctioned wrapper: jsonlStore.js, notesDb.js, concallNotesStore.js,
 * orderAnnouncementStore.js, companyMaster.js, storageStats.js, etc. — i.e.
 * anything importing db.js/jsonlStore.js) with that collection/dir name.
 * Anything in data/ not covered by a recognized collection, OR any script
 * touching data/ directly without going through db.js, is a "hanging node" —
 * reported separately, never silently dropped.
 *
 * File-type-aware traversal: only CODE_EXTENSIONS files are opened and
 * parsed for import/require edges. Everything else (pdf, docx, pptx, xlsx,
 * csv, txt, png, mp3, zip, etc.) is only checked for whether its path/name
 * is referenced somewhere in the code graph — never parsed for content.
 */

const fs = require('fs');
const path = require('path');

const {
  WORKSPACE_PACKAGES,
  resolveImportPath,
  extractDirectDependencies,
} = require('./dependency-tree');

const ROOT_DIR = path.resolve(__dirname, '..');

const CODE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
// json is parsed for package.json scripts specifically, not import-scanned generally
const PARSEABLE_EXTENSIONS = new Set([...CODE_EXTENSIONS, '.json']);

// Only truly non-repo, non-content directories are excluded from the walk.
// NOTE: unlike dependency-tree.js and the old dead-code-scanner.js, `data`
// is NOT in this list — data/ must be inventoried too (per the hanging-node
// requirement), it's just handled as collection-units rather than per-file.
const HARD_EXCLUDE_DIRS = new Set(['node_modules', '.git', '.next', '.yarn']);
const HARD_EXCLUDE_BASENAMES = new Set(['.DS_Store']);

// ── 1. Full filesystem inventory (includes gitignored files) ───────────────

/**
 * Walk the entire repo on disk — not `git ls-files`, which is tracked-only,
 * and not `--exclude-standard`, which drops gitignored files. Only a fixed
 * denylist of build/vendor directories is skipped.
 */
function walkAllFiles(rootDir = ROOT_DIR) {
  const results = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_e) {
      return;
    }
    for (const entry of entries) {
      if (HARD_EXCLUDE_BASENAMES.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (HARD_EXCLUDE_DIRS.has(entry.name)) continue;
        walk(full);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        results.push(path.relative(rootDir, full).replace(/\\/g, '/'));
      }
    }
  }

  walk(rootDir);
  return results;
}

function readFileSafe(absPath) {
  try {
    return fs.readFileSync(absPath, 'utf-8');
  } catch (_e) {
    return '';
  }
}

// ── 2. Entry-point discovery ────────────────────────────────────────────────

const UI_MANIFEST_ROOTS = [
  // extensions/* — each directory containing a manifest.json is a UI surface
  // in its own right (browser extension popup/sidepanel/content-script).
  'extensions',
  'tools',
];

const STANDALONE_UI_FILES = [
  // Static dashboards a human opens directly, not part of screener-web.
  'tools/tasks/index.html',
];

/**
 * Discover every UI entry-point root: screener-web/pages/**, any directory
 * containing a manifest.json (browser extensions), and named standalone
 * dashboard files.
 */
function discoverUiEntryPoints(allFiles) {
  const roots = new Set();

  allFiles.forEach((f) => {
    if (f.startsWith('screener-web/pages/')) roots.add(f);
  });

  STANDALONE_UI_FILES.forEach((f) => {
    if (allFiles.includes(f)) roots.add(f);
  });

  // Any manifest.json under extensions/ or tools/ marks its whole containing
  // directory tree as a UI surface (popup/background/content scripts, etc.)
  const manifestDirs = new Set();
  allFiles.forEach((f) => {
    if (path.basename(f) !== 'manifest.json') return;
    if (!UI_MANIFEST_ROOTS.some((root) => f.startsWith(root + '/'))) return;
    manifestDirs.add(path.dirname(f));
  });

  allFiles.forEach((f) => {
    for (const dir of manifestDirs) {
      if (f === dir || f.startsWith(dir + '/')) {
        roots.add(f);
        break;
      }
    }
  });

  return { roots, manifestDirs };
}

/**
 * Discover every package.json `scripts` entry, resolved to real file paths
 * where the command directly names a code file.
 */
function discoverPackageScriptRoots(allFiles, fileContentsMap) {
  const roots = new Set();
  const pkgFiles = allFiles.filter((f) => path.basename(f) === 'package.json');

  pkgFiles.forEach((pkgFile) => {
    roots.add(pkgFile);
    let data;
    try {
      data = JSON.parse(fileContentsMap.get(pkgFile) || '{}');
    } catch (_e) {
      return;
    }
    const scripts = Object.values(data.scripts || {});
    const allFileSet = new Set(allFiles);
    scripts.forEach((cmd) => {
      if (typeof cmd !== 'string') return;
      cmd.split(/\s+/).forEach((rawTok) => {
        const tok = rawTok.replace(/["';]/g, '');
        if (!CODE_EXTENSIONS.some((ext) => tok.endsWith(ext)) && !tok.endsWith('.sh')) return;
        const direct = tok.startsWith('./') ? tok.slice(2) : tok;
        const fromPkgDir = path.join(path.dirname(pkgFile), direct).replace(/\\/g, '/');
        if (allFileSet.has(direct)) roots.add(direct);
        if (allFileSet.has(fromPkgDir)) roots.add(fromPkgDir);
      });
    });
  });

  return roots;
}

/**
 * skills/**, jobs/Scheduled/**, and jobs/Artifacts/** — every file under
 * them is a root, unconditionally.
 *
 * jobs/Scheduled/**\/SKILL.md files ARE the job definitions Cowork/cron
 * invoke by path — nothing in application code ever require()s them, so
 * without this they'd all read as unreachable.
 *
 * jobs/Artifacts/** holds rendered, persisted Cowork artifacts (dashboards,
 * reports) and their version history. These are generated OUTPUT the user
 * opens directly by URL/path, not source consumed by the import graph — the
 * same "build output, not dead" reasoning as BUILD_OUTPUT_DIR_PREFIXES below,
 * except these are genuinely alive (the user revisits them), not just
 * regenerable, so they belong as roots rather than in the build-output list.
 * Per explicit instruction (2026-09-16): treat both dirs as never dead.
 */
function discoverStaticPrefixRoots(allFiles) {
  const roots = new Set();
  allFiles.forEach((f) => {
    if (
      f.startsWith('skills/') ||
      f.startsWith('jobs/Scheduled/') ||
      f.startsWith('jobs/Artifacts/')
    ) {
      roots.add(f);
    }
  });
  return roots;
}

/**
 * Extract exact script-path invocations from SKILL.md prose: `node
 * scripts/foo.js ...`, `python3 scripts/bar.py ...`, `python scripts/x.py`.
 * A skill/job SKILL.md is itself already a root (discoverStaticPrefixRoots),
 * but that doesn't make the SCRIPT IT INVOKES a root — the import-graph BFS
 * has no edge for "this markdown file's prose tells a human/agent to run
 * this shell command," since it's not a require()/import. Without this pass,
 * every script only ever invoked via a documented CLI instruction (not
 * imported by any .js file) reads as unreachable, which was a confirmed,
 * systematic false-positive class (track_invocation.py,
 * check_extraction_success.js/.py, daily_results_extractor.js/.py,
 * verify_dead_code.js, the monthly-sales-tracker script family — all
 * directly invoked from active jobs/Scheduled/**\/SKILL.md files).
 *
 * Matching is intentionally an EXACT relative-path resolution, never a
 * substring/basename heuristic: the captured token after node/python/python3
 * must resolve, via the same resolver used for real imports, to a real file
 * that exists in allFiles. A prose mention of a bare filename with no path
 * information is NOT treated as a reference — only a resolvable path counts.
 */
function discoverSkillInvokedScriptRoots(allFiles, fileContentsMap) {
  const roots = new Set();
  const allFileSet = new Set(allFiles);
  // Matches: node <path>, python <path>, python3 <path> — the path token is
  // everything up to the next whitespace, quote, or backtick, so flags like
  // `--date $(date ...)` after it are not swallowed into the path.
  const invocationRegex = /\b(?:node|python3?)\s+([A-Za-z0-9_\-./]+\.(?:js|mjs|cjs|py))\b/g;
  // Matches: find <dir> -path '*packages/jobs-runtime/foo.js' — a real,
  // established convention in this repo's SKILL.md files (17 occurrences
  // across 12 files) for dynamically discovering a script's absolute path
  // across different session sandbox roots at run time, then deriving
  // sibling script paths from the discovered directory. The script named in
  // the -path glob is a genuine, load-bearing dependency even though it's
  // never spelled out as a direct `node <path>` invocation.
  const findPathRegex = /find\s+\S+\s+-path\s+['"]\*([A-Za-z0-9_\-./]+\.(?:js|mjs|cjs|py))['"]/g;

  allFiles.forEach((f) => {
    if (!f.endsWith('.md')) return;
    const content = fileContentsMap.get(f);
    if (!content) return;

    [invocationRegex, findPathRegex].forEach((baseRegex) => {
      let m;
      const re = new RegExp(baseRegex.source, 'g');
      while ((m = re.exec(content)) !== null) {
        const rawPath = m[1];
        // Exact match against the repo root first (this is how every real
        // instance found in this repo is written: `node scripts/x.js` is
        // already relative to the repo root, not to the SKILL.md's directory).
        if (allFileSet.has(rawPath)) {
          roots.add(rawPath);
          continue;
        }
        // Fall back to resolving relative to the invoking file's directory,
        // in case some SKILL.md ever writes a ./-relative invocation.
        const res = resolveImportPath(
          rawPath.startsWith('.') ? rawPath : './' + rawPath,
          f,
          allFileSet
        );
        if (res.resolved) roots.add(res.resolved);
      }
    });
  });

  return roots;
}

// Directories where a RUNNER_INVOKED_BASENAMES match is trusted: repo root,
// plus every real yarn workspace root (from dependency-tree.js's own
// WORKSPACE_PACKAGES map — the single source of truth for "this is a real
// package", already used elsewhere for import resolution). A basename match
// OUTSIDE these roots does not get the exemption — see isRunnerInvokedConfigPath.
const RUNNER_INVOKED_CONFIG_ROOTS = new Set([
  '', // repo root itself (a file with no '/' in its relative path)
  ...Object.values(WORKSPACE_PACKAGES).map((meta) => meta.root),
]);

/**
 * True only when `relPath` is both a recognized tool-config basename AND
 * sits directly inside repo root or a real workspace root (not nested
 * arbitrarily deep, not inside a random non-workspace directory).
 *
 * Without the directory check, a basename match alone would wave through
 * e.g. `frontend/.env.local` / `frontend/package-lock.json` as "tool
 * config" just because those filenames are known config names somewhere
 * in the repo — even though `frontend/` isn't a real workspace (no
 * package.json, not in WORKSPACE_PACKAGES) and nothing reads them. That was
 * a real, confirmed false-negative: an abandoned directory's leftover
 * lockfile/env file was silently exempted from ever being flagged dead.
 */
function isRunnerInvokedConfigPath(relPath) {
  if (!RUNNER_INVOKED_BASENAMES.has(path.basename(relPath))) return false;
  const dir = path.dirname(relPath).replace(/\\/g, '/');
  const normalizedDir = dir === '.' ? '' : dir;
  return RUNNER_INVOKED_CONFIG_ROOTS.has(normalizedDir);
}

// Files that are invoked directly by a tool/runner rather than imported by
// other source — a config a linter/bundler/test-runner loads by convention,
// or a test file the test runner discovers and executes itself. These are
// never `require()`d by application code, so without treating them as roots
// they would always show up as false-positive dead code.
const RUNNER_INVOKED_BASENAMES = new Set([
  '.eslintrc.js',
  '.prettierrc.js',
  '.prettierrc',
  '.prettierignore',
  '.yarnrc.yml',
  'jest.config.js',
  'jest.config.cjs',
  'jest.setup.js',
  'next.config.js',
  'tailwind.config.js',
  'postcss.config.js',
  'babel.config.js',
  'commitlint.config.js',
  'docker-compose.yml',
  'docker-compose.yaml',
  'Dockerfile',
  '.gitignore',
  '.env',
  '.env.local',
  '.env.example',
  'package-lock.json',
  'yarn.lock',
]);

// Directory prefixes whose contents are consumed by an external tool
// (Cursor, Docker, CI) by convention/directory-scanning, not by require() —
// so nothing in application code will ever literally reference them.
const RUNNER_INVOKED_DIR_PREFIXES = ['.cursor/', '.github/'];

// Build OUTPUT (not source) directories — generated by a build step, so
// they're correctly unreachable via source-level import graphs, but they
// are not "dead code to delete" in the same sense as an orphaned source
// file: deleting the source that generates them would be the real fix, not
// deleting the compiled artifact. Reported separately, never mixed into the
// actionable dead-file list.
const BUILD_OUTPUT_DIR_PREFIXES = [
  'coverage/',
  '/coverage/',
  // 'dist-skills/' was here for the old bundle-mode skill architecture
  // (stock-api/dist-skills/*.cjs, fetched by the github-skill-invoker meta-
  // skill). That whole folder + skill were deleted 2026-09-16 — confirmed
  // unused — so there's nothing left for this prefix to match; removed.
  '.next/',
];

function isBuildOutputPath(relPath) {
  return BUILD_OUTPUT_DIR_PREFIXES.some(
    (prefix) => relPath.includes('/' + prefix) || relPath.startsWith(prefix)
  );
}

function discoverRunnerInvokedRoots(allFiles) {
  const roots = new Set();
  allFiles.forEach((f) => {
    const base = path.basename(f);
    if (isRunnerInvokedConfigPath(f)) {
      roots.add(f);
      return;
    }
    if (RUNNER_INVOKED_DIR_PREFIXES.some((prefix) => f.startsWith(prefix))) {
      roots.add(f);
      return;
    }
    // *.test.js / *.spec.js — discovered and executed directly by the test
    // runner (jest), never imported by application code.
    if (/\.(test|spec)\.js$/.test(base)) {
      roots.add(f);
    }
  });
  return roots;
}

// Structured skill-dependency registries — a more authoritative, more exact
// source of truth than scraping SKILL.md prose for invocation commands.
// Confirmed real repo files: skills/registry.json and
// skills/registry.manifest.json (per-skill { entry, references, shared,
// modules } path arrays) and skills/registries/workflow-dependencies.json
// ({ skills[], classes[], apis[], utilities[] }, each with entry/modules
// path arrays). These are what actually caught e.g.
// scripts/metrics/analyze_token_usage.py as a real dependency — it's not
// mentioned via any `python3 <path>` invocation anywhere, only via this
// registry's structured "entry" field, which is exactly the kind of exact,
// non-prose reference this rebuild is supposed to trust.
const SKILL_REGISTRY_FILES = [
  'skills/registry.json',
  'skills/registry.manifest.json',
  'skills/registries/workflow-dependencies.json',
];

/**
 * Recursively collect every string value in a parsed JSON structure that
 * looks like a repo-relative file path (contains a '/' and ends in a known
 * extension) AND exactly matches a real file in allFiles. No fuzzy
 * matching — a string that merely resembles a path but doesn't resolve to
 * a real file is silently skipped (it might be a URL, a doc-section
 * anchor, or a stale reference to a since-renamed/moved file, which is a
 * separate, worth-flagging problem but not something to treat as "this file
 * is alive").
 */
function collectPathStrings(node, allFileSet, out) {
  if (typeof node === 'string') {
    if (allFileSet.has(node)) out.add(node);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item) => collectPathStrings(item, allFileSet, out));
    return;
  }
  if (node && typeof node === 'object') {
    Object.values(node).forEach((v) => collectPathStrings(v, allFileSet, out));
  }
}

function discoverSkillRegistryRoots(allFiles, fileContentsMap) {
  const roots = new Set();
  const allFileSet = new Set(allFiles);

  SKILL_REGISTRY_FILES.forEach((regFile) => {
    if (!allFileSet.has(regFile)) return;
    const content = fileContentsMap.get(regFile);
    if (!content) return;
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (_e) {
      return; // malformed JSON — not this pass's problem to fix
    }
    collectPathStrings(parsed, allFileSet, roots);
  });

  return roots;
}

function discoverAllEntryRoots(allFiles, fileContentsMap) {
  const { roots: uiRoots, manifestDirs } = discoverUiEntryPoints(allFiles);
  const pkgRoots = discoverPackageScriptRoots(allFiles, fileContentsMap);
  const staticRoots = discoverStaticPrefixRoots(allFiles);
  const runnerRoots = discoverRunnerInvokedRoots(allFiles);
  const skillInvokedRoots = discoverSkillInvokedScriptRoots(allFiles, fileContentsMap);
  const skillRegistryRoots = discoverSkillRegistryRoots(allFiles, fileContentsMap);

  const all = new Set([
    ...uiRoots,
    ...pkgRoots,
    ...staticRoots,
    ...runnerRoots,
    ...skillInvokedRoots,
    ...skillRegistryRoots,
  ]);
  return {
    allRoots: all,
    uiRoots,
    pkgRoots,
    staticRoots,
    runnerRoots,
    skillInvokedRoots,
    skillRegistryRoots,
    manifestDirs,
  };
}

// ── 3. Multi-root BFS over the import/require graph ─────────────────────────

/**
 * Build forward adjacency (file -> files it imports) for every parseable
 * source file in one pass, reusing dependency-tree.js's real resolver.
 */
function buildAdjacency(allFiles, fileContentsMap) {
  const allFileSet = new Set(allFiles);
  const adjacency = new Map(); // file -> Set(resolvedTargets)

  allFiles.forEach((f) => {
    const ext = path.extname(f).toLowerCase();
    if (!PARSEABLE_EXTENSIONS.has(ext)) return;
    const content = fileContentsMap.get(f) || '';
    if (!content) return;

    const deps = extractDirectDependencies(content, f, allFileSet);
    const targets = new Set();
    deps.forEach((d) => {
      if (d.target) targets.add(d.target);
    });
    if (targets.size) adjacency.set(f, targets);
  });

  return adjacency;
}

/**
 * BFS from all entry roots simultaneously. Returns the set of files reached,
 * plus for each reached file the shortest path back to *a* root (used later
 * to test whether any path passes through a UI root for the API-tracing rule).
 */
function multiRootBfs(roots, adjacency) {
  const reached = new Map(); // file -> { via: parentFile|null, rootPath: [file...] }
  const queue = [];

  roots.forEach((r) => {
    if (!reached.has(r)) {
      reached.set(r, { via: null, rootPath: [r] });
      queue.push(r);
    }
  });

  while (queue.length) {
    const current = queue.shift();
    const targets = adjacency.get(current);
    if (!targets) continue;
    for (const t of targets) {
      if (reached.has(t)) continue;
      const parentInfo = reached.get(current);
      reached.set(t, { via: current, rootPath: [...parentInfo.rootPath, t] });
      queue.push(t);
    }
  }

  return reached;
}

// ── 4. API-route-to-UI-page tracing ─────────────────────────────────────────

/**
 * screener-api/** files are only "really" alive if their reachability path
 * from entry roots passes through a UI root (a page or extension file), OR
 * if the mount PREFIX their router is registered under (app.use('/api/x',
 * require('./xRoutes'))) is called from the transitive closure of what a UI
 * root imports.
 *
 * Matching on individual sub-route literals (router.get('/:symbol', ...))
 * was tried first and rejected: many real, live routes register only a
 * dynamic param path with zero static segments (e.g. '/', '/:symbol'), so
 * there's nothing to string-match against. The actual frontend call site is
 * also frequently several imports removed from the UI root — a page calls a
 * custom hook (useWatchlist), which calls a named export on a shared API
 * client module (watchlistAPI.getAll = () => api.get('/watchlist')) — so the
 * literal call string lives on the mount prefix, not the Express sub-route.
 * Confirmed against this repo's actual server.js + api.js pattern.
 */
function traceApiUsageFromUi(apiFiles, uiRoots, fileContentsMap, adjacency, allFiles) {
  // Forward BFS from UI roots only, over the whole import graph, to get the
  // full frontend-side transitive closure (pages -> hooks -> api.js lib ->
  // etc.) rather than just the root files' own literal text.
  const uiReachable = multiRootBfs(uiRoots, adjacency || new Map());
  const uiText = Array.from(uiReachable.keys())
    .map((f) => fileContentsMap.get(f) || '')
    .join('\n');

  // Discover mount-prefix -> route-file mappings from every app.use('/api/x',
  // require('./xRoutes')) call anywhere in screener-api/** (usually just
  // server.js, but not assumed to be only there).
  const mountRegex =
    /app\.use\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*require\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  const mountedRouteFiles = new Set(); // route files that ARE mounted somewhere
  const prefixToFiles = new Map(); // mountPrefix -> Set(route file rel paths)

  (allFiles || apiFiles).forEach((f) => {
    if (!f.startsWith('screener-api/')) return;
    const content = fileContentsMap.get(f) || '';
    if (!content.includes('app.use(')) return;
    let m;
    const re = new RegExp(mountRegex.source, 'g');
    while ((m = re.exec(content)) !== null) {
      const mountPrefix = m[1]; // e.g. '/api/watchlist'
      const specifier = m[2]; // e.g. './features/watchlist/watchlistRoutes'
      const res = resolveImportPath(specifier, f, new Set(allFiles || apiFiles));
      if (!res.resolved) continue;
      mountedRouteFiles.add(res.resolved);
      if (!prefixToFiles.has(mountPrefix)) prefixToFiles.set(mountPrefix, new Set());
      prefixToFiles.get(mountPrefix).add(res.resolved);
    }
  });

  const usedByUiRouteCall = new Set();
  prefixToFiles.forEach((routeFiles, mountPrefix) => {
    // Strip the leading '/api' since the frontend's axios baseURL already
    // includes it (NEXT_PUBLIC_API_URL defaults to 'http://localhost:5001/api'),
    // so calls look like api.get('/watchlist'), not api.get('/api/watchlist').
    const shortPrefix = mountPrefix.replace(/^\/api/, '');
    const escaped = shortPrefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const callRegex = new RegExp(`['"\`\`]${escaped}(?:[/'"\`]|\\$\\{)`);
    if (callRegex.test(uiText)) {
      routeFiles.forEach((rf) => usedByUiRouteCall.add(rf));
    }
  });

  // Fallback: literal sub-route static-segment matching, for any route file
  // NOT reached via an app.use(...require(...)) mount (e.g. inline routes
  // defined directly in server.js, or a route file this pass didn't map).
  apiFiles.forEach((f) => {
    if (mountedRouteFiles.has(f)) return; // already resolved via mount-prefix pass
    const content = fileContentsMap.get(f) || '';
    const routeRegex = /\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let m;
    while ((m = routeRegex.exec(content)) !== null) {
      const routePath = m[2];
      const staticSegments = routePath.split('/').filter((seg) => seg && !seg.startsWith(':'));
      if (staticSegments.length === 0) continue;
      const allSegmentsPresent = staticSegments.every((seg) => uiText.includes(seg));
      if (allSegmentsPresent) {
        usedByUiRouteCall.add(f);
      }
    }
  });

  return usedByUiRouteCall;
}

// ── 5. data/ collection-level reachability ──────────────────────────────────

const DATA_LAYER_FILES_PATTERN =
  /(^|\/)(db|jsonlStore|notesDb|concallNotesStore|orderAnnouncementStore|companyMaster|storageStats|orderBookEvents|tradingCalendar|windowCursor)\.js$/;

/**
 * A file counts as "going through the data layer" if it requires/imports
 * db.js or one of its sanctioned wrapper modules (confirmed via repo grep:
 * these are the only modules that call dataRoot() directly).
 */
function findDataLayerConsumers(allFiles, fileContentsMap) {
  const consumers = [];
  allFiles.forEach((f) => {
    const ext = path.extname(f).toLowerCase();
    if (!CODE_EXTENSIONS.includes(ext)) return;
    if (DATA_LAYER_FILES_PATTERN.test(f)) return; // the layer itself, not a consumer
    const content = fileContentsMap.get(f) || '';
    if (
      /require\(['"`].*\/(lib\/)?(db|jsonlStore|notesDb|concallNotesStore|orderAnnouncementStore|companyMaster|storageStats)['"`]\)/.test(
        content
      ) ||
      /@stock\/jobs-runtime/.test(content)
    ) {
      consumers.push(f);
    }
  });
  return consumers;
}

/**
 * Check each top-level data/ entry for whether its name/collection is
 * referenced anywhere in data-layer-consumer code (or the data layer files
 * themselves). Anything not recognized is a hanging node.
 *
 * `extraReferenceText` (optional) is the full reachable-code text blob
 * computed by buildReachabilityReport. It exists because not every
 * legitimate consumer of a data/ entry goes through db.js's sanctioned
 * wrapper modules — a confirmed real case: extensions/intraday-deal-filter/
 * popup.js reads/writes data/hft-watchlist.json directly via the Chrome
 * downloads API and the File System Access API, entirely outside the
 * server-side db.js convention. Restricting the reference check to only
 * db.js-consumer code produced a false "hanging node" for that file. Rather
 * than loosen the match itself (still an exact quoted-string regex, same as
 * before), the fix broadens WHICH code is searched to everything reachable
 * from a real entry point, not just files that happen to require db.js.
 */
function analyzeDataDirectory(
  allFiles,
  fileContentsMap,
  dataRoot = 'data',
  extraReferenceText = ''
) {
  const dataEntries = allFiles
    .filter((f) => f.startsWith(dataRoot + '/'))
    .map((f) => f.slice(dataRoot.length + 1).split('/')[0])
    .filter(Boolean);
  const uniqueEntries = Array.from(new Set(dataEntries));

  const layerFiles = allFiles.filter((f) => DATA_LAYER_FILES_PATTERN.test(f));
  const layerText = layerFiles.map((f) => fileContentsMap.get(f) || '').join('\n');
  const consumers = findDataLayerConsumers(allFiles, fileContentsMap);
  const consumerText = consumers.map((f) => fileContentsMap.get(f) || '').join('\n');
  // Markdown prose commonly backslash-escapes underscores outside of
  // backtick code spans (`data/\_reviews/...` instead of `` `data/_reviews` ``
  // — a confirmed real pattern in jobs/Scheduled/weekly-insight-review-
  // stockmarket/SKILL.md). Normalize `\_` back to `_` before matching so
  // this still counts as an exact reference to the real path segment,
  // rather than silently missing it because of markdown escaping syntax
  // that has nothing to do with whether the path is actually referenced.
  const rawCombined = layerText + '\n' + consumerText + '\n' + extraReferenceText;
  const combined = rawCombined.replace(/\\_/g, '_');

  const referenced = [];
  const hangingNodes = [];

  uniqueEntries.forEach((entry) => {
    // Strip common junk suffixes so e.g. `companies.json.corrupt.169...`
    // is checked against the base collection name `companies`.
    const base = entry
      .replace(/\.json.*$/, '')
      .replace(/\.jsonl$/, '')
      .replace(/\.local-conflict.*$/, '')
      .replace(/\.corrupt.*$/, '')
      .replace(/\.tmp\.\d+$/, '')
      .replace(/^events-\d{4}$/, 'events');

    // Known infra dirs the db.js DIRS map manages directly — always alive.
    const KNOWN_INFRA = new Set(['.locks', '_meta', 'assets', 'runs', 'cache', '.cache']);

    if (KNOWN_INFRA.has(entry) || KNOWN_INFRA.has(base)) {
      referenced.push({ entry, reason: 'known-infra-dir (db.js DIRS)' });
      return;
    }

    // Three exact-match shapes, all requiring the literal collection name/
    // filename as a whole path segment — never a bare substring-anywhere
    // scan:
    //  1. Quoted alone in JS: `db.dataRoot('companies')`.
    //  2. Quoted alone with its real extension: `filename: 'hft-watchlist.json'`
    //     (extensions/intraday-deal-filter/popup.js — writes the file by its
    //     literal full filename, not the stripped collection-name form).
    //  3. As a `data/<entry>` path segment in SKILL.md/conventions prose —
    //     either inside a backtick code span (`` `data/agent-outputs/pdfs/...` ``)
    //     or as plain prose with a markdown-escaped underscore
    //     (`data/\_reviews/<date>.md`, normalized to `data/_reviews/...`
    //     above — confirmed real in jobs/Scheduled/weekly-insight-review-
    //     stockmarket/SKILL.md). Both are exact matches of the literal
    //     `data/<entry>` path segment with a real boundary on both sides —
    //     not preceded by a word character (so it isn't matching mid-token
    //     inside some longer unrelated string) and followed by `/`, a quote,
    //     a backtick, whitespace, or end-of-text.
    const escapeRe = (s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const baseRegex = new RegExp(`['"\`]${escapeRe(base)}['"\`]`);
    const fullEntryRegex = new RegExp(`['"\`]${escapeRe(entry)}['"\`]`);
    const dataPathPrefixRegex = new RegExp(
      `(?<![\\w-])${escapeRe(dataRoot)}/${escapeRe(entry)}(?:[/'"\`\\s]|$)`
    );
    const dataPathPrefixBaseRegex = new RegExp(
      `(?<![\\w-])${escapeRe(dataRoot)}/${escapeRe(base)}(?:[/'"\`\\s]|$)`
    );
    if (
      baseRegex.test(combined) ||
      (entry !== base && fullEntryRegex.test(combined)) ||
      dataPathPrefixRegex.test(combined) ||
      (entry !== base && dataPathPrefixBaseRegex.test(combined))
    ) {
      referenced.push({
        entry,
        reason: `collection name '${base}' (or exact filename/path '${entry}') used in reachable code`,
      });
    } else {
      hangingNodes.push({
        entry,
        path: `${dataRoot}/${entry}`,
        reason:
          'No data-layer file (db.js/jsonlStore.js/wrapper) or data-layer consumer references ' +
          `this collection name ('${base}'). Either it's genuinely orphaned scratch/backup data, ` +
          'or something is reading/writing it by a path pattern this scan cannot statically detect ' +
          '(verify manually before deleting).',
      });
    }
  });

  return { referenced, hangingNodes };
}

// ── 6. File-type-aware reference checking for non-code files ────────────────

// A short hardcoded list of known-generic basenames is not enough — the same
// collision happens for any basename reused by convention across unrelated
// directories (every per-ticker extraction folder under tmp/qra_docs/** has
// its own excerpts.json/income_statement_signals.json; every skill/extension
// dir can have manifest.json/SKILL.md/README.md/index.js). A basename-only
// match on any of these produces a false "referenced" verdict for every file
// bearing that name, because ONE of the many same-named files being
// genuinely mentioned elsewhere makes ALL of them look referenced. So this
// is now computed structurally: any basename that occurs at 2+ distinct
// paths anywhere in the full repo walk is "generic" and only counts as
// referenced via an exact full-path match — never basename alone.
function computeGenericBasenames(allFiles) {
  const counts = new Map();
  allFiles.forEach((f) => {
    const base = path.basename(f);
    counts.set(base, (counts.get(base) || 0) + 1);
  });
  const generic = new Set();
  counts.forEach((count, base) => {
    if (count >= 2) generic.add(base);
  });
  return generic;
}

/**
 * For a non-parseable file (pdf, docx, csv, png, etc.), check only whether
 * its path/basename is referenced somewhere in the reachable code graph's
 * text — never open/parse the file's own content.
 *
 * Generic basenames (2+ files repo-wide share the name) require more than a
 * basename match — a bare "filename: 'unified_master.txt'" style reference
 * (real pattern found in screener-api/src/features/research/
 * researchPipelineController.js, which builds the full path at runtime via
 * `path.join(PROMPTS_DIR, filename)` where PROMPTS_DIR is itself
 * `path.join(__dirname, '../prompts/institutional-equity')`) is exact code,
 * not loose searching, but neither the file's full repo-relative path NOR
 * its full containing-directory's repo-relative path is ever spelled out
 * verbatim in source — only the directory's OWN name (the final path
 * segment, e.g. "institutional-equity") appears, as a relative segment in a
 * path.join/require call. Rather than requiring the literal full relative
 * path (which would make this specific real, correct usage unrecognizable,
 * and start silently flagging live code as dead), a generic basename is
 * trusted when EITHER (a) the full relative path appears verbatim, OR (b)
 * the file is the unique file with that basename inside a directory, AND
 * that directory's own final path-segment name (not the full path) also
 * appears verbatim in reachable text, alongside the basename itself — i.e.
 * "this file's containing directory is named + this file's basename is
 * named, in the same reachable file" is still an exact, traceable pair of
 * literal string matches, not a fuzzy guess or partial substring scan.
 */
function isNonCodeFileReferenced(
  relPath,
  reachableTextBlob,
  genericBasenames,
  allFiles,
  reachableCodeTextBlob
) {
  const base = path.basename(relPath);
  if (reachableTextBlob.includes(relPath)) return true;
  if (genericBasenames && genericBasenames.has(base)) {
    if (allFiles) {
      const dir = path.dirname(relPath);
      const dirName = path.basename(dir); // final path segment only — the
      // literal token that actually appears in a relative path.join/require
      // call; the full dir path never does for this pattern.
      const siblingsWithSameBasename = allFiles.filter(
        (f) => path.dirname(f) === dir && path.basename(f) === base
      );
      const isUniqueInItsDir = siblingsWithSameBasename.length === 1;
      // This pairing is modeling a real runtime path.join(dirConstant,
      // filename)/require() construction — which can only occur in CODE, so
      // it must only be searched for in the CODE subset of reachable text,
      // never the full blob (which also includes prose docs/READMEs). A
      // directory named after a common English word (e.g. "frontend") will
      // appear constantly in narrative documentation completely unrelated
      // to any path construction — searching the full blob for that alone
      // was a confirmed false-negative (a stray, otherwise-dead
      // frontend/.env.local was "referenced" purely because the word
      // "frontend" appears ~300 times across README/AGENTS.md prose, and
      // ".env.local" separately appears in .gitignore — neither occurrence
      // has anything to do with reading that specific file).
      const codeBlob = reachableCodeTextBlob != null ? reachableCodeTextBlob : reachableTextBlob;
      if (
        isUniqueInItsDir &&
        dirName &&
        dirName !== '.' &&
        codeBlob.includes(dirName) &&
        codeBlob.includes(base)
      ) {
        return true;
      }
    }
    return false;
  }
  if (reachableTextBlob.includes(base)) return true;
  return false;
}

// ── 7. Top-level orchestration ───────────────────────────────────────────────

/**
 * `excludePaths` (optional, Set<string> of repo-relative paths) lets a
 * caller simulate "what would the report look like if these exact files had
 * already been deleted" without touching disk — used by the idempotency
 * self-check (does a second scan report zero findings once every flagged
 * file from the first scan is actually gone). It filters the real
 * walkAllFiles() output before any other step runs, so every downstream
 * function (root discovery, BFS, reference checks) sees exactly the file set
 * that would exist post-cleanup — this is not a separate code path, it's the
 * same real logic operating on a smaller real file list.
 */
function buildReachabilityReport(rootDir = ROOT_DIR, excludePaths = null) {
  const walked = walkAllFiles(rootDir);
  const filtered = excludePaths ? walked.filter((f) => !excludePaths.has(f)) : walked;
  const allFiles = filtered.filter((f) => !f.startsWith('data/'));
  const dataFiles = filtered.filter((f) => f.startsWith('data/'));

  const fileContentsMap = new Map();
  allFiles.forEach((f) => {
    const ext = path.extname(f).toLowerCase();
    if (PARSEABLE_EXTENSIONS.has(ext) || ext === '.md' || ext === '.html') {
      fileContentsMap.set(f, readFileSafe(path.join(rootDir, f)));
    }
  });

  const { allRoots, uiRoots } = discoverAllEntryRoots(allFiles, fileContentsMap);
  const adjacency = buildAdjacency(allFiles, fileContentsMap);
  const reached = multiRootBfs(allRoots, adjacency);

  // API-to-UI tracing, done as two passes rather than a single per-file
  // "does my own path touch a UI root" check (that first version wrongly
  // flagged server.js/routes.js as dead, since app.use('/x', require(...))
  // wiring has no literal .get/.post call of its own to match against UI
  // fetch calls — the route call lives one level deeper, in the route file).
  //
  // Pass 1: find every reached screener-api file whose OWN content contains
  // a literal Express route registration matched by a UI fetch/axios call
  // (traceApiUsageFromUi, unchanged).
  //
  // Pass 2a (upstream): propagate "alive via UI" backward through the
  // reversed import graph from every Pass-1 file — anything that imports
  // (directly or transitively) a route-verified file is also alive, because
  // it's part of the chain leading to something a UI page actually calls.
  // This is what correctly marks server.js as alive: it doesn't register
  // routes itself, but it requires the route file that does.
  //
  // Pass 2b (downstream): propagate forward through the normal import graph
  // from every Pass-1 file — anything a route-verified file itself imports
  // (its controller, its service layer, etc.) is also alive, since that's
  // the actual handler code the verified route calls into.
  const apiFiles = allFiles.filter((f) => f.startsWith('screener-api/'));
  const reversedAdjacency = new Map(); // file -> Set(files that import it)
  adjacency.forEach((targets, source) => {
    targets.forEach((t) => {
      if (!reversedAdjacency.has(t)) reversedAdjacency.set(t, new Set());
      reversedAdjacency.get(t).add(source);
    });
  });

  const routeVerifiedApiFiles = traceApiUsageFromUi(
    apiFiles,
    uiRoots,
    fileContentsMap,
    adjacency,
    allFiles
  );

  const aliveViaRouteTrace = new Set();
  const propagateOnce = (startSet, graph, visited) => {
    const queue = [...startSet];
    while (queue.length) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      aliveViaRouteTrace.add(current);
      const neighbors = graph.get(current);
      if (!neighbors) continue;
      neighbors.forEach((n) => queue.push(n));
    }
  };
  // Alternate upstream/downstream passes to a fixed point: server.js is only
  // discovered alive via the upstream pass (it imports route-verified files
  // but doesn't itself pass literal route-call text), but server.js in turn
  // requires SIBLING infra (database.js, errorHandler.js, portUtils.js) that
  // a single downstream pass seeded only from the original route files would
  // never reach — those files are downstream of server.js, not of the route
  // file itself. Re-running both directions from the growing alive-set until
  // it stops changing converges on the full connected component.
  let prevSize = -1;
  while (aliveViaRouteTrace.size !== prevSize) {
    prevSize = aliveViaRouteTrace.size;
    const seeds = new Set([...routeVerifiedApiFiles, ...aliveViaRouteTrace]);
    propagateOnce(seeds, reversedAdjacency, new Set());
    propagateOnce(seeds, adjacency, new Set());
  }

  const deadFiles = [];
  const buildOutputUnreachable = [];

  allFiles.forEach((f) => {
    const ext = path.extname(f).toLowerCase();
    const isCode = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.sh'].includes(ext);
    if (!isCode) return; // non-code handled separately below

    // Compiled/generated output — unreachable via source import graphs by
    // definition (nothing requires a build artifact by source path), and
    // "delete this dead code" is the wrong remediation for it: the fix, if
    // any, is in the build step or its source, not the artifact itself.
    // Reported separately so it doesn't pollute the actionable dead-file list.
    if (isBuildOutputPath(f)) {
      buildOutputUnreachable.push({
        file: f,
        reason:
          'Compiled/generated build output, not source — excluded from actionable dead-code list.',
      });
      return;
    }

    const isReached = reached.has(f);
    // Root-level tool config (jest.config.js, etc.) and test files under
    // screener-api/ are runner-invoked, not request-handling application
    // code — the "must trace to a UI page" rule is about business logic
    // reachable from a route, and doesn't apply to them.
    const isRunnerInvoked = isRunnerInvokedConfigPath(f) || /\.(test|spec)\.js$/.test(f);
    const isApi = f.startsWith('screener-api/') && !isRunnerInvoked;

    if (isApi && isReached) {
      const info = reached.get(f);
      const passesThroughUi = info.rootPath.some((p) => uiRoots.has(p));
      if (passesThroughUi || aliveViaRouteTrace.has(f)) {
        return; // alive
      }
      deadFiles.push({
        file: f,
        reason:
          'Reachable from a package.json script / server bootstrap, but no traced path passes ' +
          'through a UI entry point (screener-web/pages/** or an extension), and neither this file ' +
          'nor anything it feeds into contains a route matched by a UI fetch/axios call. Backend ' +
          'API/script code must be referenced from its UI entry point per the reachability rule.',
      });
      return;
    }

    if (!isReached) {
      deadFiles.push({
        file: f,
        reason:
          'Not reachable from any skill, scheduled job, package.json script, or UI entry point.',
      });
    }
  });

  // Non-code files: reference-only check against the text of every reached file.
  //
  // .md/.json used to be blanket-excluded here on the theory that "docs/
  // config are handled by Category A/E" — that was wrong for scratch data:
  // Category A only catches root-level stray JSON/HTML, and Category E only
  // checks .env.example vars; neither one inspects arbitrary .md/.json files
  // sitting in scratch directories like tmp/**, which is exactly where real
  // scratch debris (dated JSON exports, working-notes markdown, ad-hoc JSON
  // state dumps under a scratch subdirectory) lives. (Deliberately not using
  // real example filenames from this repo's own tmp/ here — this scanner
  // reads its own source comments as reachable text, and a real filename
  // mentioned in a comment would make that exact file look "referenced" and
  // silently hide it from this list — the same self-reference class of bug
  // this rebuild exists to fix.)
  //
  // But blanket-INCLUDING every .md was also wrong, the other direction: a
  // human-facing narrative doc (docs/ARCHITECTURE.md, jira/features/*.md, a
  // SKILL.md's own prose) is not "dead" just because no code literally
  // requires it — that's not what markdown documentation is for. Docs are
  // read by people (or by Claude sessions reading them directly), not
  // imported. So: markdown is only reference-checked when it lives under a
  // path that's actually scratch/working-data in nature (tmp/**, any
  // top-level tmp_*/ dir, _to_delete/**, recordings/**) — narrative docs
  // under docs/, jira/, skills/**, and root-level *.md are exempt from this
  // check entirely (skills/**/SKILL.md files are also already roots via
  // discoverStaticPrefixRoots, so they'd never hit this path anyway; this
  // exemption additionally covers narrative *.md siblings next to a SKILL.md
  // and top-level project docs). JSON has no equivalent "narrative" use case
  // in this repo, so it's checked everywhere except runner-invoked configs.
  const SCRATCH_DIR_MD_PREFIXES = ['tmp/', '_to_delete/', 'recordings/', '.scratch_probe/'];
  const isScratchDirPath = (f) =>
    SCRATCH_DIR_MD_PREFIXES.some((p) => f.startsWith(p)) ||
    /^tmp_[^/]*\//.test(f) ||
    /^tmp_[^/]*$/.test(f);

  const reachableTextBlob = Array.from(reached.keys())
    .map((f) => fileContentsMap.get(f) || '')
    .join('\n');
  // Code-only subset of the same reachable text, for the generic-basename
  // dir+base pairing check in isNonCodeFileReferenced — that check models a
  // runtime path.join/require() construction, which can only exist in code,
  // never in prose docs (see the function's own docstring + the comment at
  // its call site below for the confirmed false-positive this prevents).
  const CODE_EXT_SET = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.sh']);
  const reachableCodeTextBlob = Array.from(reached.keys())
    .filter((f) => CODE_EXT_SET.has(path.extname(f).toLowerCase()))
    .map((f) => fileContentsMap.get(f) || '')
    .join('\n');
  const genericBasenames = computeGenericBasenames(allFiles.concat(dataFiles));
  const nonCodeDead = [];
  allFiles.forEach((f) => {
    const ext = path.extname(f).toLowerCase();
    const isCode = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.sh'].includes(ext);
    if (isCode) return;
    // A file already reached via the entry-root BFS (e.g. extensions/*/
    // manifest.json — a UI root in its own right per discoverUiEntryPoints)
    // is alive by definition; it must never additionally be run through the
    // "is my basename/path mentioned somewhere" text check. Missing this
    // check was a real, confirmed bug: manifest.json files that ARE UI
    // entry-point roots were still being flagged dead by the text-reference
    // pass below, which is incoherent — a root can't be unreferenced.
    if (reached.has(f)) return;
    if (isBuildOutputPath(f)) return; // generated output, not actionable dead code
    if (RUNNER_INVOKED_DIR_PREFIXES.some((prefix) => f.startsWith(prefix))) return; // tool config
    if (isRunnerInvokedConfigPath(f)) return; // tool config by basename, scoped to a real root
    if (path.basename(f) === 'package.json') return; // every package.json is a root already
    if (ext === '.md' && !isScratchDirPath(f)) return; // narrative documentation, not dead code
    if (
      !isNonCodeFileReferenced(
        f,
        reachableTextBlob,
        genericBasenames,
        allFiles,
        reachableCodeTextBlob
      )
    ) {
      nonCodeDead.push({
        file: f,
        reason: 'Non-code file path/name not referenced by any reachable code.',
      });
    }
  });

  const dataAnalysis = analyzeDataDirectory(
    dataFiles.concat(allFiles),
    fileContentsMap,
    'data',
    reachableTextBlob
  );

  return {
    stats: {
      totalFiles: allFiles.length + dataFiles.length,
      codeFilesScanned: allFiles.filter((f) =>
        PARSEABLE_EXTENSIONS.has(path.extname(f).toLowerCase())
      ).length,
      entryRootCount: allRoots.size,
      reachedCount: reached.size,
      deadFileCount: deadFiles.length,
      nonCodeDeadCount: nonCodeDead.length,
      buildOutputUnreachableCount: buildOutputUnreachable.length,
      dataHangingNodeCount: dataAnalysis.hangingNodes.length,
    },
    // Full universe of non-data files considered by this scan (superset of
    // deadFiles/nonCodeDead) — exposed so a caller can compute, for any
    // directory, whether EVERY file that actually exists under it (not just
    // the ones already flagged dead) is dead. Needed for folder-level
    // rollup: collapsing "these 40 files are dead" into "this whole folder
    // is dead" is only safe if nothing live is left behind in it.
    allFiles,
    deadFiles,
    nonCodeDead,
    buildOutputUnreachable,
    dataAnalysis,
    aliveViaRouteTrace: Array.from(aliveViaRouteTrace),
    routeVerifiedApiFiles: Array.from(routeVerifiedApiFiles),
  };
}

module.exports = {
  walkAllFiles,
  discoverUiEntryPoints,
  discoverPackageScriptRoots,
  discoverStaticPrefixRoots,
  discoverRunnerInvokedRoots,
  discoverSkillInvokedScriptRoots,
  discoverSkillRegistryRoots,
  discoverAllEntryRoots,
  buildAdjacency,
  multiRootBfs,
  traceApiUsageFromUi,
  computeGenericBasenames,
  analyzeDataDirectory,
  findDataLayerConsumers,
  isNonCodeFileReferenced,
  isBuildOutputPath,
  buildReachabilityReport,
};

if (require.main === module) {
  const report = buildReachabilityReport();
  console.log(JSON.stringify(report, null, 2));
}
