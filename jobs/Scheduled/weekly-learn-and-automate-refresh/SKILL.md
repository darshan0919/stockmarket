---
name: weekly-learn-and-automate-refresh
description: Weekly refresh of the learn-and-automate knowledge base for X experts (first: @SureshKBN) — script-first delta ingest, cheap-tier extraction of new posts only, verified persist, NEW/CHANGED/CONTRADICTS digest
---

## Context

Keeps the `knowledge-units` collection current for each learning source (today `x:sureshkbn`).
Everything deterministic is a script (`yarn learn-and-automate ...`); the agent only does recall
extraction of the few new chunks (cheap tier) and writes a short digest. No LLM API keys
anywhere (conventions §24). Contract: `skills/tooling/learn-and-automate/SKILL.md` (mode: refresh).
Expected load: ~1-3 new chunks per week. Hard cap: 6 chunks per run — if more are pending, say so and
leave them for the next run (they stay in the pending queue; nothing is lost).

## Execution Plan

For each source key in [`x:sureshkbn`]:

1. `yarn learn-and-automate ingest --source <key> --delta` then `... prefilter --source <key> --delta` then
   `... chunk --source <key> --delta`. If ingest reports 0 new docs → report "no new content" and stop for this source.
2. `yarn learn-and-automate next-chunks --source <key> --n 6`. For each chunk returned, follow
   `skills/tooling/learn-and-automate/references/recall_extraction.md` exactly (Haiku-class model is enough;
   tier-1 first, then replies, then reposts) and write the JSONL to the chunk's `out` path. Do not rank or judge.
3. `yarn learn-and-automate verify --source <key> --model-used <model>` — report accepted/rejected counts.
   If rejected > 15% of produced units, stop and report (prompt drift) — do NOT persist.
4. `yarn learn-and-automate:persist --file data/runs/learn-and-automate/<slug>/units.verified.jsonl`
   (existing stances are preserved by the script).
5. Compare this run's new units with active units in the same topic and flag **NEW**, **CHANGED**
   (newer view on the same idea → patch the older unit `status: superseded`, conventions §28) and
   **CONTRADICTS** (queue as an L6 question for the next learning session).
6. `yarn learn-and-automate render --source <key>`; save a `learning-run` report via
   `yarn learn-and-automate:persist --report <file>`.
7. Only after steps 1-6 succeeded: `yarn learn-and-automate commit-cursor --source <key>` (conventions §19).
   After a partial failure do NOT commit the cursor.

Report: new docs, chunks extracted, units accepted/rejected, NEW / CHANGED / CONTRADICTS counts (top 5
each, with tweet links), and the "Files touched" list from the persist script. End with the token
optimization suggestion (conventions §11).

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`):
execute `python scripts/metrics/track_invocation.py --name weekly-learn-and-automate-refresh --type task --model <the exact model executing this run>`.
