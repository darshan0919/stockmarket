---
name: document-preprocessing
description: Drain the filing pre-processing queue — turn newly-filed documents into verified, page-anchored Filing Extracts so the daily scan skills reason over JSON instead of re-reading PDFs.
---

Follow the `document-preprocessor` skill
(`stockmarket/skills/equity-research/document-preprocessor/SKILL.md`) — read it
from the local mounted repo path first.

**This job needs no heavy reasoning model.** Every step is transcription against
a rigid schema, verified by a script. Schedule it on the cheapest agent
available; it is written specifically so that is safe. If a future change to a
profile makes real judgment necessary, that is a signal the profile has drifted
across the line the skill describes — fix the profile, don't upgrade the model.

```bash
yarn preprocess:queue next --limit 60 --batch-size 20
# read each document via `read-pdf-with-meta`, fill its profile schema
cat extracts.json | yarn preprocess:persist
yarn preprocess:queue commit     # ONLY if every batch completed cleanly
yarn data:push
```

## Cadence

Run every 30 minutes between 09:00 and 23:30 IST, with guaranteed passes at
12:30, 15:20, **18:40** and 21:15 — each ~30 minutes ahead of a
`post-close-scan-insights` slot.

**18:40 is the load-bearing one.** 48% of a day's filings land in the window the
19:15 post-close slot covers, including the densest 30-minute bucket of the day.
A missed pass there costs that night's coverage; every other row is redundancy.

## What to report, and what to actually flag

Report `stats` verbatim, plus the persist step's `l1RejectionRatePct`.

- **`scanSource` other than `live`** — the universe came from a stale cache or
  the frozen fallback. Say so prominently; a silently stale universe makes the
  run's absences meaningless.
- **`l1RejectionRatePct` above ~1%** — quotes are failing to match the source
  text, which means the extraction prompt is drifting toward paraphrase. This is
  the single most important number this job produces, because it is the earliest
  detectable sign that the corpus is filling with unanchored claims. Name the
  rejected documents, don't just report the rate.
- **`stats.profileDisabled`** — documents skipped because their profile has not
  passed its calibration gate. Expect this to be large (~50/day) until the heavy
  profiles are enabled. It is the size of the prize, not a failure; say which
  profiles are still gated.
- **`confidence: low` share** — L1 skipped (source text not cached) or L2 raised
  a bound issue. A rising share means consuming skills are getting leads where
  they expect facts.
- **A run that errored** — say plainly that `commit` was skipped and the window
  stays pending. Do not commit to "tidy up"; that permanently drops the
  unprocessed documents.

## Enabling a new profile

Procedure: [`docs/CALIBRATION_RUNBOOK.md`](../../../docs/CALIBRATION_RUNBOOK.md).
`stats.shadowQueued` counts documents extracted for calibration only — they are
invisible to every consuming skill until the profile is promoted.

Only `announcement` is enabled by default (`PREPROCESS_PROFILES`). Adding
`result`, `transcript`, `ppt` or `annual_report` requires TWO steps, both
mandatory: passing that profile's calibration gate, then
`yarn preprocess:backfill --days <however long it was gated> --profile <p>`
followed by `yarn baselines:build`. Without the backfill, everything filed while
the profile was gated stays permanently behind the cursor — see the skill's
Step 5. The gate itself is — `yarn preprocess:calibrate plan|score`, threshold ≥98%
numeric agreement and zero sign flips. The gate is enforced in code; do not work
around it by editing the env var without running the scoring step.

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`):
execute `python scripts/metrics/track_invocation.py --name document-preprocessing --type task --model <the exact model executing this run>`,
and set that same string as `runnerModel` on every extract this run persists —
it is how a later calibration failure can be traced to the model that produced it.
