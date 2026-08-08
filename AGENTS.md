# AGENTS.md — Repository Development Rules

This is the **single canonical source of rules** for anyone — human or AI agent
(Claude Code, Claude Cowork, Cursor, Antigravity/Gemini, or any other tool) —
editing this repository. Every tool-specific entry point (`CLAUDE.md`,
`.cursorrules`, `.cursor/rules/*.mdc`, `.gemini/rules/*.md`) points back here.

**Edit rules only in this file (or the docs it links to).** Don't copy rule
text into a tool-specific file — that's exactly the drift this file exists to
prevent. Tool-specific files should only carry things that genuinely differ
per tool (e.g. Cursor's glob-scoped `.mdc` rules).

## 1. What this repo is

Stock Screener is a full-stack Indian stock-market research platform:

- **`backend/`** — Express.js REST API + MongoDB (legacy/simple screener)
- **`frontend/`** — Next.js 14 React app
- **`stock-api/`, `screener-api/`, `screener-web/`** — newer service layer
- **`packages/jobs-runtime/`** — the shared data/env/job-scheduling runtime
- **`skills/`** — Claude Agent Skills (equity research, forensic accounting,
  concall analysis, etc.) — see `skills/README.md`
- **`docs/`** — architecture, API reference, data rules, testing guide

Start at [`docs/README.md`](docs/README.md) for the documentation index and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for system design.

## 2. Mandatory for every code change

1. **Format**: `yarn format` (Prettier) before committing.
2. **Lint**: `yarn lint` — fix with `yarn lint:fix`.
3. **Tests**: `yarn test` from repo root must pass. New code needs new tests
   (happy path, edge cases, error handling) placed in `__tests__/` next to
   the source file. Full conventions: [`.cursor/rules/testing.mdc`](.cursor/rules/testing.mdc)
   and [`docs/TESTING.md`](docs/TESTING.md).
4. **Docs**: JSDoc on new functions/components, plus updates to the relevant
   file under `docs/` (`API_REFERENCE.md` for API changes, `ARCHITECTURE.md`
   for structural changes). Full template:
   [`.cursor/rules/documentation.mdc`](.cursor/rules/documentation.mdc).
5. **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`,
   `test:`, `chore:`) — see [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md).
6. **Branching**: never create a new branch to make code changes. Always work
   directly on the local `main` branch. Do not `git add` or `git commit` the
   changes yourself — leave them unstaged/uncommitted in the working tree so
   the user can review and commit them.
7. **Follow existing patterns.** Don't introduce a new abstraction, styling
   approach, or state-management pattern when one already exists in the file
   you're touching or its neighbors — match what's there.
8. Quick pre-submit sweep: `yarn quality` (format:check + lint + test).

Backend- and frontend-specific structure, templates, and checklists:
[`.cursor/rules/backend.mdc`](.cursor/rules/backend.mdc) ·
[`.cursor/rules/frontend.mdc`](.cursor/rules/frontend.mdc).

## 3. Skills, jobs, and the data layer

If you are creating or modifying anything under `skills/`,
`packages/jobs-runtime/`, or a data-persisting script in `stock-api/`, the
rules in [`skills/_shared/conventions.md`](skills/_shared/conventions.md) are
**mandatory, not optional** — they cover deterministic execution, the env
abstraction, the `db.js` data-access chokepoint, JSON-first DTO rendering,
the Extraction-vs-Analysis split, and more.

Anything that persists data or adds a new collection/type must additionally
follow the checklist in [`docs/DATA_RULES.md`](docs/DATA_RULES.md) and the
model in [`docs/DATA_ECOSYSTEM.md`](docs/DATA_ECOSYSTEM.md). Key points that
are easy to violate by accident:

- Never write files under `data/` directly — only `packages/jobs-runtime/lib/db.js` does.
- `data/` is gitignored — never `git add` anything under it.
- Every skill run ends with a files-touched manifest and a token-optimization suggestion (see conventions doc §9/§11).

When adding a new external API integration, document its payload/response
shape in `docs/<provider>-api-schemas.md` in the **same change** — see
conventions doc §13. This requirement is expanded in full in §4 below.

## 4. API integrations: typed, exhaustively documented, never duplicated

Every external API integration (Stockscans, NSE/BSE, or any future provider)
must satisfy all of the following before it's considered done:

1. **Reuse before writing.** Before adding a new client/wrapper, check for an
   existing one for that provider — `stock-api/src/api/`, `backend/api/`,
   `screener-api/src/**/api/`, and `docs/*-api-schemas.md` for the doc index.
   Extend the existing client with a new method; do not create a second
   client, a second base-URL constant, or a second auth/retry/cache layer for
   a provider that already has one. If you find two wrappers already exist
   for the same provider, that's a bug — consolidate them (see §7) rather
   than adding a third.
2. **Fully typed.** This codebase is JSDoc-typed, not TypeScript, so "fully
   typed" means: every exported client method has a complete `@param`/
   `@returns` JSDoc signature, and every non-trivial request/response shape
   gets a named `@typedef` (e.g. `@typedef {Object} StockscansAnnouncement`)
   that the method's JSDoc references — not an inline `{Object}` for a
   multi-field payload. Prefer JSDoc over full TypeScript migration to stay
   consistent with the rest of the repo; if a package is later migrated to
   `.ts`, use real interfaces instead and drop the JSDoc duplication.
3. **Exhaustive schema + doc coverage, written with the code (not after).**
   `docs/<provider>-api-schemas.md` must cover, per endpoint: method + path,
   auth requirements, a real (or explicitly-labeled-unconfirmed) request
   payload, the full response envelope including error shapes, every field
   that's an enum/union (list the known values), optional vs required
   fields, and pagination/cursor behavior if any. "Exhaustive" means every
   field the code actually reads or writes is documented — not just the
   happy-path subset exercised by one sample call. This is the same
   requirement as conventions doc §13, stated here so it applies repo-wide,
   not only inside `skills/`.
4. **Modular by provider, not by caller.** One client module per external
   provider, imported by every caller that needs it (screener-api, stock-api,
   skills, jobs). Provider-specific logic (auth, base URL, rate limits,
   retries, pagination) lives once in that client — callers pass parameters
   and get typed results, they don't reimplement request-building.

## 5. Workspace Facade Pattern — package.json is the only invocation surface

Every script, job, digest, sync, or scanner that's meant to be run from
outside its own module (by a human, a CI job, a scheduled task, a skill, or
another script) **must** be exposed as a `package.json` script — at the repo
root or in the relevant workspace — and invoked that way, not via a raw
`node path/to/script.js`.

- **Adding a runnable script**: add a `"name": "node path/to/script.js"`
  entry to the nearest `package.json` (workspace-level if the script belongs
  to `backend/`, `frontend/`, `stock-api/`, etc.; root-level if it's cross-
  cutting, following the existing `yarn <workspace> <script>` pattern used
  for jobs). Give it a name that matches what it does, consistent with
  existing entries (`daily-gainers-digest`, `dead-code:scan`,
  `antigravity:sync`, etc.).
- **Invoking a script** — in docs, other scripts, skill instructions, CI
  config, or scheduled-task prompts — always reference the `yarn <script>`
  command, never the underlying file path. If the script you need to run
  doesn't have a `package.json` entry yet, add one before wiring anything
  else to call it; don't route around the facade with a direct `node`/`npx`
  invocation "just this once."
- **Why**: the `package.json` scripts are the one place that knows the real
  entry points, keeps invocation consistent across local/CI/Cowork/scheduled
  contexts, and gives `yarn dead-code:scan` a reliable signal for what's
  actually reachable. A script with no `package.json` entry is effectively
  undiscoverable and is a dead-code/duplication risk.
- Exception: genuinely internal helper scripts that only another script
  `require()`s (never run standalone) don't need an entry — but if it's
  invoked from a shell (by a person, cron, or an agent), it needs one.

## 6. Documentation coverage: scripts, APIs, skills, tasks, workflows

Every one of the following must have discoverable documentation, added or
updated in the **same change** that introduces or modifies it:

| What                                                                                    | Where it's documented                                                                                                                                                       |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runnable script / `package.json` command                                                | One line in the nearest `README.md` (or `docs/backend/README.md` / `docs/frontend/README.md` quick-reference table) — what it does, when to run it, what it touches         |
| External API integration                                                                | `docs/<provider>-api-schemas.md` per §4 above                                                                                                                               |
| Skill (`skills/*`)                                                                      | `SKILL.md` (already required by the skills framework) + an entry in `skills/registry.json` and `skills/README.md`'s directory listing                                       |
| Scheduled task / job (`jobs/Scheduled/`, cron-driven scripts)                           | What it does and its schedule, in the task definition itself plus a pointer from `docs/README.md` or the relevant workspace doc if it's not self-evident from the task name |
| Cross-cutting workflow (e.g. the guidance/PEAD pipeline, extraction→dashboard pipeline) | A short doc under `docs/` describing the stages and which skills/scripts implement each one, so the next reader doesn't have to reconstruct the pipeline from source        |

If you can't find where something should be documented, that's a signal the
doc structure needs a new file, not a reason to skip documenting it — add the
file under `docs/` and link it from `docs/README.md`.

## 7. Clean code: reusable, modular, minimal, no debris

- **Reusability first.** Before writing a new function, check if an existing
  utility already does it (or nearly does it) — extend/parameterize the
  existing one rather than writing a parallel version. This applies across
  workspaces too: `packages/jobs-runtime/lib/` and `stock-api/src/utils/`
  are shared-utility homes; check them before adding a local copy.
- **Modularity**: one clear responsibility per function/module. A function
  that fetches data, transforms it, AND renders output should usually be
  three functions (or the Extraction/Analysis split from conventions doc
  §17) — not one that does all three.
- **Less code, not more.** Prefer deleting/simplifying over adding. Don't
  add defensive code, config flags, or abstraction layers for scenarios that
  can't happen. Three similar lines beat a premature abstraction; a real
  third use case beats a speculative one.
- **Cleanup is part of the change, not a follow-up.** No stray debug files
  (`tmp_*.js`, `*_tmp.js`, scratch `.write_test`-style files) left in the
  repo tree — use the workspace's own `data/runs/`, `data/cache/`, or a
  session scratchpad, and remove throwaway files before finishing. No dead
  code, no commented-out blocks, no unused exports left behind by a
  refactor — run `yarn dead-code:scan` after any removal/rename to confirm
  nothing references the old path.

## 8. Local issue tracking ("Jira")

When asked to "log Jira" / "create a ticket" / "track this" without an
explicit request to use real Atlassian: write a markdown file under `jira/`
(not an external Jira instance). Full rule: [`.cursor/rules/jira.mdc`](.cursor/rules/jira.mdc).

## 9. Antigravity sync

Any change to scheduled tasks (`jobs/Scheduled/`) or `skills/` must be
followed by `yarn antigravity:sync` and `yarn dead-code:scan`. Full rule:
[`.gemini/rules/scheduled-tasks-sync.md`](.gemini/rules/scheduled-tasks-sync.md).

## 10. Safety rails

- Never commit or push anything.
- Never use git commands that could write to the repo.

## 11. Tool-specific entry points

Every AI coding tool used on this repo loads its own conventionally-named
file first; each of those is a thin pointer back to this document plus
whatever is genuinely tool-specific:

| Tool                        | Entry point                                                             | Tool-specific content                                  |
| --------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| Claude Code / Claude Cowork | [`CLAUDE.md`](CLAUDE.md)                                                | session/runtime notes only                             |
| Cursor                      | [`.cursorrules`](.cursorrules), [`.cursor/rules/*.mdc`](.cursor/rules/) | glob-scoped rules (backend/frontend/testing/docs/jira) |
| Antigravity / Gemini        | [`.gemini/rules/*.md`](.gemini/rules/)                                  | Antigravity sidecar/skill sync mechanics               |

If you're adding a new mandatory rule, add it here first, then (only if a
tool needs a glob-scoped or mechanism-specific variant) add a short pointer
in the relevant tool file — never restate the rule body twice.
