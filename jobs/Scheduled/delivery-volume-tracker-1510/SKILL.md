---
name: delivery-volume-tracker-1510
description: Intraday delivery-vs-traded-volume snapshot for Darshan's portfolio watchlist (Slot 6: 15:10 IST) — captures NSE price/traded-qty/delivery-qty per stock.
---

## Context

Tracks whether portfolio price moves are delivery-backed (real buying/selling) or
likely intraday/algo churn. Runs 7x/day, all via the SAME companion script in two
modes: 6 "snapshot" runs (10:10, 11:10, 12:10, 13:10, 14:10, 15:10 IST) each fetch
live NSE data for every stock in Stockscans watchlist `838b3f7ec88e17ba127ba8a3`
and persist one record per stock; the 7th "report" run (16:10 IST) reads back all
of today's snapshot records, builds the hourly breakdown table, and emails it.

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

## Execution Plan — Slot 6 SNAPSHOT Run (15:10 IST)

This is Slot 6 of the 7-run daily cycle (Slots 1–6 snapshot at 10:10, 11:10, 12:10,
13:10, 14:10, 15:10; Slot 7 snapshots and reports at 16:10).

1. Execute script (bash): `yarn delivery-volume-snapshot`
   (Fallback: fetch `packages/jobs-runtime/deliveryVolumeTracker.js` from
   `https://raw.githubusercontent.com/darshan0919/stockmarket/main/packages/jobs-runtime/deliveryVolumeTracker.js`
   and run `node deliveryVolumeTracker.js --mode snapshot` from a clone if the
   local repo path is unavailable.)
2. Read the JSON the script prints to stdout and report: `companiesFetched` /
   `companiesTotal`, and the full `errors` array if non-empty (name the specific
   symbol that failed, not just "something failed").
3. If the script exits non-zero, surface the exact error in your report.
4. Files-touched manifest (per `docs/DATA_RULES.md` §7): report `touchedFiles`
   from the script's JSON output (this run's data-root writes — normally just
   `events-<year>.json`).
5. (FINAL STEP ALWAYS) Execute:
   `python scripts/metrics/track_invocation.py --name delivery-volume-tracker --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`

Do NOT run any logic, calculations, data fetching, or file modifications
directly — your only job is to orchestrate the script above and report its
output.

## Flags reference (companion script)

| Flag             | Default                    | Meaning                                         |
| ---------------- | -------------------------- | ----------------------------------------------- |
| `--mode`         | `snapshot`                 | `snapshot`, `report`, or `snapshot-then-report` |
| `--watchlist-id` | `838b3f7ec88e17ba127ba8a3` | Stockscans watchlist to snapshot                |
| `--date`         | today (IST)                | market date to report on (report mode only)     |
| `--to`           | `djplearner@gmail.com`     | report-mode email recipient                     |
| `--job`          | `delivery-volume-tracker`  | API-usage-audit job name (conventions §23)      |
| `--no-email`     | off                        | report mode: compute + print, skip sending      |
| `--env-file`     | repo-root `.env`           | explicit env file path                          |
