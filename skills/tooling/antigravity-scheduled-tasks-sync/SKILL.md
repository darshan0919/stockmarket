---
name: antigravity-scheduled-tasks-sync
description: Sync ALL repository scheduled jobs (jobs/Scheduled/) and repository skills (skills/equity-research & tooling) with Antigravity UI Sidecars (~/.gemini/config/sidecars/) and Global Skills (~/.gemini/config/skills/).
---

# Antigravity Tasks & Skills Synchronization Protocol

This skill enforces 100% synchronization between all repository job definitions under `jobs/Scheduled/`, all repository skills under `skills/`, and the Antigravity UI Sidecars & Global Skills.

## Mandatory Rule

Whenever scheduled tasks, job prompts, equity-research skills, or tooling skills are added, modified, or updated in the repository, you MUST run:

```bash
yarn antigravity:sync
```

This command automatically:

1. **Scans ALL `jobs/Scheduled/` jobs**:
   - Updates Antigravity UI Scheduled Tasks sidecars (`~/.gemini/config/sidecars/{sidecarFolder}/sidecar.json`) with full prompt text & schedules.
   - Syncs Scheduled Task skills to `~/.gemini/config/skills/`.
2. **Scans ALL `skills/` categories (`equity-research`, `tooling`, `development`, etc.)**:
   - Syncs all 77+ repository skills directly to Antigravity Global Skills (`~/.gemini/config/skills/<skill-name>/`).
