const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const TASKS_FILE = path.join(ROOT_DIR, 'data', 'tasks.json');
const ACTION_ITEMS_FILE = path.join(ROOT_DIR, 'DEAD_CODE_ACTION_ITEMS.md');

// Directories to scan
const WORKSPACES = [
  'screener-api',
  'screener-web',
  'stock-api',
  'cloud-utils',
  'jobs',
  'packages/jobs-runtime',
  'backend',
  'frontend',
  'scripts',
  'tools',
  'skills',
];

// File extensions to analyze
const ANALYZED_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.py', '.sh'];

// Helper to recursively collect files
function getAllFiles(dirPath, arrayOfFiles = []) {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (
      file === 'node_modules' ||
      file === '.git' ||
      file === '.next' ||
      file === 'dist' ||
      file === 'build' ||
      file === 'coverage' ||
      file === '.yarn'
    ) {
      return;
    }

    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else {
      const ext = path.extname(file).toLowerCase();
      if (ANALYZED_EXTENSIONS.includes(ext) || file === 'package.json') {
        arrayOfFiles.push(fullPath);
      }
    }
  });

  return arrayOfFiles;
}

// Read file content safely
function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (_e) {
    return '';
  }
}

function runDeadCodeScanner() {
  console.log('🔍 Starting Monorepo Dead Code & Coding Practice Scanner...');
  const timestamp = new Date().toISOString();

  // 1. Gather all files in workspaces and root
  const allRepoFiles = [];
  WORKSPACES.forEach((ws) => {
    getAllFiles(path.join(ROOT_DIR, ws), allRepoFiles);
  });

  // Also include root scripts and configs
  const rootFiles = fs.readdirSync(ROOT_DIR).filter((f) => {
    const full = path.join(ROOT_DIR, f);
    return (
      fs.statSync(full).isFile() &&
      (ANALYZED_EXTENSIONS.includes(path.extname(f)) || f === 'package.json')
    );
  });
  rootFiles.forEach((f) => allRepoFiles.push(path.join(ROOT_DIR, f)));

  // Combine contents of all codebase files to check references
  const fileContentsMap = new Map();
  let combinedCodebaseText = '';

  allRepoFiles.forEach((file) => {
    const relativePath = path.relative(ROOT_DIR, file);
    const content = readFileSafe(file);
    fileContentsMap.set(relativePath, content);
    combinedCodebaseText += `\n--- ${relativePath} ---\n` + content;
  });

  const actionItems = [];

  // --- Category A: Obsolete / Root Temp Files ---
  const rootTempFiles = ['check_deals_tmp.js', 'run_render_pdf_tmp.js', 'save_gandhar_tmp.js'];
  rootTempFiles.forEach((tempFile) => {
    if (fs.existsSync(path.join(ROOT_DIR, tempFile))) {
      actionItems.push({
        category: 'Obsolete Temp File',
        title: `Remove obsolete root temporary script ${tempFile}`,
        file: tempFile,
        detail: `File '${tempFile}' is a scratch script leftover in the root directory.`,
        action: `[DELETE] ${tempFile}`,
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
    const relPkg = path.relative(ROOT_DIR, pkgFile);
    try {
      const pkgJson = JSON.parse(readFileSafe(pkgFile));
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
        if (!importRegex.test(combinedCodebaseText)) {
          actionItems.push({
            category: 'Unused Dependency',
            title: `Remove unused dependency '${depName}' in ${path.dirname(relPkg)}`,
            file: relPkg,
            detail: `Dependency '${depName}' listed in ${relPkg} is not imported or required anywhere in active code, jobs, or skills.`,
            action: `[REMOVE DEPENDENCY] ${depName} from ${relPkg}`,
            priority: 'Medium',
          });
        }
      });
    } catch (_e) {
      // Ignore JSON parse errors
    }
  });

  // --- Category D: Unused Source Files ---
  allRepoFiles.forEach((filePath) => {
    const relPath = path.relative(ROOT_DIR, filePath);
    const baseName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    // Skip entrypoints, configs, tests, documentation, index files, and skills registry
    if (
      baseName.startsWith('.') ||
      baseName.startsWith('index.') ||
      baseName.endsWith('.test.js') ||
      baseName.endsWith('.spec.js') ||
      baseName === 'server.js' ||
      baseName === 'package.json' ||
      baseName === 'README.md' ||
      baseName === 'SKILL.md' ||
      baseName === 'PROMPT.md' ||
      baseName === 'QUICKSTART.md' ||
      baseName.endsWith('_tmp.js') ||
      relPath.startsWith('skills/') ||
      relPath.startsWith('jobs/Scheduled/') ||
      relPath.includes('pages/')
    ) {
      return;
    }

    if (ext === '.js' || ext === '.jsx' || ext === '.ts' || ext === '.tsx') {
      const fileNameNoExt = path.basename(filePath, ext);
      // Search if this file or filename is imported or referenced anywhere in other files
      const refCount = (combinedCodebaseText.match(new RegExp(`\\b${fileNameNoExt}\\b`, 'g')) || [])
        .length;

      // Calculate how many times it appears outside its own file
      const selfText = fileContentsMap.get(relPath) || '';
      const selfCount = (selfText.match(new RegExp(`\\b${fileNameNoExt}\\b`, 'g')) || []).length;
      const externalReferences = refCount - selfCount;

      if (externalReferences <= 0) {
        actionItems.push({
          category: 'Unused File',
          title: `Investigate unreferenced source file ${baseName}`,
          file: relPath,
          detail: `Source file '${relPath}' is not imported or referenced by any scheduled job, skill, or application module.`,
          action: `[DELETE] ${relPath}`,
          priority: 'Medium',
        });
      }
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

  // Retain previously existing Dead Code tasks that are marked completed
  existingTasks.forEach((task) => {
    if (
      task.title.startsWith('Dead Code:') &&
      !activeDeadCodeTitles.has(task.title) &&
      task.completed
    ) {
      updatedTasks.push(task);
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

runDeadCodeScanner();
