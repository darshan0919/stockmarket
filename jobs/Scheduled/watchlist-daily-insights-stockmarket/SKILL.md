---
name: watchlist-daily-insights-stockmarket
description: Watchlist Signals — daily digest across Near Highs + Radar watchlists (deterministic window: since the last confirmed-complete run, at least back to the previous day's 8AM IST)
---

Before doing anything else, run `export STOCKMARKET_JOB_NAME=watchlist-daily-insights-stockmarket` in the same shell/subshell that will invoke the skill's scripts — this attributes every outbound API call this run makes to the `watchlist-daily-insights-stockmarket` job for the API-usage audit (see `skills/_shared/conventions.md` §23; the env var is required because this job's scripts are invoked several layers deep inside the shared skill below, not directly by this file).

Follow the `watchlist-insights` skill (stockmarket/skills/equity-research/watchlist-insights/SKILL.md) — read it from the local mounted repo path first; only fall back to the GitHub-hosted copy via `github-skill-invoker` if the local path is unavailable — with watchlistIds = 0a365ec2139aa6ca7f74c250,7ca0e1a60c3fd0d8b1ab61ce,51a196a79dbc0296493e5174 (Near Highs + Radar + Upcoming Results).

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`): execute `python scripts/metrics/track_invocation.py --name watchlist-daily-insights-stockmarket --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`. Every note this run adds via `run add-note` (Step 2.4 of the skill) is LLM-authored — set `modelUsed` to that same model string on each one, as the skill's SKILL.md now requires.
