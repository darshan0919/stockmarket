---
name: antigravity-scheduled-tasks-sync
description: Sync repository scheduled jobs (jobs/Scheduled/) to Antigravity Sidecars ONLY, and repository skills (skills/equity-research & tooling) to Antigravity Global Skills ONLY, as minimal routers — never full copies, and never both destinations for the same item.
---

# Antigravity Tasks & Skills Synchronization Protocol

This skill enforces 100% synchronization between all repository job definitions under `jobs/Scheduled/`, all repository skills under `skills/`, and the Antigravity UI Sidecars & Global Skills — with each source mapped to exactly ONE destination.

## Mandatory Rule

Whenever scheduled tasks, job prompts, equity-research skills, or tooling skills are added, modified, or updated in the repository, you MUST run:

```bash
yarn antigravity:sync
```

This command automatically:

1. **Scans ALL `jobs/Scheduled/` jobs** and syncs them to **Sidecars ONLY**:
   - Updates Antigravity UI Scheduled Tasks sidecars (`~/.gemini/config/sidecars/{sidecarFolder}/sidecar.json`) with full prompt text & schedules.
   - Prunes any stale `~/.gemini/config/skills/<job-name>/` entry left over from before this rule existed.
2. **Scans ALL `skills/` categories (`equity-research`, `tooling`, `development`, etc.)** and syncs them to **Global Skills ONLY**:
   - Writes a minimal router `SKILL.md` for each of the 77+ repository skills into Antigravity Global Skills (`~/.gemini/config/skills/<skill-name>/`).

## One source -> one destination (no duplication)

A scheduled job and a repository skill are different things in Antigravity and must never be synced to both places:

- **Scheduled jobs (`jobs/Scheduled/`) -> Sidecars only** (`~/.gemini/config/sidecars/`). A job is invoked by Antigravity's own scheduler via its sidecar (cron + prompt), not looked up ad hoc as a skill. It has no business also existing under Global Skills.
- **Repository skills (`skills/equity-research/`, `skills/tooling/`) -> Global Skills only** (`~/.gemini/config/skills/`). These are invoked on demand, not on a schedule, and have no sidecar.

Previously the sync script wrote every scheduled job to *both* Sidecars and Global Skills, duplicating the same content under two different Antigravity concepts for no benefit and inflating the stored-customization footprint. `syncScheduledTasks()` now writes sidecars only, and actively removes (`fs.rmSync`) any `~/.gemini/config/skills/<job-name>/` folder matching a job name, so a stale pre-fix duplicate gets cleaned up automatically on the next sync. Do not reintroduce a skills-dir write inside `syncScheduledTasks()`, and do not add a sidecar-dir write inside `syncAllSkills()` / `syncCategorySkills()` — keep the one-source-one-destination mapping intact.

## Router-only methodology (mandatory for every Antigravity skill)

The single source of truth for every skill's logic is its `SKILL.md` (plus scripts/references/assets) inside this repo, indexed by `skills/registry.json`. **Antigravity's Global Skills directory (`~/.gemini/config/skills/`) never holds a copy of that content.** Each folder there holds only a router: a short `SKILL.md` (frontmatter + a few dozen lines) whose entire job is to locate the real skill and read it — local checkout first, GitHub raw content as fallback — then follow its instructions.

This mirrors the pattern already used for the Claude-account custom skills (see `skills/tooling/skill-manager/SKILL.md`): thin router -> `skills/registry.json` -> real `SKILL.md` in the repo.

Why this is mandatory: Antigravity enforces a token budget on stored customizations. Copying full skill bundles (SKILL.md + bundled scripts + references + assets) into `~/.gemini/config/skills/` for dozens of skills blows that budget and triggers "Customization token budget exceeded. Large customizations will be truncated" — silently corrupting whichever skills get cut off. A router is a few hundred to a few thousand bytes; the full bundles it replaces can run into tens of KB each across dozens of skills. Duplicating scheduled jobs into Global Skills on top of that made the problem worse for no functional gain.

**This means:**

- The sync script (`scripts/antigravity-sync-tasks-and-skills.js`) NEVER copies a skill's full folder into `~/.gemini/config/skills/`. It only ever calls `writeRouterSkill(skillName, description, skillMdRepoPath, destDir)`, which writes a router `SKILL.md` and removes any stray non-router files left in that destination folder (e.g. from before this fix, or a manual copy).
- Any future change to the sync script that re-introduces a full copy (`copyRecursiveSync`, `fs.cpSync`, manually walking and copying a skill directory, etc.), or that re-introduces writing a scheduled job into Global Skills (or a repo skill into Sidecars), is a regression of this fix and must be reverted.
- Any brand-new skill added to the repo needs NO Antigravity-specific work beyond being present under `skills/equity-research/` or `skills/tooling/` (or `jobs/Scheduled/` for scheduled tasks) with a valid `SKILL.md` and a `skills/registry.json` entry — the next `yarn antigravity:sync` run will generate its router (or sidecar) automatically, in the one correct destination. Never hand-write or hand-copy a skill/job into the wrong Antigravity store.
- If Antigravity ever still reports a token-budget warning after a sync, check for stale entries in `~/.gemini/config/skills/` that predate this fix (leftover full-bundle copies, or leftover job duplicates) rather than assuming the router content itself is too large — a single router should never be large enough to matter.
