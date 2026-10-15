const fs = require('fs');
const path = require('path');
const os = require('os');

const SIDECARS_DIR = path.join(os.homedir(), '.gemini/config/sidecars');
const GLOBAL_SKILLS_DIR = path.join(os.homedir(), '.gemini/config/skills');
const REPO_SKILLS_DIR = path.resolve(__dirname, '../skills');
const JOBS_DIR = path.resolve(__dirname, '../jobs/Scheduled');

// Target skill categories in the repository to sync outward to Antigravity global skills
const TARGET_SKILL_CATEGORIES = ['equity-research', 'tooling', 'development'];

// Overrides map for known sidecar UI display names, folder names, and default cron schedules
const SIDECAR_OVERRIDES = {
  'post-market-digests-suite': {
    sidecarFolder: 'post-market-digests-suite',
    displayName: 'Post-Market Digests Suite',
    cron: '30 20 * * 1-5',
    model: 'flash_lite',
  },
  'soic-macro-structural-daily': {
    sidecarFolder: 'soic-macro-structural-daily',
    displayName: 'SOIC Macro & Structural Supply',
    cron: '0 19 * * 1-5',
    model: 'flash_lite',
  },
  'soic-setups-rotation-daily': {
    sidecarFolder: 'soic-setups-rotation-daily',
    displayName: 'SOIC Setups, Rotation & Exits',
    cron: '15 19 * * 1-5',
    model: 'flash_lite',
  },
  'mtf-flush-suite-daily': {
    sidecarFolder: 'mtf-flush-suite-daily',
    displayName: 'MTF Flush Trading Suite',
    cron: '30 19 * * 1-5',
    model: 'flash_lite',
  },
  'daily-gainers-signal-stockmarket': {
    sidecarFolder: 'daily-gainers-signal',
    displayName: 'Daily Gainers Signal',
    cron: '45 18 * * 1-5',
    model: 'flash',
  },
  'post-close-day-recap': {
    sidecarFolder: 'post-close-day-recap',
    displayName: 'Post-Close Announcement Recap',
    cron: '45 23 * * 1-5',
    model: 'flash_lite',
  },
  'weekly-gainers-digest': {
    sidecarFolder: 'weeklygainersdigest',
    displayName: 'Weekly Gainers Digest',
    cron: '0 20 * * 0',
    model: 'flash_lite',
  },
  'periodic-dead-code-scan': {
    sidecarFolder: 'dead-code-tasks',
    displayName: 'Dead Code Tasks',
    cron: '0 9 * * 0',
    model: 'flash',
  },
  'policy-event-tracker': {
    sidecarFolder: 'policy-event-tracker',
    displayName: 'Policy Event Tracker',
    cron: '30 18 * * 0',
    model: 'flash_lite',
  },
  'upload-stock-reports-to-google-drive': {
    sidecarFolder: 'data-sync',
    displayName: 'Data Sync',
    cron: '0 1 * * *',
    model: 'flash_lite',
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
    model: 'flash_lite',
  },
  // 21:00 — after the 20:00 digests, which write the same events collection,
  // and late enough that the day's exchange filings have been disseminated.
  'order-book-sync-stockmarket': {
    sidecarFolder: 'order-book-sync',
    displayName: 'Order Book Sync',
    cron: '0 21 * * *',
    model: 'flash',
  },
  // Delivery Volume Tracker — single consolidated hourly schedule across the trading day (10:25 to 17:25).
  // Runs Monday through Friday (1-5) on weekdays only.
  'delivery-volume-tracker': {
    sidecarFolder: 'delivery-volume-tracker',
    displayName: 'Delivery Volume Tracker (Hourly)',
    cron: '25 10-17 * * 1-5',
    model: 'flash_lite',
  },
  'daily-quarterly-result-analysis': {
    sidecarFolder: 'daily-quarterly-result-analysis',
    displayName: 'Daily Quarterly Result Analysis',
    model: 'gemini-3.8-flash-high',
  },
};

function parseSkillMd(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');

  let name = '';
  let description = '';
  let model = '';
  let promptText = content;

  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (fmMatch) {
    try {
      const jsYaml = require('js-yaml');
      const parsedYaml = jsYaml.load(fmMatch[1]);
      if (parsedYaml && typeof parsedYaml === 'object') {
        if (parsedYaml.name) name = String(parsedYaml.name).trim();
        if (parsedYaml.description) description = String(parsedYaml.description).trim();
        if (parsedYaml.model) model = String(parsedYaml.model).trim();
      }
    } catch (err) {
      // Fallback manual parser if js-yaml fails on malformed YAML
    }

    if (!name || !description || !model) {
      const yamlLines = fmMatch[1].split('\n');
      let capturingDesc = false;
      let descLines = [];
      for (const line of yamlLines) {
        const nameMatch = line.match(/^name:\s*(.+)$/);
        if (nameMatch) {
          if (!name) name = nameMatch[1].trim();
          capturingDesc = false;
          continue;
        }
        const modelMatch = line.match(/^model:\s*(.+)$/);
        if (modelMatch) {
          if (!model) model = modelMatch[1].trim();
          capturingDesc = false;
          continue;
        }
        const descMatch = line.match(/^description:\s*(.*)$/);
        if (descMatch) {
          const rest = descMatch[1].trim();
          if (rest === '>' || rest === '>-' || rest === '|' || rest === '|-') {
            capturingDesc = true;
            descLines = [];
          } else if (rest.length > 0) {
            if (!description) description = rest;
            capturingDesc = false;
          }
          continue;
        }
        if (capturingDesc) {
          if (/^\s+/.test(line)) {
            descLines.push(line.trim());
          } else if (line.trim() === '') {
            // empty line
          } else {
            capturingDesc = false;
          }
        }
      }
      if (!description && descLines.length > 0) {
        description = descLines.join(' ');
      }
    }

    promptText = fmMatch[2].trim();
  }

  return { name, description, model, promptText, fullContent: content };
}

function titleCase(str) {
  return str
    .replace(/-stockmarket$/, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Produces a concise, trigger-preserving description for the router frontmatter.
 * Antigravity enforces a strict context budget across the global skills catalog
 * (listing each skill name, path, and description in the agent system prompt).
 * Capping descriptions to ~320 chars while preserving what the skill does and
 * primary trigger keywords prevents exceeding the prompt budget and ensures no
 * skills are dropped.
 *
 * @param {string} desc - Full description from the repo SKILL.md.
 * @param {number} [maxLen=320] - Maximum target character length.
 * @returns {string} Clean, concise description string.
 */
function compressDescription(desc, maxLen = 320) {
  if (!desc) return '';
  let clean = desc.replace(/\s+/g, ' ').trim();
  clean = clean.replace(/^(?:>-|>)\s*/, '').trim();
  if (clean.length <= maxLen) return clean;

  const sentences = clean.split(/(?<=[.?!])\s+/);
  const firstSentence = sentences[0] || '';

  const triggerSentence = sentences.find(
    (s, idx) => idx > 0 && /\b(use\s+(?:when|whenever|this)|invoke|trigger|run\s+when)\b/i.test(s)
  );

  let combined = firstSentence;
  if (triggerSentence && (firstSentence + ' ' + triggerSentence).length <= maxLen) {
    combined = firstSentence + ' ' + triggerSentence;
  } else if (triggerSentence) {
    const budgetForTrigger = maxLen - firstSentence.length - 1;
    if (budgetForTrigger > 80) {
      combined = firstSentence + ' ' + triggerSentence.slice(0, budgetForTrigger).trim() + '...';
    }
  }

  if (combined.length > maxLen) {
    const sub = combined.slice(0, maxLen);
    const lastPunct = Math.max(sub.lastIndexOf('. '), sub.lastIndexOf('; '), sub.lastIndexOf(', '));
    if (lastPunct > 180) {
      combined = sub.slice(0, lastPunct) + '...';
    } else {
      combined = sub.trim() + '...';
    }
  }

  return combined;
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
 *   frontmatter. Compressed to fit within Antigravity's prompt context budget while
 *   preserving key triggers.
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

  // Format description using YAML block scalar (>-) with 2-space indentation
  // to ensure valid YAML even if description contains colons, quotes, or special characters.
  const compressed = compressDescription(description, 320);
  const indentedDesc = compressed ? `  ${compressed}` : '  ';

  const routerContent = `---
name: ${skillName}
description: >-
${indentedDesc}
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

  if (syncedFolders && syncedFolders.length > 0) {
    for (const k of Object.keys(configData.sidecars)) {
      if (!syncedFolders.includes(k)) {
        // If projId is specified, do not prune sidecars that belong to another project
        if (
          projId &&
          configData.sidecars[k] &&
          configData.sidecars[k].projectId &&
          configData.sidecars[k].projectId !== projId
        ) {
          continue;
        }
        delete configData.sidecars[k];
      }
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

    const sidecarDirPath = path.join(SIDECARS_DIR, sidecarFolder);
    const sidecarFilePath = path.join(sidecarDirPath, 'sidecar.json');

    if (!fs.existsSync(sidecarDirPath)) {
      fs.mkdirSync(sidecarDirPath, { recursive: true });
    }

    // Use explicit override cron if configured; otherwise preserve existing schedule from sidecar.json or fallback to default
    let cronToUse = override.cron || '0 20 * * *';
    if (!override.cron && fs.existsSync(sidecarFilePath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(sidecarFilePath, 'utf8'));
        if (existing && Array.isArray(existing.args) && existing.args[0]) {
          cronToUse = existing.args[0];
        }
      } catch (err) {
        // ignore parse error
      }
    }

    const modelToUse = override.model || parsed.model || null;
    const conversationArgs = [cronToUse, 'agentapi', 'new-conversation'];
    if (modelToUse) {
      conversationArgs.push(`--model=${modelToUse}`);
    }
    conversationArgs.push(parsed.promptText);

    // 1. Sync UI Sidecar
    const sidecarPayload = {
      builtin: 'schedule',
      restart_policy: 'always',
      projectId: getProjectId(),
      project_id: getProjectId(),
      workspace_uris: ['file://' + require('path').resolve(__dirname, '../')],
      args: conversationArgs,
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

function syncCategorySkills(categoryDir, syncedSkillNames = new Set()) {
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
        syncedSkillNames.add(skillName);
        synced++;
      }
    }
  }

  return synced;
}

function syncAllSkills() {
  console.log(
    '\n🔄 [2/2] Syncing Repository Skills -> Antigravity Global Skills (Router Facades ONLY)...'
  );
  let totalSynced = 0;
  const syncedSkillNames = new Set();

  for (const category of TARGET_SKILL_CATEGORIES) {
    const categoryDir = path.join(REPO_SKILLS_DIR, category);
    const categoryCount = syncCategorySkills(categoryDir, syncedSkillNames);
    console.log(`  - ${category}: ${categoryCount} skills synced`);
    totalSynced += categoryCount;
  }

  // Prune any orphaned, deprecated, or stale global skill directories from ~/.gemini/config/skills/
  let prunedSkills = 0;
  if (fs.existsSync(GLOBAL_SKILLS_DIR)) {
    for (const d of fs.readdirSync(GLOBAL_SKILLS_DIR)) {
      if (!syncedSkillNames.has(d) && !d.startsWith('.')) {
        const orphanDir = path.join(GLOBAL_SKILLS_DIR, d);
        if (fs.statSync(orphanDir).isDirectory()) {
          fs.rmSync(orphanDir, { recursive: true, force: true });
          prunedSkills++;
        }
      }
    }
  }

  if (prunedSkills > 0) {
    console.log(
      `🧹 Removed ${prunedSkills} orphaned/deprecated global skill director${prunedSkills === 1 ? 'y' : 'ies'} (not present in repo).`
    );
  }

  console.log(
    `✅ Synchronized ${totalSynced} router skills to ~/.gemini/config/skills/ (zero heavy lifting, 100% facade).`
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
  compressDescription,
  parseSkillMd,
  titleCase,
  getProjectId,
  syncScheduledTasks,
  syncCategorySkills,
  syncAllSkills,
  syncRules,
  main,
};
