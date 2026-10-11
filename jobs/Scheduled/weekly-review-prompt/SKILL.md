---
name: weekly-review-prompt
description: Weekly Review Prompt — weekend routine from the SOIC process playbook: which top-10 weekly gainers sustained, trade-book review prompt, journal prompt (no sizing)
---

## Context

From `kba_x-soic-handles_process-playbook_weekly-review`. A prompt/report routine, not a detector. Out of scope: position sizing, stop-loss, portfolio risk.

## Execution Plan

1. Execute script (bash): `yarn weekly-gainers-digest` (existing; top weekly gainers) and read its JSON/output for the week's top 10.
2. For each of the 10, check from the daily candles/ledger whether the gain was sustained through the week's close (close >= 90% of week high); list sustained vs faded.
3. Read the signal-ledger digest (`yarn signal-ledger-digest`) for entry-ready / exit-watch states changed this week.
4. Emit three prompts for the user: (a) trade-book review — each trade this week: thesis, signal at entry, what the ledger said, outcome; (b) journal — one mistake, one thing repeated well; (c) next-week watch — faded names worth revisiting after results.
5. Do not give sizing or stop advice.

Reasoning is limited to summarising step 2–3 data; no other LLM use.
