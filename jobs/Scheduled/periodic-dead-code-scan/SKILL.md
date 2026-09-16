---
name: periodic-dead-code-scan
description: Periodic Dead Code & Coding Practice Scan — weekly scan for dead code, unused dependencies, and practice violations
---

## Context

Weekly monorepo dead code audit. The companion script scans workspaces (`screener-api`, `screener-web`, `stock-api`, `cloud-utils`, `packages/jobs-runtime`), scheduled tasks, and skills for unreferenced source files, unused package dependencies, obsolete temporary scripts, and hardcoded absolute path violations. Category D (unreferenced source files) is a real full-repo reachability graph rooted at four entry-point categories (skills/**, jobs/Scheduled/**, package.json scripts, UI entry points), not a string-matching heuristic — see `scripts/reachability-graph.js` for the design. It also flags `data/` directory entries with no data-layer code referencing their collection name ("hanging nodes").

## Output DTO

The script syncs findings into `data/tasks.json` as ONE parent task titled `"Dead Code: <YYYY-MM-DD> scan"`, with every individual finding as a native subtask (`subtasks: [{id, title, completed, note, createdAt, updatedAt}]`). Every subtask's `note` field (see `deriveReviewNote` in `scripts/dead-code-scanner.js`) states how much that specific finding can be trusted — it is not decorative, it is the guardrail described in step 4 below. It also updates `DEAD_CODE_ACTION_ITEMS.md`.

## Execution Plan

Call the following exact script:

1. Execute script (bash): `yarn dead-code:scan`
2. Read the summary stdout output. Note the total items found, category breakdown, the "Whole-Directory Findings" table if present (biggest dead directories by file count — check these first, they're the highest-value deletions), and the parent task title + subtask count written to `data/tasks.json`.
3. If the script exits non-zero, surface the exact error in your report and stop — do not proceed to steps 4-5 against stale/partial data.
4. **Auto-complete high-confidence structural findings — this is now standard behavior, not optional.** Every subtask's `note` field marks it either a high-confidence structural finding (zero traced references anywhere — categories `Unused File`, `Committed Stray Artifact`, `Unused Dependency`) or a dicey, judgment-call category (`Unreferenced Non-Code File`, `Data Directory Hanging Node`, `Env Var Unused Outside Tests`, `Coding Standard Violation`).
   - **High-confidence structural findings:** for each one, do a quick sanity check (the finding text + a single targeted `git grep` for the exact filename/path across the repo — confirm zero real references, not just trust the note blindly), then actually perform the action: `[DELETE]` → delete the file/directory; `[REMOVE FROM GIT]` → `git rm --cached`; `[REMOVE DEPENDENCY]` → remove the line from the named `package.json`. Mark the subtask complete in the same run. A "Whole-Directory Findings" entry is deleted as a whole directory (`rm -rf`), not file-by-file.
   - **Dicey categories:** never auto-complete these. Leave every one pending.
5. **Produce a categorical blocker analysis for everything left pending** (the dicey-category subtasks, plus any high-confidence finding your sanity check couldn't actually confirm). Do not just re-list them flatly — group them into themes (e.g. "per-company scratch directories with one live sibling file", "root-level dated exports awaiting delivery", "env vars possibly read outside this repo") and for each theme state in one or two sentences *why* it can't be auto-resolved (what specific ambiguity the reachability model can't see: a dynamically-built path, a consumer outside the `db.js` convention, a platform-level env var, etc.) — this is a real, previously-confirmed failure mode (`data/hft-watchlist.json` was flagged as an orphaned hanging node purely because its only real consumer was a Chrome extension writing it via the downloads API, entirely outside the `db.js` convention this scanner traces; a stale-but-real doc reference can also make a truly-dead directory look referenced — verify the reference is current, not just present, before trusting it as "alive"). Include this analysis in the run's final report; do not just leave it implicit in `data/tasks.json`'s notes.
6. Commit nothing. Deletions/fixes from step 4 are real filesystem/dependency changes but stay unstaged in the working tree — per this repo's safety rails (`CLAUDE.md`), no job or skill ever commits or pushes; Darshan reviews the diff and commits manually.

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`): execute `python scripts/metrics/track_invocation.py --name periodic-dead-code-scan --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`. No `modelUsed` needed for the scan itself (purely scripted static analysis) — but the step-5 categorical analysis IS LLM judgment, so report which model produced it.
