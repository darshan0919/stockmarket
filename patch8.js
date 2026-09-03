const fs = require('fs');
const file = 'scripts/antigravity-sync-tasks-and-skills.js';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  'project_id: getProjectId(),',
  'projectId: getProjectId(),\n      project_id: getProjectId(),'
);
fs.writeFileSync(file, code);
