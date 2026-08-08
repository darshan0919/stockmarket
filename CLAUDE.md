# CLAUDE.md

Instructions for Claude Code and Claude Cowork sessions working in this repo.

@AGENTS.md

## Claude-specific notes

- **Skills**: this repo's skills live under `skills/` and are the primary way
  equity-research work gets done here (concall analysis, forensic accounting,
  quarterly-result analysis, etc.). Check `skills/registry.json` and
  `skills/README.md` before writing new one-off analysis logic — a skill
  covering the task probably already exists.
- **Jobs-runtime conventions are not optional.** Before writing code that
  touches `skills/`, `packages/jobs-runtime/`, or `data/`, read
  `skills/_shared/conventions.md` in full — it is dense and load-bearing, not
  boilerplate.
- **Scratch/temp files**: use the session scratchpad directory, not the repo
  root. Files like `tmp_*.js`, `_save_gainers_research_tmp.js`, or
  `.write_test` left in the repo root are session debris — if you create
  scratch files, clean them up before finishing, and if you find pre-existing
  ones that look stale, ask before deleting (they may be in-progress work).
- **Before creating a new skill or job**, check `skills/registry.json` and
  `jobs/Scheduled/` for an existing one that's close — extend it rather than
  duplicating, per `skills/_shared/conventions.md` §17 (never think or write
  the same thing twice).
- Repo-wide mandatory rules (formatting, testing, docs, data layer, commit
  style) are in [`AGENTS.md`](AGENTS.md), imported above — follow those for
  every change regardless of which Claude surface (CLI, Cowork, web) you're
  running in.
