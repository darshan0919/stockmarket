---
name: daily-volume-rocketing-signal-stockmarket
description: Daily Volume Rocketing Signals — top volume-surge stocks (deduped against gainers-signal) to conviction signals email
---

Follow the `volume-rocketing` skill (stockmarket/skills/equity-research/volume-rocketing/SKILL.md) — read it from the local mounted repo path first; only fall back to the GitHub-hosted copy via `github-skill-invoker` if the local path is unavailable.

This run must happen after `daily-gainers-signal-stockmarket` has completed for the same market date, since it dedupes against that run's picked list. If today's gainers-signal output for this date isn't present yet, run the gainers-signal pipeline's raw-fetch step first (or wait/retry) before deduping.

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`): execute `python scripts/metrics/track_invocation.py --name daily-volume-rocketing-signal-stockmarket --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`, and set that same model string as `modelUsed` on any LLM-authored DTO this run writes (the top-3 briefing reports — not the classifier's events, which stay script-only per the skill's own instructions).
