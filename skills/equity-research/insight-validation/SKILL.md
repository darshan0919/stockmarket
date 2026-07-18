---
name: insight-validation
description: Validate the morning's watchlist insights against the same day's delivery-backed (structural) price action, append a ledger, propose insight-prompt refinements, and email the report. Invoke with defaults for the nightly run, or pass a specific date / a single symbol on demand.
---

# Insight Validation

Thin wrapper over the deterministic companion job `insightValidator.js`. The job does
all the work — NSE delivery parse, structural scoring, sector attribution, ledger
update, propose-only refinements, quality review, and the email. No model judgment is
required for the default run; the refinements it emails are PROPOSALS you review, never
auto-applied.

## Commands & parameters

| Invocation | When |
|---|---|
| `run` (default) | nightly: validate the latest notes file, write ledger + proposals, email |
| `fetch-delivery [DDMMYYYY]` | debug: summarise the NSE delivery file for a date |
| `score <SYMBOL>` | debug: print structural metrics for one NSE symbol |
| `show-ledger` | print accumulated per-category validation stats |
| `validate-gainers [DDMMYYYY]` | debug: run the gainers-signal D+2 follow-up validation on demand for a given source date (default: 2 trading days ago) |

The default nightly behaviour is exactly `run` with no arguments (it auto-selects the
latest notes file and skips files already validated). `run` now ALSO performs the
gainers-signal follow-up validation below as part of its normal execution — it is not a
separate manual step.

`run` also accepts two optional flags (defaults shown match today's behavior — a one-off
change of either no longer needs a new script):
- `--baseline-days <n>` (default `20`) — price/delivery baseline lookback window.
- `--sector-mcap-floor <cr>` (default `300`) — ₹cr market-cap floor for the sector
  universe used in attribution. Cached sector-context files are keyed by this value, so
  overriding it never silently reuses a cache built with a different floor.

## Gainers-signal follow-up validation (D+2)

In addition to validating watchlist notes, every `run` also validates `gainers-signal`'s
HIGH-conviction picks from 2 trading days ago against that date's D+2 (today) price
action:

- Loads `sourceDate`'s `gainer` events from the events collection (`db.find('events', {type:'gainer', date: sourceDate})`), filters to
  where `conviction === "HIGH"`.
- For each, fetches D and D+2 close price + delivery% (via this job's existing NSE
  delivery helpers) and computes the D+2 close-to-close return.
- **Validated** = D+2 return is positive AND exceeds `GAINERS_VALIDATION_MIN_GAIN_PCT`
  (default **+3%**, a tunable constant in `insightValidator.js`). Delivery% is only an
  annotation (`deliveryTrend: rising/falling/flat`), never a hard gate.
- Also does a best-effort, qualitative hindsight review of whether the originally
  assigned `primary_driver` (e.g. `SECTOR_CATALYST`) still looks right, using whatever
  sector/peer data is already in the source `insights.json`.
- Results are written to `the validation collection (`data/validation.json`, type=`gainers-followup`)` — each record follows
  the DTO standard (`skills/tooling/output-dto-standard/SKILL.md`): `companyId`,
  `creationTime`, `modifiedTime`, `creator: "insight-validation"`, plus
  `sourceDate`, `validationDate`, `conviction`, `d2Return`, `deliveryTrend`, `validated`,
  `categorizationNote`.
- A summary section ("🎯 Gainers-Signal Follow-up Validation (D+2)") is folded into the
  same nightly validation email, as an additional section alongside the existing
  watchlist-notes validation report.
- Can also be run standalone via `validate-gainers [DDMMYYYY]` for debugging/backfill.

This skill's outputs (the `validation` collection, `data/validation.json`, types
`ledger`/`gainers-followup`) conform to the DTO standard in
`skills/tooling/output-dto-standard/SKILL.md`.

## Setup

```bash
JOB=$(find /sessions -path '*packages/jobs-runtime/insightValidator.js' -not -path '*/node_modules/*' 2>/dev/null | head -1)
RUNTIME=$(dirname "$JOB")   # …/packages/jobs-runtime
```

Do NOT export `WI_DATA_DIR` / `IV_CACHE_DIR` / `COWORK_ENV` — the job resolves everything
itself: data (notes/, delivery_cache/, validation/ ledger+proposals) defaults to
`<repo>/data/` and secrets to `<repo>/.env`. Exporting paths derived from fragile
`find`s is what previously scattered `notes/` and `validation/` at the repo root.

## Run

Default (nightly):
```bash
node "$JOB" run
```

On-demand examples:
```bash
node "$JOB" score SWARAJENG          # structural read for one symbol
node "$JOB" fetch-delivery 27062026  # did NSE publish that day's delivery file?
node "$JOB" show-ledger              # accumulated stats
node "$JOB" run --baseline-days 40 --sector-mcap-floor 500   # one-off wider baseline/universe
```

## Output

`run` prints a status object (`insights`, `deliveryConfirmed`, `proposals`,
`qualitySuggestions`, `email`) and emails the full validation + quality-review report.
Relay the status; the proposals are logged to `data/assets/validation-proposals.md` for
your review.

## Offload & cleanup (MANDATORY, even on failure)

```bash
node "$RUNTIME/scripts/data.js" push
```
Idempotent push of everything under `data/` to Google Drive (`StockMarket/data/v2`).
Push-only: local files are KEPT (full mirror), nothing is deleted. The skill is NOT complete until this has run. Generated data belongs ONLY under `data/`; if the sync fails, report it and retry later.

- **Files-touched manifest (docs/DATA_RULES.md §7):** end the run by listing every file created/modified — collections with record counts (db.js helper stats / `db.touchedFiles()`), plus `runs/`/`cache/`/`assets/` files (`StorageService.touchedFiles()`), plus the `data:push` `↑ <file>` lines. A run that stored data without reporting what it touched is incomplete.
