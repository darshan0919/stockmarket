# Repo-wide conventions (read first)

Antigravity is one of several AI tools editing this repository (alongside
Claude Code, Claude Cowork, and Cursor). The canonical, tool-agnostic
development rules — mandatory formatting/testing/docs requirements, the
data-layer and skills conventions, commit style, safety rails, and permanent
development rules — live in [`AGENTS.md`](../../AGENTS.md) at the repo root.
Read it before making any change.

Files in this rules directory should only contain rules that are
genuinely Antigravity-specific or synchronization-oriented:

- [`scheduled-tasks-sync.md`](scheduled-tasks-sync.md): UI sidecars and skills sync mechanics (`yarn antigravity:sync`).
- [`rules-sync.md`](rules-sync.md): Multi-platform rules parity across Claude, Cursor, and Antigravity (`yarn rules:sync`).
  Don't duplicate `AGENTS.md` content here.
