const fs = require('fs');
const path = require('path');
const file = 'scripts/antigravity-sync-tasks-and-skills.js';
let code = fs.readFileSync(file, 'utf8');

const getProjectIdCode = `
function getProjectId() {
  const projectsDir = path.join(os.homedir(), '.gemini/config/projects');
  if (!fs.existsSync(projectsDir)) return undefined;
  const repoUri = 'file://' + path.resolve(__dirname, '../');
  const files = fs.readdirSync(projectsDir);
  for (const file of files) {
    if (file.endsWith('.json')) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(projectsDir, file), 'utf8'));
        if (data.projectResources && data.projectResources.resources) {
          for (const res of data.projectResources.resources) {
            if (res.gitFolder && res.gitFolder.folderUri === repoUri) {
              return data.id;
            }
          }
        }
      } catch (err) {}
    }
  }
  return undefined;
}
`;

if (!code.includes('function getProjectId()')) {
  code = code.replace(
    'function syncScheduledTasks() {',
    getProjectIdCode + '\nfunction syncScheduledTasks() {'
  );
}

code = code.replace(
  `    const sidecarPayload = {
      builtin: 'schedule',
      restartPolicy: 'always',
      args: [cronToUse, 'agentapi', 'new-conversation', parsed.promptText],
      displayName: displayName,
    };`,
  `    const sidecarPayload = {
      builtin: 'schedule',
      restartPolicy: 'always',
      projectId: getProjectId(),
      args: [cronToUse, 'agentapi', 'new-conversation', parsed.promptText],
      displayName: displayName,
    };`
);

fs.writeFileSync(file, code);
