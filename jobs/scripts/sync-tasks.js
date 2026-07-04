#!/usr/bin/env node
/**
 * sync-tasks.js
 *
 * Keeps automation tasks in sync between this repo (jobs/tasks/, platform-agnostic)
 * and whichever agent platform is running them (Cowork by default; Codex,
 * Antigravity, or any other platform listed in jobs/tasks/platforms.json).
 *
 * Source of truth = jobs/tasks/<taskId>/prompt.md (+ jobs/tasks/manifest.json)
 * Live location   = platforms.json[platform].targetDir/<taskId>/<fileName>
 *
 * Usage:
 *   node jobs/scripts/sync-tasks.js                       push repo -> Cowork (default platform, default direction)
 *   node jobs/scripts/sync-tasks.js --platform codex       push repo -> Codex
 *   node jobs/scripts/sync-tasks.js --pull                 pull Cowork -> repo
 *   node jobs/scripts/sync-tasks.js --platform codex --pull
 *   node jobs/scripts/sync-tasks.js --dry-run              preview only, write nothing
 *   node jobs/scripts/sync-tasks.js --task daily-deals-digest
 *   node jobs/scripts/sync-tasks.js --list-platforms
 *
 * NOTE: this only syncs the task's prompt/instructions text (rendered into
 * each platform's expected file format). It does NOT create or change cron
 * schedules in the target platform — those still need to be set once via
 * that platform's own scheduling UI/tool. jobs/tasks/manifest.json is a
 * human-maintained record of the intended schedule for reference.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const TASKS_DIR = path.join(__dirname, "..", "tasks");
const PLATFORMS_FILE = path.join(TASKS_DIR, "platforms.json");
const MANIFEST_FILE = path.join(TASKS_DIR, "manifest.json");

function expandHome(p) {
  if (p.startsWith("~")) return path.join(os.homedir(), p.slice(1));
  return p;
}

function loadPlatforms() {
  const raw = JSON.parse(fs.readFileSync(PLATFORMS_FILE, "utf8"));
  return raw;
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST_FILE)) return { tasks: [] };
  return JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));
}

// --- Renderers: platform-agnostic prompt.md <-> platform-specific file format ---

const renderers = {
  "skill-md": {
    // Cowork's SKILL.md: YAML frontmatter (name, description) + prompt body.
    render(taskId, description, promptBody) {
      return `---\nname: ${taskId}\ndescription: ${description}\n---\n\n${promptBody}`;
    },
    // Strip frontmatter back out to get the plain prompt body.
    extractBody(fileContent) {
      const match = fileContent.match(/^---\n[\s\S]*?\n---\n\n?([\s\S]*)$/);
      return match ? match[1] : fileContent;
    },
  },
  "plain-md": {
    // Generic platforms (Codex, Antigravity, ...): a simple markdown header + body.
    render(taskId, description, promptBody) {
      return `# ${taskId}\n\n> ${description}\n\n${promptBody}`;
    },
    extractBody(fileContent) {
      const match = fileContent.match(/^#.*\n\n>.*\n\n([\s\S]*)$/);
      return match ? match[1] : fileContent;
    },
  },
};

function parseArgs(argv) {
  const args = {
    mode: "push",
    dryRun: false,
    task: null,
    platform: null,
    listPlatforms: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pull") args.mode = "pull";
    else if (a === "--push") args.mode = "push";
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--task") args.task = argv[++i];
    else if (a === "--platform") args.platform = argv[++i];
    else if (a === "--list-platforms") args.listPlatforms = true;
  }
  return args;
}

function listRepoTasks() {
  if (!fs.existsSync(TASKS_DIR)) return [];
  return fs
    .readdirSync(TASKS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function readFileIfExists(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function resolvePlatform(platforms, name) {
  const platformName = name || platforms.default;
  const config = platforms.platforms[platformName];
  if (!config) {
    const known = Object.keys(platforms.platforms).join(", ");
    throw new Error(
      `Unknown platform "${platformName}". Known platforms: ${known}. Add a new entry to jobs/tasks/platforms.json to support another one.`
    );
  }
  const renderer = renderers[config.format];
  if (!renderer) {
    throw new Error(
      `Platform "${platformName}" declares format "${config.format}" but no renderer exists for it. Add one to renderers in jobs/scripts/sync-tasks.js.`
    );
  }
  return {
    name: platformName,
    targetDir: expandHome(config.targetDir),
    fileName: config.fileName,
    renderer,
  };
}

function push({ dryRun, task, platform }) {
  const manifest = loadManifest();
  const descriptions = new Map(manifest.tasks.map((t) => [t.taskId, t.description]));

  const tasks = task ? [task] : listRepoTasks();
  if (tasks.length === 0) {
    console.log(`No tasks found under ${TASKS_DIR}`);
    return;
  }

  let created = 0,
    changed = 0,
    unchanged = 0;

  for (const taskId of tasks) {
    const srcPath = path.join(TASKS_DIR, taskId, "prompt.md");
    const promptBody = readFileIfExists(srcPath);
    if (promptBody === null) {
      console.log(`  [skip] ${taskId} — no prompt.md in repo`);
      continue;
    }

    const description = descriptions.get(taskId) || taskId;
    const rendered = platform.renderer.render(taskId, description, promptBody.trimEnd()) + "\n";

    const dstDir = path.join(platform.targetDir, taskId);
    const dstPath = path.join(dstDir, platform.fileName);
    const existing = readFileIfExists(dstPath);
    const isNew = existing === null;
    const isSame = existing === rendered;

    if (isSame) {
      unchanged++;
      console.log(`  [ok]      ${taskId}`);
      continue;
    }

    if (dryRun) {
      console.log(`  [would ${isNew ? "create" : "update"}] ${taskId}`);
    } else {
      ensureDir(dstDir);
      fs.writeFileSync(dstPath, rendered, "utf8");
      console.log(`  [${isNew ? "created" : "updated"}] ${taskId}`);
    }
    isNew ? created++ : changed++;
  }

  console.log(
    `\nPush -> ${platform.name} ${dryRun ? "(dry-run) " : ""}summary: ${created} created, ${changed} updated, ${unchanged} unchanged.`
  );
  if (created > 0) {
    console.log(
      `Note: newly created tasks still need their schedule set once via ${platform.name}'s own scheduling UI/tool — this script only syncs prompt text.`
    );
  }
}

function pull({ dryRun, task, platform }) {
  if (!fs.existsSync(platform.targetDir)) {
    console.log(`No tasks found under ${platform.targetDir}`);
    return;
  }

  const tasks = task
    ? [task]
    : fs
        .readdirSync(platform.targetDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

  if (tasks.length === 0) {
    console.log(`No tasks found under ${platform.targetDir}`);
    return;
  }

  let created = 0,
    changed = 0,
    unchanged = 0;

  for (const taskId of tasks) {
    const srcPath = path.join(platform.targetDir, taskId, platform.fileName);
    const raw = readFileIfExists(srcPath);
    if (raw === null) {
      console.log(`  [skip] ${taskId} — no ${platform.fileName} in ${platform.name}`);
      continue;
    }

    const promptBody = platform.renderer.extractBody(raw).trimEnd() + "\n";

    const dstDir = path.join(TASKS_DIR, taskId);
    const dstPath = path.join(dstDir, "prompt.md");
    const existing = readFileIfExists(dstPath);
    const isNew = existing === null;
    const isSame = existing === promptBody;

    if (isSame) {
      unchanged++;
      console.log(`  [ok]      ${taskId}`);
      continue;
    }

    if (dryRun) {
      console.log(`  [would ${isNew ? "create" : "update"}] ${taskId}`);
    } else {
      ensureDir(dstDir);
      fs.writeFileSync(dstPath, promptBody, "utf8");
      console.log(`  [${isNew ? "created" : "updated"}] ${taskId}`);
    }
    isNew ? created++ : changed++;
  }

  console.log(
    `\nPull <- ${platform.name} ${dryRun ? "(dry-run) " : ""}summary: ${created} created, ${changed} updated, ${unchanged} unchanged.`
  );
  if (created > 0) {
    console.log(
      `Reminder: add cron/schedule/description info for newly pulled tasks to jobs/tasks/manifest.json, and commit.`
    );
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const platforms = loadPlatforms();

  if (args.listPlatforms) {
    console.log(`Available platforms (default: ${platforms.default}):`);
    for (const [name, config] of Object.entries(platforms.platforms)) {
      console.log(`  - ${name}: ${config.targetDir}/<taskId>/${config.fileName} (format: ${config.format})`);
    }
    return;
  }

  const platform = resolvePlatform(platforms, args.platform);

  console.log(`Repo tasks dir: ${TASKS_DIR}`);
  console.log(`Platform: ${platform.name} -> ${platform.targetDir}`);
  console.log(`Mode: ${args.mode}${args.dryRun ? " (dry-run)" : ""}\n`);

  if (args.mode === "push") push({ ...args, platform });
  else pull({ ...args, platform });
}

main();
