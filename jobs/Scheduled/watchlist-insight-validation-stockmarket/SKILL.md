---
name: watchlist-insight-validation-stockmarket
description: Signal Validation — validate latest watchlist notes, update ledger + proposals, email summary
---

Follow the `insight-validation` skill (stockmarket/skills/equity-research/insight-validation/SKILL.md) — read it from the local mounted repo path first; only fall back to the GitHub-hosted copy via `github-skill-invoker` if the local path is unavailable.

This run now also validates `gainers-signal`'s HIGH-conviction picks from 2 trading days
ago against D+2 price action (positive, substantial return; delivery% as a secondary
signal), writes `the validation collection (`data/validation.json`, type=`gainers-followup`)`, and folds a summary into the
same email — this happens automatically as part of the default `run` command, no extra
invocation needed.

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`): execute `python scripts/metrics/track_invocation.py --name watchlist-insight-validation-stockmarket --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`. No `modelUsed` needed on the validation records themselves — `insightValidator.js` is fully deterministic (no LLM call), confirmed in `skills/tooling/output-dto-standard/SKILL.md`.
