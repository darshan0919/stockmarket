---
name: results-history-pack-daily
description: Pre-result history packs — for companies whose result is due in the next 0-3 days (Stockscans Days From Result >= 0, mcap >= 500 Cr), digest any prior concall not yet digested and build the quarterly-result-history pack, so quarterly-result-analysis never generates history at runtime
model: claude-opus-5
---

## Context

Runs `quarterly-result-extractor --mode pre` (its Step 0) across the upcoming-results universe.
Design: `docs/QUARTERLY_RESULT_HISTORY_PACK_PLAN.md`. The only reasoning is the concall digest
(Step 0 B), which Darshan classified **Mission-Critical** (prior guidance, tone/topic baseline,
one-off excuses, catalysts — 2026-10-22). This job therefore runs on the frontier tier. A digest
is written once per call, ever; after a company's first season only its newest call needs one,
so steady state is about one digest per company per quarter.

## Cadence

Daily at 06:41 IST (before market open, so day-0 results that print during/after the session are
still upcoming). No other job writes `concall-digest` or `quarterly-result-history` reports; the
nearest neighbour writing `reports` is `daily-quarterly-result-extraction` (01:00) — over 5 hours
apart.

## Execution Plan

1. `export STOCKMARKET_JOB_NAME=results-history-pack-daily`
2. Execute script (bash): `yarn results-history-pack-universe --max-days 3 --limit 25`
   → `{screened, count, needsDigests, companies[{companyId, daysFromResult, packId, complete}]}`.
   If `count` is 0, skip to step 5 with a one-line "no upcoming results" email.
3. For each company with `complete: false` (soonest result first), follow
   `skills/equity-research/quarterly-result-extractor/SKILL.md` **Step 0 only** (A → B → C):
   - A: `yarn quarterly-result-extractor:pending-digests --companyId <id> --out-dir /tmp/<SAFE>_qrh`
   - B: for each `pending` entry, read its `textPath`, write the digest per
     `skills/equity-research/quarterly-result-extractor/references/call_digest.md`, then
     `yarn quarterly-result-extractor:save-digest --companyId <id> --quarter <YYYYMM> --digest <file> --model <exact model>`.
     On exit 3 fix the listed quotes (verbatim from the text) and re-save; never drop an item
     to make it pass. Skip entries whose `scanned: true` or `error` is set — report them.
   - C: `yarn quarterly-result-extractor:build-pack --companyId <id>`
     For companies already `complete: true`, run only C (refreshes filings and the pre-result
     price set-up; no reasoning).
     If the run is cut short, the remaining companies are simply picked up tomorrow (the window
     overlaps by design and every step is idempotent).
4. Execute script (bash): `yarn data:push`
5. Email (mandatory, see below).
6. Final step: `python scripts/metrics/track_invocation.py --name results-history-pack-daily --type task --model <exact model>`.

Never run Steps 1-4 of the extractor here — the results are not out yet. Do NOT run logic
directly; every deterministic step is a `yarn` script.

## Email delivery (mandatory last step of EVERY run)

The owner reads job output in Gmail, so this job must always end with an email — success, partial or failure, even when there was nothing new (a one-line "nothing to do" email is the heartbeat that proves the job ran).

1. Write the report text — companies packed (with result date), digests written vs pending, verification failures, and the files-touched manifest from the `build-pack` / `data:push` output — as markdown to a temp file _outside the repo_ (`f=$(mktemp)`). Keep it to what matters, lead with the headline.
2. Execute script (bash): `STOCKMARKET_JOB_NAME=results-history-pack-daily yarn job-report-email --job results-history-pack-daily --status <ok|partial|failed> --title "<one-line outcome>" --body-file "$f"`
3. If the run stopped early (a dependency check failed, a script exited non-zero), still run step 2 with `--status failed` and the exact error as the body.
4. If the command exits non-zero (`email.status` is `skipped` or `error`, e.g. `GOOGLE_APP_PASSWORD not set`), surface the exact reason in your final report — never report the job as delivered.
