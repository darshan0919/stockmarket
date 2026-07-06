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

The default nightly behaviour is exactly `run` with no arguments (it auto-selects the
latest notes file and skips files already validated).

## Setup

```bash
JOB=$(find /sessions -path '*packages/jobs-runtime/insightValidator.js' -not -path '*/node_modules/*' 2>/dev/null | head -1)
RUNTIME=$(dirname "$JOB")   # …/packages/jobs-runtime
```

Do NOT export `WI_DATA_DIR` / `IV_CACHE_DIR` / `COWORK_ENV` — the job resolves everything
itself: data (notes/, delivery_cache/, validation/ ledger+proposals) defaults to
`<repo>/jobs/data/` and secrets to `<repo>/.env`. Exporting paths derived from fragile
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
```

## Output

`run` prints a status object (`insights`, `deliveryConfirmed`, `proposals`,
`qualitySuggestions`, `email`) and emails the full validation + quality-review report.
Relay the status; the proposals are logged to `jobs/data/validation/proposals.md` for
your review.

## Offload & cleanup (MANDATORY, even on failure)

```bash
node "$RUNTIME/scripts/offloadToDrive.js"
```
Syncs everything under `jobs/data/` to Google Drive (`StockMarket/jobs/v1`) and wipes the
local cache. The skill is NOT complete until this has run. Never leave generated data
files in the repo (root or `jobs/data/`) or in the session workspace; if the sync fails,
report it — the script deliberately keeps the local cache in that case.
