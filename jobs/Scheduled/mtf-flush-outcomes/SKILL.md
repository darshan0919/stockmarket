---
name: mtf-flush-outcomes
description: MTF Flush Outcomes — weekly realised 5/10/20-session returns of every mtf-flush-daily signal by tier, written as mtf_flush_outcome events and emailed when new signals mature
---

## Context

Calibration loop for `mtf-flush-daily` (rule and caveats: `docs/mtf-flush-signal/SPEC.md`). Purely scripted: reads `mtf_flush_scan` events, fetches NSE daily candles for each signalled stock and NIFTYBEES, computes returns from the NEXT close after the signal day (the back-test entry), excess vs NIFTYBEES, and 10-session max adverse excursion. A signal is written once as an `mtf_flush_outcome` event when its 20-session window completes (idempotent). Email only when something newly matured: per-tier n, median 20d excess, hit rate.

Do not re-weight the score or conclude A beats B until each tier has 30+ matured signals. Benchmark differs from the back-test (NIFTYBEES vs median eligible stock): compare tiers against each other firmly, levels loosely. Creator: `mtf-flush-outcomes`.

Suggested slot: Saturday 11:40 IST (≥30 min from the 10:04 weekly job; the daily scan event writer runs 22:50).

## Execution Plan

Call the following exact scripts, in order:

1. `export STOCKMARKET_JOB_NAME=mtf-flush-outcomes`
2. Execute script (bash): `yarn mtf-flush-outcomes` (`--dry-run` previews with no writes/email)
3. Execute script (bash): `yarn workspace @stock/jobs-runtime data:push`
4. Report from the JSON of step 2: signals, matured, newlyWritten, pending, per-tier summary, errors, email status and the `filesTouched` manifest.

If step 2 exits non-zero surface the exact error. Do NOT run any logic, fetching or calculations directly.

Final step (every run): `python scripts/metrics/track_invocation.py --name mtf-flush-outcomes --type task --model <exact model>`. No `modelUsed` — purely scripted.
