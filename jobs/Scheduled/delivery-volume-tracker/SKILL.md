---
name: delivery-volume-tracker
description: Intraday delivery-vs-traded-volume snapshot for Darshan's portfolio watchlist — captures NSE price/traded-qty/delivery-qty per stock at each run-slot; the final slot emails the hourly breakdown.
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
documented in `docs/nse-symbol-data-api.md` (written 2026-09-17 alongside this
job) — read it before changing the field-extraction logic in
`packages/jobs-runtime/deliveryVolumeTracker.js`, since some of these are NOT
where the endpoint name would suggest (e.g. `change`/`pChange` live under
`metaData`, not `priceInfo`).

## Execution Plan — Slot 1 SNAPSHOT Run (10:10 IST)

This is Slot 1 of the 7-run daily cycle (Slots 1–6 snapshot at 10:10, 11:10, 12:10,
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

## Flags reference (companion script, both modes)

| Flag             | Default                    | Meaning                                               |
| ---------------- | -------------------------- | ----------------------------------------------------- |
| `--mode`         | `snapshot`                 | `snapshot`, `report`, or `snapshot-then-report`       |
| `--watchlist-id` | `838b3f7ec88e17ba127ba8a3` | Stockscans watchlist to snapshot (snapshot mode only) |
| `--date`         | today (IST)                | market date to report on (report mode only)           |
| `--to`           | `djplearner@gmail.com`     | report-mode email recipient                           |
| `--job`          | `delivery-volume-tracker`  | API-usage-audit job name (conventions §23)            |
| `--no-email`     | off                        | report mode: compute + print, skip sending            |
| `--env-file`     | repo-root `.env`           | explicit env file path                                |

## Notes for future edits

- This is v1 (2026-09-17), one stock (`EMUDHRA`) in the tracked watchlist at
  launch — the script is watchlist-driven, so it scales automatically as more
  stocks are added to `838b3f7ec88e17ba127ba8a3`.
- `docs/nse-symbol-data-api.md` flags an UNRESOLVED discrepancy between
  `tradeInfo.deliveryquantity` (direct field, used here) and the qty you'd get
  by deriving `totalTradedVolume × deliveryToTradedQuantity / 100` (a ~17%
  mismatch in the one live sample captured) — read that doc's caveat before
  trusting a from-scratch derivation elsewhere in the repo.
- If the portfolio watchlist grows large, consider batching NSE calls with
  bounded concurrency (`stock-api/src/utils/concurrency.js`'s
  `mapWithConcurrency`, per `skills/_shared/conventions.md` §16) rather than
  the current sequential per-symbol loop — not needed yet at 1 stock.
