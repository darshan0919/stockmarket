---
name: watchlist-insight-validation-stockmarket
description: Signal Validation — validate latest watchlist notes, update ledger + proposals, email summary
---

Follow the `insight-validation` skill (stockmarket/skills/insight-validation/SKILL.md).

This run now also validates `gainers-signal`'s HIGH-conviction picks from 2 trading days
ago against D+2 price action (positive, substantial return; delivery% as a secondary
signal), writes `jobs/data/validation/gainers_ledger.json`, and folds a summary into the
same email — this happens automatically as part of the default `run` command, no extra
invocation needed.