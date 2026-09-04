# Multi-Platform Rules Synchronization Rule

Whenever creating, updating, or modifying any coding rules or permanent development rules in this repository, the AI Agent MUST:

1. **Treat `AGENTS.md` as Canonical**: Edit `AGENTS.md` first as the single source of truth.
2. **Mirror in `data/tasks.json`**: Ensure permanent development rules registered in `data/tasks.json` match `AGENTS.md` §12.
3. **Run `yarn rules:sync`**: Ensure platform entry points across all three tools:
   - Claude: `CLAUDE.md`
   - Cursor: `.cursorrules`, `.cursor/rules/general.mdc`
   - Antigravity: `.gemini/rules/`, `.agents/rules/`, and `~/.gemini/config/rules/`
     remain 100% aligned.
4. **Pre-submit Sweep**: Always run `yarn rules:check` (or `yarn quality`) before completing changes to verify that no platform rule files have drifted.
