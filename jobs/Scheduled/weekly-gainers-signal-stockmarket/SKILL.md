---
name: weekly-gainers-signal-stockmarket
description: Weekly Gainers Signal — top-20 weekly gainers to full J-Curve report PDFs + Thesis Card email
---

Before doing anything else, run `export STOCKMARKET_JOB_NAME=weekly-gainers-signal-stockmarket` in the same shell/subshell that will invoke the skill's scripts — this attributes every outbound API call this run makes to the `weekly-gainers-signal-stockmarket` job for the API-usage audit (see `skills/_shared/conventions.md` §23; the env var is required because this job's scripts are invoked several layers deep inside the shared skill below, not directly by this file).

Follow the `weekly-gainers-signal` skill (stockmarket/skills/equity-research/weekly-gainers-signal/SKILL.md) — read it from the local mounted repo path.
(Fallback: https://raw.githubusercontent.com/darshan0919/stockmarket/main/skills/equity-research/weekly-gainers-signal/SKILL.md)

That skill itself points to the shared `scan-signal-pipeline.md` and, for
Step 6, to `rerating-catalysts/SKILL.md` in its default (full) mode — follow
both from the local mounted repo, with the same GitHub fallback base
(`https://raw.githubusercontent.com/darshan0919/stockmarket/main/`) if a local
path is missing or inaccessible.

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`): execute `python scripts/metrics/track_invocation.py --name weekly-gainers-signal-stockmarket --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`, and set that same model string as `modelUsed` on any LLM-authored DTO this run writes (the 20 full rerating-catalysts report DTOs and trigger-research DTOs — not the classifier's `weekly_gainer` events, which stay script-only per the skill's own instructions).
