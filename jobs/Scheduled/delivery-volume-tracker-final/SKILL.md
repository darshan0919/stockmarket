---
name: delivery-volume-tracker-final
description: Intraday delivery-vs-traded-volume snapshot and hourly breakdown email report for Darshan's portfolio watchlist (Slot 8: 17:25 IST - Final NCL Settlement, weekdays only).
---

## Context

Tracks whether portfolio price moves are delivery-backed (real buying/selling) or
likely intraday/algo churn. Runs 8x/day across the session on weekdays (10:25, 11:25, 12:25,
13:25, 14:25, 15:25, 16:25, 17:25 IST), all via the SAME companion script in
`snapshot-then-report` mode: each slot captures live NSE data for every stock in
Stockscans watchlist `838b3f7ec88e17ba127ba8a3`, persists one snapshot record per
stock, builds the cumulative hourly breakdown table from all of today's snapshots,
and emails the updated report to Darshan.

## Output DTO / Storage

NSE's live intraday symbol-data snapshot is NOT re-fetchable after the fact for a
past timestamp (live/mutating endpoint, not an archive) — non-regenerable, so it
is stored as an **events-collection record** (`type: "delivery-snapshot"`, a NEW
`type` on the existing `events-YYYY` store per `docs/DATA_RULES.md` §2 — no new
collection), written via `packages/jobs-runtime/lib/db.js`'s `appendEvents()`.
Each record carries `companyId`, `date`, `slotTime`, `symbol`, `name`, `lastPrice`,
`change`, `pChange`, `tradedQty`, `deliveryQty`, `deliveryPct`, plus the standard
envelope (`creator: "delivery-volume-tracker"`). No LLM judgment in either mode —
pure fetch/derive/render — so no `modelUsed` is set on these records.

Field semantics for the NSE payload (lastPrice/change/pChange/delivery fields) are
documented in `docs/nse-symbol-data-api.md`.

## Execution Plan — Slot 8 SNAPSHOT + REPORT (17:25 IST)

1. Execute script (bash): `yarn delivery-volume-snapshot-then-report`
   (Fallback: fetch `packages/jobs-runtime/deliveryVolumeTracker.js` from
   `https://raw.githubusercontent.com/darshan0919/stockmarket/main/packages/jobs-runtime/deliveryVolumeTracker.js`
   and run `node deliveryVolumeTracker.js --mode snapshot-then-report` from a clone if the
   local repo path is unavailable.)
2. Read the JSON the script prints — it has two sub-objects:
   - `snapshot`: `companiesFetched`/`companiesTotal`/`errors` for this run's
     own fetch.
   - `report`: `companiesReported`, `snapshotRecordsUsed`, and the `email` status
     (`sent`/`skipped`/`error`). If `email.status` is "error" or
     "skipped", surface the exact reason.
3. If the script exits non-zero, surface the exact error rather than silently
   treating it as done.
4. Files-touched manifest: report the top-level `touchedFiles` (union of the
   snapshot and report sub-steps' writes — normally just `events-<year>.json`).
5. (FINAL STEP ALWAYS) Execute:
   `python scripts/metrics/track_invocation.py --name delivery-volume-tracker --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`

Do NOT run any logic, calculations, data fetching, filtering, sorting, or file
modifications directly — your only job is to orchestrate the script above and
report its output.

## Flags reference (companion script)

| Flag             | Default                    | Meaning                                         |
| ---------------- | -------------------------- | ----------------------------------------------- |
| `--mode`         | `snapshot-then-report`     | `snapshot`, `report`, or `snapshot-then-report` |
| `--watchlist-id` | `838b3f7ec88e17ba127ba8a3` | Stockscans watchlist to snapshot                |
| `--date`         | today (IST)                | market date to report on                        |
| `--to`           | `djplearner@gmail.com`     | report-mode email recipient                     |
| `--job`          | `delivery-volume-tracker`  | API-usage-audit job name (conventions §23)      |
| `--no-email`     | off                        | report mode: compute + print, skip sending      |
| `--env-file`     | repo-root `.env`           | explicit env file path                          |
