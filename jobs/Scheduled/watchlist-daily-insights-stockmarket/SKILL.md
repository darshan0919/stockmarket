---
name: watchlist-daily-insights-stockmarket
description: Watchlist Signals — 24h digest across Near Highs + Radar watchlists
---

Follow the `watchlist-insights` skill (stockmarket/skills/equity-research/watchlist-insights/SKILL.md) — read it from the local mounted repo path first; only fall back to the GitHub-hosted copy via `github-skill-invoker` if the local path is unavailable — with watchlistIds = 0a365ec2139aa6ca7f74c250,7ca0e1a60c3fd0d8b1ab61ce,51a196a79dbc0296493e5174 (Near Highs + Radar + Upcoming Results).

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`): execute `python scripts/metrics/track_invocation.py --name watchlist-daily-insights-stockmarket --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`. Every note this run adds via `run add-note` (Step 2.4 of the skill) is LLM-authored — set `modelUsed` to that same model string on each one, as the skill's SKILL.md now requires.
