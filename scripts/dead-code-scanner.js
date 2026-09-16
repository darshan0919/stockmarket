const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { execSync } = require('child_process');
const { buildReachabilityReport } = require('./reachability-graph');

const ROOT_DIR = path.resolve(__dirname, '..');
const TASKS_FILE = path.join(ROOT_DIR, 'data', 'tasks.json');
const ACTION_ITEMS_FILE = path.join(ROOT_DIR, 'DEAD_CODE_ACTION_ITEMS.md');

// Non-source artifact extensions that should not be tracked in git unless inside allowed dirs
const STRAY_ARTIFACT_EXTS = new Set([
  '.xlsx',
  '.xls',
  '.pdf',
  '.docx',
  '.pptx',
  '.mp3',
  '.mp4',
  '.wav',
  '.zip',
  '.out',
  '.log',
  // Compiled Python bytecode — never source, always host-specific (the
  // compiler embeds the absolute source path as a string constant, which is
  // also why treating .pyc content as UTF-8 text elsewhere in this scanner
  // was silently misfiring the hardcoded-absolute-path check; see the
  // __pycache__ exclusion in Category B below). Confirmed 8 of these were
  // actually committed to git despite .gitignore having no pyc/__pycache__
  // entry at all.
  '.pyc',
]);

// Path segments where binary/report artifacts legitimately live as fixtures or templates
const ALLOWED_ARTIFACT_DIRS = [
  /\/skills\/[^/]+\/[^/]+\/assets\//,
  /\/skills\/[^/]+\/[^/]+\/references\//,
  /\/docs\//,
  /tools\/tasks\/index\.html/,
];

// .env.example is the source of truth for declared env var names
const ENV_EXAMPLE_FILE = path.join(ROOT_DIR, '.env.example');

/**
 * Gather all git-readable files across the repository:
 * - Git tracked files (git ls-files)
 * - Untracked but not gitignored files (git ls-files --others --exclude-standard)
 * Ignores any transient build/cache directories.
 */
function getGitReadableFiles(rootDir = ROOT_DIR) {
  let tracked = [];
  let untracked = [];
  const gitEnv = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_OPTIONAL_LOCKS: '0',
  };

  try {
    tracked = execSync('git ls-files', { cwd: rootDir, encoding: 'utf-8', env: gitEnv })
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
    })
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch (_e) {
    untracked = [];
  }

  const all = Array.from(new Set([...tracked, ...untracked]));
  const ignoredSegments = [
    'node_modules',
    '.git',
    '.next',
    'dist',
    'build',
    'coverage',
    '.yarn',
    'data',
  ];

  return all.filter((f) => {
    const parts = f.split('/');
    if (ignoredSegments.some((seg) => parts.includes(seg))) return false;
    return fs.existsSync(path.join(rootDir, f));
  });
}

/**
 * Read file content safely without throwing.
 */
function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (_e) {
    return '';
  }
}

/**
 * Collapse per-file dead-code findings into folder-level findings wherever
 * an ENTIRE directory (recursively — every file that actually exists under
 * it, not just the ones already flagged dead) is dead. Recurses upward: a
 * folder of folders that are all-dead collapses into one task at the parent,
 * not one task per child folder.
 *
 * Why this needs `allFiles` (the full universe the scan considered), not
 * just the dead set: collapsing "40 files under foo/ are dead" into
 * "foo/ is dead" is only correct if NOTHING live is left inside foo/. A
 * directory containing even one reachable file must never be rolled up —
 * its dead siblings stay as individual findings.
 *
 * @param {Set<string>} deadSet - relative paths flagged dead in this pass
 *   (e.g. reachability.deadFiles mapped to their `.file`).
 * @param {string[]} allFiles - every non-data file the scan considered,
 *   dead or alive (reachability.allFiles) — the ground truth for "does this
 *   directory have any live file in it".
 * @returns {{ folders: Array<{dir: string, files: string[], sampleReason: string}>, remaining: string[] }}
 *   `folders` is the rolled-up findings (deepest-first collapse, already
 *   deduped against nested collapsed folders); `remaining` is every dead
 *   file whose directory could NOT be fully collapsed (some live sibling
 *   exists somewhere under that directory), to be reported individually.
 */
function rollUpDeadFolders(deadSet, allFiles) {
  if (deadSet.size === 0) return { folders: [], remaining: [] };

  // Build: every directory (at every depth) -> the full list of files that
  // actually exist under it, recursively. E.g. for 'a/b/c.js', this credits
  // 'a', 'a/b' each with 'a/b/c.js'.
  const dirToAllFiles = new Map();
  allFiles.forEach((f) => {
    const parts = f.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (!dirToAllFiles.has(dir)) dirToAllFiles.set(dir, []);
      dirToAllFiles.get(dir).push(f);
    }
  });

  // A directory is fully dead iff every file that exists under it
  // (recursively) is in deadSet. Check deepest-first so a parent can be
  // recognized as fully dead once its dead children are already known
  // (though the direct "every file under dir is in deadSet" check already
  // handles this without needing child results explicitly).
  const dirsByDepthDesc = Array.from(dirToAllFiles.keys()).sort(
    (a, b) => b.split('/').length - a.split('/').length
  );

  const fullyDeadDirs = new Set();
  dirsByDepthDesc.forEach((dir) => {
    const filesUnder = dirToAllFiles.get(dir);
    if (filesUnder.length > 0 && filesUnder.every((f) => deadSet.has(f))) {
      fullyDeadDirs.add(dir);
    }
  });

  // Collapse to the SHALLOWEST fully-dead directory on each branch — if
  // both 'a/b' and 'a/b/c' are fully dead, report just 'a/b' (which already
  // recursively covers 'a/b/c'), not both.
  const topLevelDeadDirs = Array.from(fullyDeadDirs).filter((dir) => {
    const parts = dir.split('/');
    for (let i = 1; i < parts.length; i++) {
      if (fullyDeadDirs.has(parts.slice(0, i).join('/'))) return false; // an ancestor already covers it
    }
    return true;
  });

  const coveredFiles = new Set();
  const folders = topLevelDeadDirs
    .map((dir) => {
      const files = dirToAllFiles.get(dir).slice().sort();
      files.forEach((f) => coveredFiles.add(f));
      return { dir, files, sampleReason: `all ${files.length} files under this folder are unreferenced.` };
    })
    // Report the biggest folders first — most actionable at a glance.
    .sort((a, b) => b.files.length - a.files.length);

  const remaining = Array.from(deadSet)
    .filter((f) => !coveredFiles.has(f))
    .sort();

  return { folders, remaining };
}

function runDeadCodeScanner() {
  console.log('🔍 Starting Monorepo Dead Code & Coding Practice Scanner...');
  const timestamp = new Date().toISOString();

  // 1. Gather all git-readable files
  const allRepoFiles = getGitReadableFiles();

  // 2. Read contents of all files
  const fileContentsMap = new Map();
  let combinedCodebaseTextWithoutHeaders = '';

  // This scanner's OWN generated report is git-tracked, so on every run
  // after the first, the report sitting on disk already contains the prior
  // run's findings — every flagged filename, dependency name, and env-var
  // name, spelled out in prose. Feeding that into any text blob this
  // scanner later greps for "is X referenced anywhere" is a self-laundering
  // bug: a finding reported once becomes permanently invisible on every
  // subsequent run, because the report ABOUT it now counts as a "reference"
  // to it. Confirmed real 2026-09-16 (an env-var finding was wrongly
  // cleared this exact way — DO NOT name that variable literally in a
  // comment here, that recreates the same bug one level up, which is
  // exactly what happened the first time this comment was written).
  // Excluded below from fileContentsMap/combinedCodebaseTextWithoutHeaders
  // entirely — nothing in this scanner should ever treat its own report
  // (or, by the same logic, this very file's comments) as source to scan.
  const SELF_REPORT_FILE = 'DEAD_CODE_ACTION_ITEMS.md';

  allRepoFiles.forEach((file) => {
    if (file === SELF_REPORT_FILE) return;
    const full = path.join(ROOT_DIR, file);
    const content = readFileSafe(full);
    fileContentsMap.set(file, content);
    combinedCodebaseTextWithoutHeaders += '\n' + content;
  });

  const actionItems = [];

  // --- Category A: Committed Stray Artifacts & Scratch Data ---
  allRepoFiles.forEach((relPath) => {
    const ext = path.extname(relPath).toLowerCase();
    const base = path.basename(relPath);

    if (ALLOWED_ARTIFACT_DIRS.some((re) => re.test(relPath))) return;

    if (STRAY_ARTIFACT_EXTS.has(ext)) {
      actionItems.push({
        category: 'Committed Stray Artifact',
        title: `Remove committed artifact/binary ${relPath}`,
        file: relPath,
        detail: `File '${relPath}' is a generated artifact, media file, or build binary (${ext}) committed to git. Per docs/DATA_RULES.md, generated artifacts belong in data/assets/ or data/runs/ and must not be tracked in git.`,
        action: `[REMOVE FROM GIT] git rm --cached ${relPath}`,
        priority: 'High',
      });
      return;
    }

    // Root-level transient session payloads
    if (
      !relPath.includes('/') &&
      (base.endsWith('.jsonl') ||
        base.endsWith('.html') ||
        (base.endsWith('.json') && !['package.json', 'skills-lock.json'].includes(base)))
    ) {
      actionItems.push({
        category: 'Committed Stray Artifact',
        title: `Remove committed root session data ${relPath}`,
        file: relPath,
        detail: `File '${relPath}' is a scratch JSON/HTML payload left at the repository root. Per clean code standards, remove or relocate into data/runs/ or data/assets/.`,
        action: `[REMOVE FROM GIT] git rm --cached ${relPath}`,
        priority: 'High',
      });
    }
  });

  // --- Category B: Hardcoded Local Paths (Coding Standards Violation) ---
  const hardcodedPathRegex = /\/Users\/[a-zA-Z0-9_.]+\/code\/[a-zA-Z0-9_.-]+/g;
  fileContentsMap.forEach((content, relPath) => {
    if (
      relPath === 'scripts/dead-code-scanner.js' ||
      relPath.endsWith('implementation_plan.md') ||
      relPath === 'DEAD_CODE_ACTION_ITEMS.md' ||
      // Compiled bytecode, not source — readFileSafe reads it as UTF-8 text
      // like everything else, which turns the compiler-embedded absolute
      // source path (baked into every .pyc) into a false "hardcoded path"
      // finding. The real, correct fix for a committed .pyc is Category A's
      // [REMOVE FROM GIT] (via STRAY_ARTIFACT_EXTS above) — "refactor the
      // hardcoded path" is meaningless for a binary nothing hand-edits.
      relPath.split('/').includes('__pycache__') ||
      path.extname(relPath) === '.pyc'
    )
      return;
    const matches = content.match(hardcodedPathRegex);
    if (matches && matches.length > 0) {
      const uniqueMatches = Array.from(new Set(matches));
      actionItems.push({
        category: 'Coding Standard Violation',
        title: `Refactor hardcoded user absolute path in ${relPath}`,
        file: relPath,
        detail: `Hardcoded path(s) found: ${uniqueMatches.slice(0, 2).join(', ')}. Use process.cwd(), relative paths, or environment variables instead.`,
        action: `[REFACTOR] Replace static absolute paths in ${relPath}`,
        priority: 'High',
      });
    }
  });

  // --- Category C: Unused Workspace Package Dependencies ---
  const packageJsonFiles = allRepoFiles.filter((f) => path.basename(f) === 'package.json');
  packageJsonFiles.forEach((pkgFile) => {
    try {
      const pkgJson = JSON.parse(fileContentsMap.get(pkgFile) || '{}');
      const deps = { ...(pkgJson.dependencies || {}), ...(pkgJson.devDependencies || {}) };
      const ignoredDeps = [
        'concurrently',
        'nodemon',
        'jest',
        'prettier',
        'eslint',
        'esbuild',
        'next',
        'react',
        'react-dom',
        'tailwindcss',
        'autoprefixer',
        'postcss',
        'daisyui',
        '@types/jest',
        'supertest',
        'jest-environment-jsdom',
        '@testing-library/dom',
        '@testing-library/jest-dom',
        '@testing-library/react',
        '@testing-library/user-event',
        '@duckdb/node-api',
        'eslint-config-prettier',
        'eslint-plugin-react',
      ];

      Object.keys(deps).forEach((depName) => {
        if (ignoredDeps.includes(depName) || depName.startsWith('workspace:')) return;

        // Check if depName is required or imported anywhere in the monorepo
        const importRegex = new RegExp(`['"\`]${depName}(?:/[^'"]*)?['"\`]`, 'i');
        if (!importRegex.test(combinedCodebaseTextWithoutHeaders)) {
          actionItems.push({
            category: 'Unused Dependency',
            title: `Remove unused dependency '${depName}' in ${path.dirname(pkgFile)}`,
            file: pkgFile,
            detail: `Dependency '${depName}' listed in ${pkgFile} is not imported or required anywhere in active code, jobs, or skills.`,
            action: `[REMOVE DEPENDENCY] ${depName} from ${pkgFile}`,
            priority: 'Medium',
          });
        }
      });
    } catch (_e) {
      // Ignore JSON parse errors
    }
  });

  // --- Category D: Unreferenced Source Files (Full-Repo Reachability Graph) ---
  // Rebuilt on scripts/reachability-graph.js: a real BFS over the import/
  // require graph rooted at the four sanctioned entry-point categories
  // (skills/**, jobs/Scheduled/**, package.json scripts, UI entry points —
  // screener-web/pages/**, browser-extension manifests, standalone
  // dashboards), rather than the previous "does this string appear anywhere"
  // regex heuristic. Backend API/library code under screener-api/** must
  // additionally trace to a UI entry point specifically (mount-prefix ->
  // frontend api-client call matching), not just be wired into server.js.
  // See scripts/reachability-graph.js for full design notes.
  const reachability = buildReachabilityReport(ROOT_DIR);

  const deadFileSet = new Set(reachability.deadFiles.map((d) => d.file));
  const deadFileRollup = rollUpDeadFolders(deadFileSet, reachability.allFiles);
  deadFileRollup.folders.forEach(({ dir, files, sampleReason }) => {
    actionItems.push({
      category: 'Unused File',
      title: `Investigate unreferenced folder ${dir}/ (${files.length} files, all unreferenced)`,
      file: dir,
      detail:
        `Every file that exists under ${dir}/ (recursively, ${files.length} total) is ` +
        `unreachable from any entry root. Representative reason: ${sampleReason} ` +
        `Full file list: ${files.join(', ')}`,
      action: `[DELETE] ${dir}/`,
      priority: 'High',
      isFolder: true,
      fileCount: files.length,
    });
  });
  deadFileRollup.remaining.forEach((relPath) => {
    const reason = reachability.deadFiles.find((d) => d.file === relPath)?.reason;
    actionItems.push({
      category: 'Unused File',
      title: `Investigate unreferenced source file ${path.basename(relPath)}`,
      file: relPath,
      detail: reason,
      action: `[DELETE] ${relPath}`,
      priority: 'High',
    });
  });

  const nonCodeDeadSet = new Set(reachability.nonCodeDead.map((d) => d.file));
  const nonCodeRollup = rollUpDeadFolders(nonCodeDeadSet, reachability.allFiles);
  nonCodeRollup.folders.forEach(({ dir, files }) => {
    actionItems.push({
      category: 'Unreferenced Non-Code File',
      title: `Investigate unreferenced folder ${dir}/ (${files.length} files, all unreferenced)`,
      file: dir,
      detail:
        `Every file that exists under ${dir}/ (recursively, ${files.length} total) is not ` +
        `referenced by any reachable code. Full file list: ${files.join(', ')}`,
      action: `[VERIFY] ${dir}/ — confirm unused, then delete or relocate`,
      priority: 'Low',
      isFolder: true,
      fileCount: files.length,
    });
  });
  nonCodeRollup.remaining.forEach((relPath) => {
    const reason = reachability.nonCodeDead.find((d) => d.file === relPath)?.reason;
    actionItems.push({
      category: 'Unreferenced Non-Code File',
      title: `Investigate unreferenced file ${path.basename(relPath)}`,
      file: relPath,
      detail: reason,
      action: `[VERIFY] ${relPath} — confirm unused, then delete or relocate`,
      priority: 'Low',
    });
  });

  reachability.dataAnalysis.hangingNodes.forEach(({ entry, path: dataPath, reason }) => {
    actionItems.push({
      category: 'Data Directory Hanging Node',
      title: `Verify data/${entry} is actually orphaned`,
      file: dataPath,
      detail: reason,
      action: `[VERIFY] ${dataPath} — no data-layer code references this collection name`,
      priority: 'Medium',
    });
  });

  // --- Category E: Env vars declared in .env.example but only used by tests ---
  // Real-world case this catches: a `.env.example`/`.env` var whose only
  // literal appearance anywhere in the repo is in a *.test.js/*.spec.js file
  // (or nowhere at all) — i.e. something a test asserts about but production
  // code never actually reads, per "if something is only used by tests then
  // it's not really needed."
  const envExampleContent = readFileSafe(ENV_EXAMPLE_FILE);
  const declaredEnvVars = new Set(
    Array.from(envExampleContent.matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]{3,})=/gm)).map((m) => m[1])
  );
  declaredEnvVars.forEach((varName) => {
    // Skip dynamic env prefixes known to be loaded via template strings in production code
    if (varName.startsWith('LEARNYST_')) return;

    let usedInRealSource = false;
    let usedInTestOnly = false;
    fileContentsMap.forEach((content, relPath) => {
      if (
        relPath === '.env.example' ||
        relPath === '.env' ||
        // Self-reference bug, confirmed 2026-09-16: DEAD_CODE_ACTION_ITEMS.md
        // is git-tracked, so a var this exact check flagged last run gets
        // written into the report, which is then read back into
        // fileContentsMap THIS run and counts as a "real source" reference —
        // permanently laundering every finding into a false negative after
        // its first appearance. Same class of bug Category B already guards
        // against for the hardcoded-path check; applies here too.
        relPath === 'DEAD_CODE_ACTION_ITEMS.md'
      )
        return;
      const isTestFile = /\.(test|spec)\.js$/i.test(relPath);
      const re = new RegExp(`\\b${varName}\\b`);
      if (!re.test(content)) return;
      if (isTestFile) usedInTestOnly = true;
      else usedInRealSource = true;
    });
    if (!usedInRealSource) {
      actionItems.push({
        category: 'Env Var Unused Outside Tests',
        title: `Verify whether ${varName} is actually needed`,
        file: '.env.example',
        detail:
          `'${varName}' is declared in .env.example but the literal name never appears in ` +
          `any non-test source file${usedInTestOnly ? ' — only in a *.test.js/*.spec.js file' : ''}. ` +
          'It may be genuinely unused, OR it may be read via a dynamically-built name ' +
          '(e.g. `` `PREFIX_${key}_SUFFIX` ``) that a literal grep cannot see — verify before ' +
          'removing it from .env/.env.example and any test that references it.',
        action: `[VERIFY] ${varName} usage, then remove from .env/.env.example if genuinely unused`,
        priority: 'Low',
      });
    }
  });

  console.log(`\nFound ${actionItems.length} dead code & coding practice action item(s).`);

  // --- Update data/tasks.json ---
  updateTasksJson(actionItems, timestamp);

  // --- Generate DEAD_CODE_ACTION_ITEMS.md ---
  generateMarkdownReport(actionItems, timestamp);

  console.log('✅ Dead Code Scanner completed successfully.');
}

// Action-item verbs that mean "this finding is a structural fact, not a
// judgment call" — a file genuinely has zero incoming references, so the
// fix (delete it / untrack it / drop the dependency) is mechanical. Still
// worth a human's eyes before it's gone for good, but the classifier itself
// isn't guessing.
const STRUCTURAL_ACTION_PREFIXES = ['[DELETE]', '[REMOVE FROM GIT]', '[REMOVE DEPENDENCY]'];

// Categories the reachability model itself calls out as needing a second,
// human pass rather than a mechanical yes/no — see reachability-graph.js's
// own module docstring and jobs/Scheduled/periodic-dead-code-scan/SKILL.md
// step 4 ("every finding ... needs a human look"). These are exactly the
// categories where an exact-string-match miss is most plausible: a
// non-code file might be read by a path pattern no static scan can see
// (dynamic string building, a runtime fetch, a third-party tool convention),
// and a data/ hanging node might be written by client-side/extension code
// this repo's own reachability graph doesn't trace into.
const DICEY_CATEGORIES = new Set([
  'Unreferenced Non-Code File',
  'Data Directory Hanging Node',
  'Env Var Unused Outside Tests',
  'Coding Standard Violation', // [REFACTOR] — not just delete-if-unreferenced, requires actually rewriting call sites correctly
]);

/**
 * Every subtask carries a `note` explaining how much to trust it — this is
 * the guardrail against blindly auto-completing a whole day's findings.
 * `[VERIFY]`/`[REFACTOR]` actions and the categories in DICEY_CATEGORIES
 * always get the strongest caution regardless of priority, since those are
 * exactly the shapes of finding this scanner's own design notes flag as
 * "reference-only text search, can't see dynamic path construction or
 * external-tool consumption" (e.g. the hft-watchlist.json / Chrome-extension
 * false positive this reachability model produced and had to be fixed for —
 * a real historical example that this note exists specifically to prevent
 * from recurring unnoticed for a *different* file).
 */
function deriveReviewNote(item) {
  const isStructural = STRUCTURAL_ACTION_PREFIXES.some((p) => item.action.startsWith(p));
  const isDicey = DICEY_CATEGORIES.has(item.category) || !isStructural;

  if (isDicey) {
    return (
      'Do not mark this complete without a manual check. This category ' +
      `("${item.category}") is a judgment call, not a mechanical fact — ` +
      'the scanner can only see exact string/path references, so it can miss ' +
      'a file read via a dynamically-built path, a browser-extension/client-side ' +
      'consumer, or a third-party tool convention. Verify by hand (or ask Darshan) ' +
      'before completing; if genuinely unsure, leave it pending and flag it for ' +
      'Darshan\'s review rather than guessing.'
    );
  }
  return (
    'Reasonably high-confidence structural finding (zero traced references ' +
    'anywhere in the reachable code graph) — still worth a quick human glance ' +
    'before deleting, since this reachability model is new and unproven at scale, ' +
    'but not a category known to produce false positives the way the [VERIFY] ' +
    'categories are.'
  );
}

/**
 * Write findings as ONE parent task per scan run, with every individual
 * finding as a native subtask (data/tasks.json already supports
 * `subtasks: [{id, title, completed, createdAt, updatedAt}]` — see e.g. the
 * "Performance & Scaling" and "Master of ONE" tasks). Previously this wrote
 * one flat top-level task per finding ("Dead Code: <title>"), which no
 * longer matches how the task board is used now that subtasks exist.
 *
 * The parent is keyed by calendar date (UTC), so re-running the scanner
 * multiple times on the same day upserts the same parent + subtask set
 * (matching finding titles keep their id/completed/createdAt; a finding
 * that's no longer present gets its subtask marked completed rather than
 * deleted, same "close it out, don't erase history" behavior as before).
 * A new day's run creates a fresh parent task, since a stale week-old
 * "Dead Code" task silently accumulating unrelated findings across
 * unrelated weekly runs would be confusing to review.
 *
 * Every subtask carries a `note` (see deriveReviewNote) spelling out how
 * much to trust that specific finding — this is what lets a human (or an
 * agent doing the review pass) tell "safe to batch-complete" apart from
 * "needs an actual manual check" per-item, rather than treating the whole
 * day's findings as uniformly trustworthy.
 *
 * IMPORTANT: this function only WRITES the tasks — it never marks anything
 * complete or attempts a fix itself; that judgment call (auto-completing a
 * high-confidence structural finding vs. leaving a dicey one pending with a
 * categorical blocker analysis) belongs to the agent executing the
 * periodic-dead-code-scan job, per its SKILL.md, not to this deterministic
 * script. Whatever this function writes as `completed: false` is exactly
 * what still needs that judgment applied — this script's output is the
 * INPUT to that step, never a substitute for it.
 */
function updateTasksJson(actionItems, timestamp) {
  let tasksData = { version: 1, tasks: [] };
  if (fs.existsSync(TASKS_FILE)) {
    try {
      tasksData = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
    } catch (_e) {
      tasksData = { version: 1, tasks: [] };
    }
  }

  const existingTasks = tasksData.tasks || [];
  const dateStamp = timestamp.slice(0, 10); // YYYY-MM-DD
  const parentTitle = `Dead Code: ${dateStamp} scan`;

  const otherTasks = existingTasks.filter((t) => t.title !== parentTitle);
  const existingParent = existingTasks.find((t) => t.title === parentTitle);
  const existingSubtaskMap = new Map(
    (existingParent?.subtasks || []).map((st) => [st.title, st])
  );

  const activeSubtaskTitles = new Set();
  const newSubtasks = actionItems.map((item) => {
    activeSubtaskTitles.add(item.title);
    const note = deriveReviewNote(item);
    const existing = existingSubtaskMap.get(item.title);
    if (existing) {
      // Refresh the note every run (not just on first creation) so a
      // classification-logic change (e.g. a category moving in/out of
      // DICEY_CATEGORIES) is reflected on re-run, not frozen at whatever it
      // said the day the subtask was first created.
      return { ...existing, completed: false, updatedAt: timestamp, note };
    }
    return {
      id: crypto.randomUUID(),
      title: item.title,
      completed: false,
      note,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });

  // Subtasks from a prior same-day run that are no longer flagged this run
  // (fixed, or the finding no longer applies) — close them out, keep history.
  (existingParent?.subtasks || []).forEach((st) => {
    if (!activeSubtaskTitles.has(st.title)) {
      newSubtasks.push({ ...st, completed: true, updatedAt: timestamp });
    }
  });

  const parentTask = {
    id: existingParent?.id || crypto.randomUUID(),
    title: parentTitle,
    completed: false,
    subtasks: newSubtasks,
    createdAt: existingParent?.createdAt || timestamp,
    updatedAt: timestamp,
  };

  tasksData.tasks = [...otherTasks, parentTask];

  // Ensure data directory exists
  const dataDir = path.dirname(TASKS_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasksData, null, 2));
  console.log(
    `📝 Updated data/tasks.json — parent task "${parentTitle}" with ${newSubtasks.length} subtask(s).`
  );
}

function generateMarkdownReport(actionItems, timestamp) {
  const summaryByCategory = {};
  actionItems.forEach((item) => {
    summaryByCategory[item.category] = (summaryByCategory[item.category] || 0) + 1;
  });

  let md = `# Dead Code & Coding Practice Action Items

> **Last Updated:** ${timestamp}
> **Status:** Automated Scan Completed
> **Active Action Items:** ${actionItems.length}

---

## 📊 Summary Breakdown

| Category | Flagged Items | Priority |
| :--- | :---: | :---: |
`;

  Object.entries(summaryByCategory).forEach(([category, count]) => {
    md += `| **${category}** | ${count} | High/Medium |\n`;
  });

  // Whole-directory findings (rollUpDeadFolders results, tagged isFolder)
  // pulled out into their own top-of-report table, sorted by file count
  // descending. Without this, a large dead directory (recordings/ at 19
  // files, tmp/ subtrees, etc.) is just one line indistinguishable from a
  // single stray file, buried wherever discovery order happened to put it
  // among 200+ items — a human (or an agent) skimming the numbered list can
  // easily miss that the biggest, most worth-deleting things are already in
  // there. This table exists specifically so "what's the single biggest
  // thing I should look at" never requires reading the whole report.
  const folderFindings = actionItems.filter((item) => item.isFolder);
  if (folderFindings.length > 0) {
    md += `\n## 🗂️ Whole-Directory Findings (sorted by file count — check these first)\n\n`;
    md += `| Directory | Files | Category | Action |\n`;
    md += `| :--- | :---: | :--- | :--- |\n`;
    folderFindings
      .slice()
      .sort((a, b) => b.fileCount - a.fileCount)
      .forEach((item) => {
        md += `| \`${item.file}/\` | ${item.fileCount} | ${item.category} | \`${item.action}\` |\n`;
      });
  }

  if (actionItems.length === 0) {
    md += `\n✨ **No dead code or coding practice violations found across the monorepo!**\n`;
  } else {
    md += `\n---

## 📋 Action Items List

The following items were identified by analyzing scheduled jobs, skills, workspace APIs, and frontend applications. Corresponding entries have also been synchronized to [\`data/tasks.json\`](file://${TASKS_FILE}).

`;

    actionItems.forEach((item, idx) => {
      md += `### ${idx + 1}. [${item.priority}] ${item.title}
- **Category:** ${item.category}
- **Target File:** [\`${item.file}\`](file://${path.join(ROOT_DIR, item.file)})
- **Details:** ${item.detail}
- **Recommended Action:** \`${item.action}\`

`;
    });
  }

  fs.writeFileSync(ACTION_ITEMS_FILE, md);
  console.log(`📄 Generated markdown report at ${ACTION_ITEMS_FILE}`);
}

if (require.main === module) {
  runDeadCodeScanner();
}

module.exports = {
  getGitReadableFiles,
  rollUpDeadFolders,
  runDeadCodeScanner,
};
