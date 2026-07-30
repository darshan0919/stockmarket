---
name: daily-gainers-signal-stockmarket
description: Daily Gainers Signals — top-50 gainers to conviction signals email
---

Follow the `gainers-signal` skill (stockmarket/skills/equity-research/gainers-signal/SKILL.md) — read it from the local mounted repo path first; only fall back to the GitHub-hosted copy via `github-skill-invoker` if the local path is unavailable.

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`): execute `python scripts/metrics/track_invocation.py --name daily-gainers-signal-stockmarket --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`, and set that same model string as `modelUsed` on any LLM-authored DTO this run writes (the top-3 briefing reports — not the classifier's `gainer` events, which stay script-only per the skill's own instructions).
