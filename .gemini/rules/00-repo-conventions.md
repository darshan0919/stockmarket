# Repo-wide conventions (read first)

Antigravity is one of several AI tools editing this repository (alongside
Claude Code, Claude Cowork, and Cursor). The canonical, tool-agnostic
development rules — mandatory formatting/testing/docs requirements, the
data-layer and skills conventions, commit style, safety rails — live in
[`AGENTS.md`](../../AGENTS.md) at the repo root. Read it before making any
change.

Files in this `.gemini/rules/` directory should only contain rules that are
genuinely Antigravity-specific (sync mechanics, sidecar/skill mirroring) —
see [`scheduled-tasks-sync.md`](scheduled-tasks-sync.md) for the current one.
Don't duplicate `AGENTS.md` content here.
