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
JOB=$(find /sessions -path '*cowork-jobs/insightValidator.js' 2>/dev/null | head -1)
DATA="$(dirname "$JOB")/data"   # data + .env now live with the jobs in the monorepo
# Data (notes/, delivery_cache/, validation/ ledger+proposals) and .env live in the data dir:
export WI_DATA_DIR="$DATA" WI_NOTES_DIR="$DATA/notes" WI_VALIDATION_DIR="$DATA/validation" \
       IV_CACHE_DIR="$DATA/delivery_cache" COWORK_ENV="$DATA/.env"
```

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
Relay the status; the proposals are logged to `validation/proposals.md` for your review.
