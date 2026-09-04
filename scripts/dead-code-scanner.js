const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { execSync } = require('child_process');

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
 * Discover all live entrypoint roots in the monorepo:
 * - package.json scripts (workspace and root)
 * - scheduled tasks (jobs/Scheduled/**)
 * - skills (skills/**)
 * - application servers, routing pages, configs, and test suites
 */
function discoverSystemRoots(files, fileContentsMap, rootDir = ROOT_DIR) {
  const roots = new Set();

  // 1. package.json scripts
  const pkgFiles = files.filter((f) => path.basename(f) === 'package.json');
  for (const pkgFile of pkgFiles) {
    try {
      const content = fileContentsMap.get(pkgFile) || readFileSafe(path.join(rootDir, pkgFile));
      const data = JSON.parse(content || '{}');
      const scripts = Object.values(data.scripts || {});
      for (const s of scripts) {
        const tokens = s.split(/\s+/);
        tokens.forEach((tok) => {
          tok = tok.replace(/["';]/g, '');
          if (
            tok.endsWith('.js') ||
            tok.endsWith('.ts') ||
            tok.endsWith('.py') ||
            tok.endsWith('.sh')
          ) {
            const direct = tok.startsWith('./') ? tok.slice(2) : tok;
            const fromPkgDir = path.join(path.dirname(pkgFile), direct);
            if (files.includes(direct)) roots.add(direct);
            if (files.includes(fromPkgDir)) roots.add(fromPkgDir);
          }
        });
      }
    } catch (_e) {
      // Ignore invalid JSON in non-critical configs
    }
  }

  // 2. Scheduled jobs, skills, frameworks, tests, configs
  files.forEach((f) => {
    const base = path.basename(f);
    if (
      f.startsWith('jobs/Scheduled/') ||
      f.startsWith('skills/') ||
      base === 'server.js' ||
      base === 'main.js' ||
      base === 'index.js' ||
      base.endsWith('.test.js') ||
      base.endsWith('.spec.js') ||
      base === 'next.config.js' ||
      base === 'tailwind.config.js' ||
      base === 'postcss.config.js' ||
      base === '.eslintrc.js' ||
      base === '.prettierrc' ||
      base === 'package.json' ||
      base === 'README.md' ||
      base === 'AGENTS.md' ||
      base === 'CLAUDE.md' ||
      f.includes('pages/') ||
      f.includes('app/')
    ) {
      roots.add(f);
    }
  });

  return roots;
}

/**
 * Check if a target file is referenced anywhere in other codebase files.
 * Checks exact relative path, basename, directory suffix, and identifier matches.
 * Does NOT suffer from delimiter header self-reference bug.
 */
function checkExternalReferences(targetRelPath, fileContentsMap) {
  const base = path.basename(targetRelPath);
  const ext = path.extname(targetRelPath);
  const nameNoExt = path.basename(targetRelPath, ext);

  // Exact relative path (e.g. 'scripts/dead-code-scanner.js')
  const escapedRel = targetRelPath.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const relRegex = new RegExp(`['"\`]${escapedRel}['"\`]`);

  // Base name with extension (e.g. 'dead-code-scanner.js')
  const escapedBase = base.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const baseRegex = new RegExp(`['"\`]${escapedBase}['"\`]`);

  // Subpath suffixes for imports (e.g. '../src/core/lib/api' -> 'core/lib/api' or 'lib/api')
  const parts = targetRelPath.split('/');
  const subPathSuffixes = [];
  if (parts.length >= 2) {
    const last2 = parts
      .slice(-2)
      .join('/')
      .replace(new RegExp(`${ext}$`), '');
    subPathSuffixes.push(
      new RegExp(
        `['"\`](\\.\\.?/)*${last2.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(\\${ext})?['"\`]`
      )
    );
  }
  if (parts.length >= 3) {
    const last3 = parts
      .slice(-3)
      .join('/')
      .replace(new RegExp(`${ext}$`), '');
    subPathSuffixes.push(
      new RegExp(
        `['"\`](\\.\\.?/)*${last3.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(\\${ext})?['"\`]`
      )
    );
  }

  // Identifier regex (\bfileNameNoExt\b) - require length >= 4 to prevent trivial false positives
  const idRegex =
    nameNoExt.length >= 4
      ? new RegExp(`\\b${nameNoExt.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`)
      : null;

  const referringFiles = [];
  for (const [otherPath, content] of fileContentsMap.entries()) {
    if (otherPath === targetRelPath) continue;
    // Skip generated reports or task tracker files from being counted as valid references
    if (otherPath === 'data/tasks.json' || otherPath === 'DEAD_CODE_ACTION_ITEMS.md') continue;

    let matched = relRegex.test(content) || baseRegex.test(content);
    if (!matched) {
      for (const sp of subPathSuffixes) {
        if (sp.test(content)) {
          matched = true;
          break;
        }
      }
    }
    if (!matched && idRegex && idRegex.test(content)) {
      matched = true;
    }

    if (matched) {
      referringFiles.push(otherPath);
    }
  }

  return referringFiles;
}

function runDeadCodeScanner() {
  console.log('🔍 Starting Monorepo Dead Code & Coding Practice Scanner...');
  const timestamp = new Date().toISOString();

  // 1. Gather all git-readable files
  const allRepoFiles = getGitReadableFiles();

  // 2. Read contents of all files
  const fileContentsMap = new Map();
  let combinedCodebaseTextWithoutHeaders = '';

  allRepoFiles.forEach((file) => {
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
      relPath === 'DEAD_CODE_ACTION_ITEMS.md'
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

  // --- Category D: Unreferenced Source Files (Holistic Dependency-Chain Scan) ---
  const systemRoots = discoverSystemRoots(allRepoFiles, fileContentsMap);

  allRepoFiles.forEach((relPath) => {
    const ext = path.extname(relPath).toLowerCase();
    const baseName = path.basename(relPath);

    // Only inspect executable/source code files
    if (!['.js', '.jsx', '.ts', '.tsx', '.py', '.sh'].includes(ext)) return;

    // Skip legitimate system roots
    if (systemRoots.has(relPath)) return;

    // Check external references across the repository
    const externalRefs = checkExternalReferences(relPath, fileContentsMap);

    if (externalRefs.length === 0) {
      actionItems.push({
        category: 'Unused File',
        title: `Investigate unreferenced source file ${baseName}`,
        file: relPath,
        detail: `Source file '${relPath}' has zero incoming references and is not reachable from any package.json script, scheduled job, skill, application entrypoint, or test suite.`,
        action: `[DELETE] ${relPath}`,
        priority: 'High',
      });
    }
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
      if (relPath === '.env.example' || relPath === '.env') return;
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
  const existingMap = new Map();

  existingTasks.forEach((task) => {
    existingMap.set(task.title, task);
  });

  const updatedTasks = [];
  const activeDeadCodeTitles = new Set();

  // Preserve existing non-Dead Code tasks
  existingTasks.forEach((task) => {
    if (!task.title.startsWith('Dead Code:')) {
      updatedTasks.push(task);
    }
  });

  // Add or preserve Dead Code tasks
  actionItems.forEach((item) => {
    const taskTitle = `Dead Code: ${item.title}`;
    activeDeadCodeTitles.add(taskTitle);

    if (existingMap.has(taskTitle)) {
      const existing = existingMap.get(taskTitle);
      updatedTasks.push({
        ...existing,
        updatedAt: timestamp,
      });
    } else {
      updatedTasks.push({
        id: crypto.randomUUID(),
        title: taskTitle,
        completed: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  });

  // Retain previously existing Dead Code tasks that are no longer active, marking them as completed: true
  existingTasks.forEach((task) => {
    if (task.title.startsWith('Dead Code:') && !activeDeadCodeTitles.has(task.title)) {
      updatedTasks.push({
        ...task,
        completed: true,
        updatedAt: timestamp,
      });
    }
  });

  tasksData.tasks = updatedTasks;

  // Ensure data directory exists
  const dataDir = path.dirname(TASKS_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasksData, null, 2));
  console.log(`📝 Updated data/tasks.json (${updatedTasks.length} total tasks registered).`);
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
  discoverSystemRoots,
  checkExternalReferences,
  runDeadCodeScanner,
};
