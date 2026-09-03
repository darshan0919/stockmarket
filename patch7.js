const fs = require('fs');
const file = 'scripts/antigravity-sync-tasks-and-skills.js';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('workspace_uris')) {
  code = code.replace(
    'project_id: getProjectId(),',
    "project_id: getProjectId(),\n      workspace_uris: ['file://' + path.resolve(__dirname, '../')],\n      workspace_uri: 'file://' + path.resolve(__dirname, '../'),"
  );
  fs.writeFileSync(file, code);
}
