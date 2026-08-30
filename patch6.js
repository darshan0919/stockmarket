const fs = require('fs');
const file = 'scripts/antigravity-sync-tasks-and-skills.js';
let code = fs.readFileSync(file, 'utf8');
code = code.replace(
  "console.log('✅ Linked all sidecars to project ID: ' + projId + ' in config.json');",
  "console.log('Synced Folders:', syncedFolders);\nconsole.log('✅ Linked all sidecars to project ID: ' + projId + ' in config.json');"
);
fs.writeFileSync(file, code);
