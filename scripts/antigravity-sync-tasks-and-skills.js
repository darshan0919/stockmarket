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
  // Every 30 min through the filing day. This job drains the pre-processing
  // queue, and its whole value is being AHEAD of the post-close slots — the
  // 18:30 pass in particular, since 48% of a day's filings land in the window
  // the 19:15 slot covers. The sync script's default (`0 20 * * *`, once at
  // 20:00) would have put it AFTER the slot it exists to feed, i.e. useful to
  // nobody, which is exactly why it needs an explicit entry here.
  // A run with an empty queue is a few file reads, so the cadence is cheap; if
  // per-session overhead ever proves material, drop to hourly (`0 9-23 * * *`)
  // rather than trimming the evening passes.
  'document-preprocessing': {
    sidecarFolder: 'document-preprocessing',
    displayName: 'Document Preprocessing',
    cron: '*/30 9-23 * * *',
  },
  // Every 3 hours, offset to :15 so it never collides with the preprocessing
  // runs at :00/:30 — both hit the same Stockscans endpoints, and those
  // endpoints rate-limit hard (429 observed at modest concurrency). Small,
  // frequent runs are the documented way to fill this cache; raising the
  // per-run limit does not make the backfill faster, it just buys 429s.
  'stockscans-context-warm': {
    sidecarFolder: 'stockscans-context-warm',
    displayName: 'Stockscans Context Warm',
    cron: '15 */3 * * *',
  },
  // 21:00 — after the 20:00 digests, which write the same events collection,
  // and late enough that the day's exchange filings have been disseminated.
  'order-book-sync-stockmarket': {
    sidecarFolder: 'order-book-sync',
    displayName: 'Order Book Sync',
    cron: '0 21 * * *',
  },
  // 22:00 (10:00 PM) daily — refreshes Kite instruments, reconciles NSE/BSE
  // mappings, overlays companies.json, and backfills missing scrip codes.
  'daily-company-master-sync': {
    sidecarFolder: 'company-master-sync',
    displayName: 'Company Master Sync',
    cron: '0 22 * * *',
  },
  // Delivery Volume Tracker — 7 slots across the trading day (10:10, 11:10, 12:10,
  // 13:10, 14:10, 15:10 IST snapshots, and 16:10 IST final snapshot-then-report).
  'delivery-volume-tracker': {
    sidecarFolder: 'delivery-volume-tracker',
    displayName: 'Delivery Volume Tracker - 10:10',
    cron: '10 10 * * *',
  },
  'delivery-volume-tracker-1110': {
    sidecarFolder: 'delivery-volume-tracker-1110',
    displayName: 'Delivery Volume Tracker - 11:10',
    cron: '10 11 * * *',
  },
  'delivery-volume-tracker-1210': {
    sidecarFolder: 'delivery-volume-tracker-1210',
    displayName: 'Delivery Volume Tracker - 12:10',
    cron: '10 12 * * *',
  },
  'delivery-volume-tracker-1310': {
    sidecarFolder: 'delivery-volume-tracker-1310',
    displayName: 'Delivery Volume Tracker - 13:10',
    cron: '10 13 * * *',
  },
  'delivery-volume-tracker-1410': {
    sidecarFolder: 'delivery-volume-tracker-1410',
    displayName: 'Delivery Volume Tracker - 14:10',
    cron: '10 14 * * *',
  },
  'delivery-volume-tracker-1510': {
    sidecarFolder: 'delivery-volume-tracker-1510',
    displayName: 'Delivery Volume Tracker - 15:10',
    cron: '10 15 * * *',
  },
  'delivery-volume-tracker-final': {
    sidecarFolder: 'delivery-volume-tracker-final',
    displayName: 'Delivery Volume Tracker - Final (16:10)',
    cron: '10 16 * * *',
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

/**
 * Writes a MINIMAL router SKILL.md into Antigravity's Global Skills dir, instead of
 * copying the skill's full content/scripts/references there. The router's only job is
 * to point Antigravity at the single source of truth (the stockmarket repo's
 * skills/registry.json + the real SKILL.md), local-first with a GitHub raw-content
 * fallback. This keeps each entry in ~/.gemini/config/skills/ a few hundred bytes
 * instead of the full skill bundle, which is what was blowing Antigravity's
 * "Customization token budget" (skills were being stored in full, not routed).
 *
 * Mirrors the pattern already used for the Claude-account custom skills (thin router ->
 * skills/registry.json -> repo SKILL.md, local checkout preferred, GitHub raw as
 * fallback) — see skills/tooling/skill-manager/SKILL.md for that side of the pattern.
 *
 * @param {string} skillName - Registry/skill identifier (matches the repo skill's
 *   frontmatter `name` and its key/derived name in skills/registry.json).
 * @param {string} description - The real description pulled from the repo SKILL.md
 *   frontmatter. Never weakened or shortened — Antigravity uses it to decide when to
 *   trigger the router.
 * @param {string} skillMdRepoPath - Repo-relative path to the real SKILL.md (e.g.
 *   "skills/equity-research/rerating-catalysts/SKILL.md"), used to build both the
 *   local-checkout read path and the GitHub raw fallback URL.
 * @param {string} destDir - Absolute path to the Antigravity global skill folder for
 *   this skill (e.g. ~/.gemini/config/skills/<skill-name>/).
 */
function writeRouterSkill(skillName, description, skillMdRepoPath, destDir) {
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const repoRoot = path.resolve(__dirname, '../');
  const githubRawBase = 'https://raw.githubusercontent.com/darshan0919/stockmarket/main';

  const routerContent = `---
name: ${skillName}
description: ${description}
---

Router for the "${skillName}" skill. This router has NO logic of its own — it is a thin
pointer into the stockmarket monorepo, which is the single source of truth. Never add
workflow logic here; if the routed skill needs to change, edit it in the repo, not this
file (and re-run \`yarn antigravity:sync\` — that regenerates this router only, it never
needs hand-editing).

## Resolve the skill (local-first, GitHub fallback)

1. **Local repo check.** Look for the stockmarket monorepo checkout on this machine
   (check the currently open workspace folder, then common locations such as
   \`${repoRoot}\`). Confirm it's the right repo by the presence of \`skills/registry.json\`
   at its root.
   - If found, read \`skills/registry.json\` from that local checkout and look up the
     \`"${skillName}"\` entry (or read the file directly at
     \`skills/registry.json\` -> \`skills["${skillName}"].skill_md\`, which should resolve to
     \`${skillMdRepoPath}\`). Read that SKILL.md directly from the local checkout. Also read
     any files listed in that entry's \`shared\` / \`references\` arrays as its SKILL.md
     instructs.
   - Any compiled entry point the skill needs is run via
     \`skills/_shared/resolve.sh <skill-name>\` from the local checkout, which resolves to
     \`stock-api/bin/<skill-name>.js\` directly (no separate bundle step).
2. **GitHub fallback.** Only if no local stockmarket checkout is available, or the local
   SKILL.md is missing/unreadable, fetch from GitHub instead, and say so explicitly
   ("local repo not found, fetching skill from GitHub"):
   - Registry: \`${githubRawBase}/skills/registry.json\`
   - SKILL.md: \`${githubRawBase}/${skillMdRepoPath}\`
   - Shallow-clone \`https://github.com/darshan0919/stockmarket.git\` into a temp dir and
     run \`skills/_shared/resolve.sh <skill-name>\` from there — it resolves to
     \`stock-api/bin/<skill-name>.js\` in the clone.
   - A branch other than \`main\` can be requested explicitly by the user ("use branch dev").

## Execute

Follow the fetched SKILL.md's instructions exactly. Any data-persistence rules it
references (e.g. \`docs/DATA_RULES.md\`) take precedence over anything implied here.
`;

  const destFile = path.join(destDir, 'SKILL.md');
  fs.writeFileSync(destFile, routerContent, 'utf8');

  // Clear out any stale full-content files a previous (pre-router) sync may have left
  // behind in this folder, so old bundled scripts/references don't linger alongside
  // the router and keep inflating the customization payload.
  for (const entry of fs.readdirSync(destDir)) {
    if (entry !== 'SKILL.md') {
      const p = path.join(destDir, entry);
      fs.rmSync(p, { recursive: true, force: true });
    }
  }
}

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

/**
 * Updates the sidecars section of Antigravity's configData object.
 * Existing sidecars persist their enabled state (whether true or false).
 * Newly discovered sidecars are initialized with enabled: false (disabled by default).
 *
 * @param {Record<string, any>} configData - The parsed Antigravity config.json object.
 * @param {string[]} syncedFolders - Array of sidecar folder names that were synced.
 * @param {string} [projId] - Optional Antigravity project ID to associate with sidecars.
 * @returns {Record<string, any>} The modified configData object.
 */
function updateSidecarsConfig(configData, syncedFolders, projId) {
  if (!configData.sidecars) {
    configData.sidecars = {};
  }

  for (const k of Object.keys(configData.sidecars)) {
    if (!syncedFolders.includes(k)) {
      delete configData.sidecars[k];
    }
  }

  for (const dir of syncedFolders) {
    if (!configData.sidecars[dir]) {
      configData.sidecars[dir] = { enabled: false };
    } else if (typeof configData.sidecars[dir].enabled !== 'boolean') {
      configData.sidecars[dir].enabled = false;
    }

    if (projId) {
      configData.sidecars[dir].projectId = projId;
    }
  }

  return configData;
}

function syncScheduledTasks() {
  console.log(
    '\n🔄 [1/2] Syncing ALL Repository Scheduled Jobs (jobs/Scheduled/) -> Antigravity Sidecars ONLY...'
  );

  if (!fs.existsSync(SIDECARS_DIR)) fs.mkdirSync(SIDECARS_DIR, { recursive: true });
  if (!fs.existsSync(GLOBAL_SKILLS_DIR)) fs.mkdirSync(GLOBAL_SKILLS_DIR, { recursive: true });

  const jobFolders = fs.readdirSync(JOBS_DIR).filter((f) => {
    const fullPath = path.join(JOBS_DIR, f);
    return fs.statSync(fullPath).isDirectory() && fs.existsSync(path.join(fullPath, 'SKILL.md'));
  });

  let syncedSidecars = 0;
  const syncedFolders = [];
  let prunedJobSkillDirs = 0;

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
      restart_policy: 'always',
      projectId: getProjectId(),
      project_id: getProjectId(),
      workspace_uris: ['file://' + require('path').resolve(__dirname, '../')],
      args: [cronToUse, 'agentapi', 'new-conversation', parsed.promptText],
      display_name: displayName,
    };

    fs.writeFileSync(sidecarFilePath, JSON.stringify(sidecarPayload, null, 2) + '\n', 'utf8');
    syncedSidecars++;
    syncedFolders.push(sidecarFolder);

    // NOTE: scheduled jobs are ONLY mapped to sidecars (above), never also written to
    // ~/.gemini/config/skills/. A scheduled job is invoked by Antigravity's scheduler via
    // its sidecar, not looked up as an ad-hoc skill — writing it to both places duplicated
    // the same content under two different names and inflated the customization payload
    // for no benefit. Repository skills (skills/equity-research, skills/tooling) are the
    // only things synced to Global Skills — see syncAllSkills() below.

    // If a stale skills/<taskName> entry exists from a previous sync (pre-fix), remove it
    // so the two stores don't keep drifting duplicate/orphaned copies of the same job.
    const staleJobSkillDir = path.join(GLOBAL_SKILLS_DIR, taskName);
    if (fs.existsSync(staleJobSkillDir)) {
      fs.rmSync(staleJobSkillDir, { recursive: true, force: true });
      prunedJobSkillDirs++;
    }
  }

  // Update ~/.gemini/config/config.json with the projectId
  const configPath = path.join(os.homedir(), '.gemini/config/config.json');
  if (fs.existsSync(configPath)) {
    try {
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const projId = getProjectId();
      updateSidecarsConfig(configData, syncedFolders, projId);
      fs.writeFileSync(configPath, JSON.stringify(configData, null, 2) + '\n', 'utf8');
      console.log('Synced Folders:', syncedFolders);
      if (projId) {
        console.log('✅ Linked all sidecars to project ID: ' + projId + ' in config.json');
      } else {
        console.log('✅ Registered sidecars in config.json');
      }
    } catch (e) {
      console.error('Error updating config.json:', e);
    }
  }

  // Prune any orphaned/deprecated sidecar directory in SIDECARS_DIR
  let prunedSidecarDirs = 0;
  if (fs.existsSync(SIDECARS_DIR)) {
    for (const d of fs.readdirSync(SIDECARS_DIR)) {
      if (!syncedFolders.includes(d) && !d.startsWith('.')) {
        const orphanDir = path.join(SIDECARS_DIR, d);
        if (fs.statSync(orphanDir).isDirectory()) {
          fs.rmSync(orphanDir, { recursive: true, force: true });
          prunedSidecarDirs++;
        }
      }
    }
  }

  if (prunedJobSkillDirs > 0) {
    console.log(
      `🧹 Removed ${prunedJobSkillDirs} stale scheduled-task entr${prunedJobSkillDirs === 1 ? 'y' : 'ies'} from Global Skills (jobs live only in Sidecars now).`
    );
  }
  if (prunedSidecarDirs > 0) {
    console.log(
      `🧹 Removed ${prunedSidecarDirs} deprecated/orphaned sidecar director${prunedSidecarDirs === 1 ? 'y' : 'ies'}.`
    );
  }
  console.log(`✅ Synchronized ${syncedSidecars} UI Sidecars.`);
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
        const skillMdRepoPath = path
          .relative(path.resolve(__dirname, '../'), skillMdPath)
          .split(path.sep)
          .join('/');
        // MINIMAL router only — never the full skill bundle. See writeRouterSkill().
        writeRouterSkill(skillName, parsed && parsed.description, skillMdRepoPath, globalSkillDir);
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

function syncRules() {
  console.log('\n🔄 [3/3] Syncing Multi-Platform Rules...');
  const { execSync } = require('child_process');
  execSync(`node "${path.resolve(__dirname, 'sync-rules.js')}" --fix`, { stdio: 'inherit' });
}

function main() {
  syncScheduledTasks();
  syncAllSkills();
  syncRules();
  console.log('\n🎉 Antigravity Tasks, Skills & Rules Synchronization Complete!\n');
}

if (require.main === module) {
  main();
}

module.exports = {
  updateSidecarsConfig,
  writeRouterSkill,
  parseSkillMd,
  titleCase,
  getProjectId,
  syncScheduledTasks,
  syncAllSkills,
  syncRules,
  main,
};
