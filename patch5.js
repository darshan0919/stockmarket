const fs = require('fs');
const file = 'scripts/antigravity-sync-tasks-and-skills.js';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('const syncedFolders = [];')) {
  code = code.replace(
    'let syncedSidecars = 0;',
    'let syncedSidecars = 0;\n  const syncedFolders = [];'
  );
  code = code.replace(
    'syncedSidecars++;',
    'syncedSidecars++;\n    syncedFolders.push(sidecarFolder);'
  );
  code = code.replace(
    "// Only link sidecars managed by this sync run\\n        const sidecarDirs = fs.readdirSync(JOBS_DIR).map(f => f.replace(/\\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'));",
    'const sidecarDirs = syncedFolders;'
  );
  fs.writeFileSync(file, code);
}
