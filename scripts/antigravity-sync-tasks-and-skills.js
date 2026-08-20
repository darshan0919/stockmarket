const fs = require('fs');
const path = require('path');
const os = require('os');

const SIDECARS_DIR = path.join(os.homedir(), '.gemini/config/sidecars');
const GLOBAL_SKILLS_DIR = path.join(os.homedir(), '.gemini/config/skills');
const REPO_SKILLS_DIR = path.resolve(__dirname, '../skills');
const JOBS_DIR = path.resolve(__dirname, '../jobs/Scheduled');

// Target skill categories in the repository to sync outward to Antigravity global skills
const TARGET_SKILL_CATEGORIES = ['equity-research', 'tooling'];

// Overrides map for known sidecar UI display names, folder names, and default cron schedules
const SIDECAR_OVERRIDES = {
  'daily-deals-digest': {
    sidecarFolder: 'dealsdigest',
    displayName: 'Deals Digest',
    cron: '0 20 * * *',
  },
  'daily-gainers-digest': {
    sidecarFolder: 'dailygainersdigest',
    displayName: 'Daily Gainers Digest',
    cron: '0 20 * * *',
  },
  'weekly-gainers-digest': {
    sidecarFolder: 'weeklygainersdigest',
    displayName: 'Weekly Gainers Digest',
    cron: '0 20 * * 0',
  },
  'near-highs-digest': {
    sidecarFolder: 'nearhighsdigest',
    displayName: 'Near Highs Digest',
    cron: '0 20 * * *',
  },
  'periodic-dead-code-scan': {
    sidecarFolder: 'dead-code-tasks',
    displayName: 'Dead Code Tasks',
    cron: '0 9 * * 0',
  },
  'watchlist-sync-stockmarket': {
    sidecarFolder: 'watchlist-sync',
    displayName: 'Watchlist Sync',
    cron: '0 16 * * *',
  },
  'upload-stock-reports-to-google-drive': {
    sidecarFolder: 'data-sync',
    displayName: 'Data Sync',
    cron: '0 1 * * *',
  },
  // 21:00 — after the 20:00 digests, which write the same events collection,
  // and late enough that the day's exchange filings have been disseminated.
  'order-book-sync-stockmarket': {
    sidecarFolder: 'order-book-sync',
    displayName: 'Order Book Sync',
    cron: '0 21 * * *',
  },
};

function parseSkillMd(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');

  let name = '';
  let description = '';
  let promptText = content;

  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (fmMatch) {
    const yamlLines = fmMatch[1].split('\n');
    for (const line of yamlLines) {
      const nameMatch = line.match(/^name:\s*(.+)$/);
      if (nameMatch) name = nameMatch[1].trim();
      const descMatch = line.match(/^description:\s*(.+)$/);
      if (descMatch) description = descMatch[1].trim();
    }
    promptText = fmMatch[2].trim();
  }

  return { name, description, promptText, fullContent: content };
}

function titleCase(str) {
  return str
    .replace(/-stockmarket$/, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

function syncScheduledTasks() {
  console.log(
    '\n🔄 [1/2] Syncing ALL Repository Scheduled Jobs (jobs/Scheduled/) -> Antigravity Sidecars & Global Skills...'
  );

  if (!fs.existsSync(SIDECARS_DIR)) fs.mkdirSync(SIDECARS_DIR, { recursive: true });
  if (!fs.existsSync(GLOBAL_SKILLS_DIR)) fs.mkdirSync(GLOBAL_SKILLS_DIR, { recursive: true });

  const jobFolders = fs.readdirSync(JOBS_DIR).filter((f) => {
    const fullPath = path.join(JOBS_DIR, f);
    return fs.statSync(fullPath).isDirectory() && fs.existsSync(path.join(fullPath, 'SKILL.md'));
  });

  let syncedSidecars = 0;
  let syncedJobSkills = 0;

  for (const jobFolder of jobFolders) {
    const jobSkillPath = path.join(JOBS_DIR, jobFolder, 'SKILL.md');
    const parsed = parseSkillMd(jobSkillPath);
    if (!parsed || !parsed.promptText) continue;

    const taskName = parsed.name || jobFolder;
    const override = SIDECAR_OVERRIDES[jobFolder] || {};

    const sidecarFolder = override.sidecarFolder || taskName.replace(/-stockmarket$/, '');
    const displayName = override.displayName || titleCase(taskName);
    const defaultCron = override.cron || '0 20 * * *';

    const sidecarDirPath = path.join(SIDECARS_DIR, sidecarFolder);
    const sidecarFilePath = path.join(sidecarDirPath, 'sidecar.json');

    if (!fs.existsSync(sidecarDirPath)) {
      fs.mkdirSync(sidecarDirPath, { recursive: true });
    }

    // Preserve existing cron schedule from sidecar.json if configured
    let cronToUse = defaultCron;
    if (fs.existsSync(sidecarFilePath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(sidecarFilePath, 'utf8'));
        if (existing && Array.isArray(existing.args) && existing.args[0]) {
          cronToUse = existing.args[0];
        }
      } catch (err) {
        // ignore parse error
      }
    }

    // 1. Sync UI Sidecar
    const sidecarPayload = {
      builtin: 'schedule',
      restartPolicy: 'always',
      args: [cronToUse, 'agentapi', 'new-conversation', parsed.promptText],
      displayName: displayName,
    };

    fs.writeFileSync(sidecarFilePath, JSON.stringify(sidecarPayload, null, 2) + '\n', 'utf8');
    syncedSidecars++;

    // 2. Sync Global Skill (~/.gemini/config/skills/<taskName>/SKILL.md) — OUTWARD ONLY
    const globalSkillDir = path.join(GLOBAL_SKILLS_DIR, taskName);
    copyRecursiveSync(path.join(JOBS_DIR, jobFolder), globalSkillDir);
    syncedJobSkills++;
  }

  console.log(
    `✅ Synchronized ${syncedSidecars} UI Sidecars and ${syncedJobSkills} Scheduled Task Skills.`
  );
}

function syncCategorySkills(categoryDir) {
  if (!fs.existsSync(categoryDir)) return 0;
  const items = fs.readdirSync(categoryDir);
  let synced = 0;

  for (const item of items) {
    if (item.startsWith('.') || item === '_shared' || item === 'registries') continue;
    const itemPath = path.join(categoryDir, item);
    const stat = fs.statSync(itemPath);

    if (stat.isDirectory()) {
      const skillMdPath = path.join(itemPath, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        const parsed = parseSkillMd(skillMdPath);
        const skillName = parsed && parsed.name ? parsed.name : item;

        const globalSkillDir = path.join(GLOBAL_SKILLS_DIR, skillName);
        copyRecursiveSync(itemPath, globalSkillDir);
        synced++;
      }
    }
  }

  return synced;
}

function syncAllSkills() {
  console.log(
    '\n🔄 [2/2] Syncing Equity Research & Tooling Repository Skills -> Antigravity Global Skills...'
  );
  let totalSynced = 0;

  for (const category of TARGET_SKILL_CATEGORIES) {
    const categoryDir = path.join(REPO_SKILLS_DIR, category);
    const categoryCount = syncCategorySkills(categoryDir);
    console.log(`  - ${category}: ${categoryCount} skills synced`);
    totalSynced += categoryCount;
  }

  console.log(
    `✅ Synchronized ${totalSynced} Equity Research & Tooling Skills to ~/.gemini/config/skills/`
  );
}

function main() {
  syncScheduledTasks();
  syncAllSkills();
  console.log('\n🎉 Antigravity Tasks & Skills Synchronization Complete!\n');
}

main();
