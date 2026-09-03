const fs = require('fs');
const path = require('path');
const os = require('os');
const file = 'scripts/antigravity-sync-tasks-and-skills.js';
let code = fs.readFileSync(file, 'utf8');

// 1. Remove project_id from sidecarPayload
code = code.replace(/project_id: getProjectId\(\),\n/g, '');

// 2. We need to add logic to update config.json after sidecars are processed.
// We'll append it before the final console.log
const configUpdateLogic = `
  // Update ~/.gemini/config/config.json with the projectId
  const configPath = path.join(os.homedir(), '.gemini/config/config.json');
  if (fs.existsSync(configPath)) {
    try {
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const projId = getProjectId();
      if (projId) {
        if (!configData.sidecars) configData.sidecars = {};
        
        // Ensure every folder we synced is registered
        const sidecarDirs = fs.readdirSync(SIDECARS_DIR);
        for (const dir of sidecarDirs) {
          // If it exists in config, update it. If not, add it.
          if (!configData.sidecars[dir]) {
             configData.sidecars[dir] = { enabled: true };
          }
          configData.sidecars[dir].projectId = projId;
        }
        fs.writeFileSync(configPath, JSON.stringify(configData, null, 2) + '\\n', 'utf8');
        console.log('✅ Linked all sidecars to project ID: ' + projId + ' in config.json');
      }
    } catch (e) {
      console.error('Error updating config.json:', e);
    }
  }
`;

code = code.replace(
  'console.log(\n    `✅ Synchronized ${syncedSidecars} UI Sidecars',
  configUpdateLogic + '\n  console.log(\n    `✅ Synchronized ${syncedSidecars} UI Sidecars'
);

fs.writeFileSync(file, code);
