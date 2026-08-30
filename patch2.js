const fs = require('fs');
const file = 'scripts/antigravity-sync-tasks-and-skills.js';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/restartPolicy/g, 'restart_policy');
code = code.replace(/projectId/g, 'project_id');
code = code.replace(/displayName: displayName/g, 'display_name: displayName');

fs.writeFileSync(file, code);
