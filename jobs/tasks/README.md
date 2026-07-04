# jobs/tasks — platform-agnostic automation tasks

Source of truth for scheduled automation tasks (what today runs as Claude Cowork scheduled tasks, but not tied to Cowork). Each task is stored as plain instructions with no platform-specific formatting, so the same task can be synced to Cowork, Codex, Antigravity, or any other agent platform.

```
jobs/tasks/
  platforms.json                    # registry of supported platforms: target dir + file format per platform
  manifest.json                     # description/cron/schedule/enabled per task (human-maintained record)
  <taskId>/prompt.md                # the task's plain-text instructions — no frontmatter, no platform syntax
```

## Syncing to a platform

`jobs/scripts/sync-tasks.js` renders `prompt.md` into whatever file format the target platform expects, and copies it into that platform's live task directory.

```bash
# default platform is "cowork" (see platforms.json)
yarn tasks:diff                       # preview changes, write nothing
yarn tasks:push                       # push repo -> Cowork (~/Claude/Scheduled)
yarn tasks:pull                       # pull Cowork -> repo

# target a different platform
node jobs/scripts/sync-tasks.js --platform codex --push
node jobs/scripts/sync-tasks.js --platform antigravity --push --dry-run

# list all registered platforms
yarn tasks:platforms

# limit to one task
node jobs/scripts/sync-tasks.js --task daily-deals-digest --push
```

## Adding a new platform

Add an entry to `platforms.json`:

```json
"myplatform": { "targetDir": "~/.myplatform/tasks", "format": "plain-md", "fileName": "task.md" }
```

`format` must match a renderer registered in `jobs/scripts/sync-tasks.js` (`skill-md` for Cowork's YAML-frontmatter SKILL.md, `plain-md` for a generic markdown header + body). If a platform needs a genuinely different file shape, add a new renderer there.

## What this does NOT do

- It does not create or change cron schedules in the target platform — set those once via that platform's own scheduling UI/tool.
- `manifest.json` is documentation, not enforced config. If you change a schedule via a platform's UI, update `manifest.json` by hand to keep it accurate.
- `sync-tasks.js` must be run from a real terminal on your machine (not inside a sandboxed session), since it needs to reach each platform's local task directory (e.g. `~/Claude/Scheduled`).
