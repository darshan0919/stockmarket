---
name: daily-ipo-subscription-analysis-stockmarket
description: Daily IPO Subscription Digest — IPOs listing tomorrow ranked by subscription quality, top 3 DRHP/RHP-analysed, emailed
---

Follow the `ipo-subscription-ranker` skill (stockmarket/skills/equity-research/ipo-subscription-ranker/SKILL.md) — read it from the local mounted repo path first; only fall back to the GitHub-hosted copy (https://raw.githubusercontent.com/darshan0919/stockmarket/main/skills/equity-research/ipo-subscription-ranker/SKILL.md) if the local path is unavailable. Run it with defaults (no date override — the skill infers "listing tomorrow" from today's IST date).

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`): execute `python scripts/metrics/track_invocation.py --name daily-ipo-subscription-analysis-stockmarket --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`, and set that same model string as `modelUsed` on the Phase 3 ranking-narrative note this run writes (if a companyId was resolvable) — not on the scanner's `ipos` records, which stay script-only per the skill's own instructions.
