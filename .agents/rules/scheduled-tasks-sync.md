# Antigravity Tasks & Skills Synchronization Rule

Whenever creating, updating, or modifying any scheduled task definitions in `jobs/Scheduled/` or skills in `skills/`, the AI Agent MUST:

1. Always run `yarn antigravity:sync` to ensure:
   - Antigravity UI Scheduled Tasks sidecars (`~/.gemini/config/sidecars/`) are 100% synchronized with full prompt text and schedules.
   - Antigravity Global Skills (`~/.gemini/config/skills/`) are 100% synchronized for all 77+ repository skills and task commands.
2. Verify that no dead code or broken path violations are introduced by running `yarn dead-code:scan`.
