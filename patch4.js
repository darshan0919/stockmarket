const fs = require('fs');
const file = 'scripts/antigravity-sync-tasks-and-skills.js';
let code = fs.readFileSync(file, 'utf8');

// Replace the sidecarDirs logic
code = code.replace(
  "const sidecarDirs = fs.readdirSync(SIDECARS_DIR);",
  "// Only link sidecars managed by this sync run\\n        const sidecarDirs = fs.readdirSync(JOBS_DIR).map(f => f.replace(/\\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'));"
);

fs.writeFileSync(file, code);
