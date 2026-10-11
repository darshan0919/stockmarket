---
name: mtf-flush-daily
description: MTF Flush Daily — Shashank's MTF flush-out + rejection-wick entry (back-tested rule G4), scored 0-100 and tiered A/B/C, signal-ledger + scored email for NEW signals
---

## Context

Script-only entry detector built from Shashank's (X: Shashank1171) MTF flush-out calls; rule, evidence and caveats in `docs/mtf-flush-signal/SPEC.md`. Data: indiamtf.com per-scrip daily NSE+BSE funded-book CSVs (third-party aggregator of the exchange disclosures, one session lag; attribution "IndiaMTF.com, from NSE/BSE disclosures"), NSE bhavcopy (120-session universe rank) and NSE daily candles. Gates: book ≥ ₹20 Cr; shares financed −15% over 10 sessions; lower wick ≥ 40% of range; close > 50-DMA; close within −6%/+3% of EMA20; leader (120d rank ≥ 0.6 and ≤ 25% off the 250d high). Corporate-action days invalidate the window.

Scoring (0-100, ASSUMPTION weights, ranking aid only): flush depth 25, depth vs 60d peak 15, wick 20, leadership 15, location 10 (normalised). Tier A = all gates and score ≥ 70; B = all gates; C = near-miss (exactly one soft gate — wick or location — missed; not back-tested). Email goes out only when there are NEW signals (ledger: A/B = `entry-ready`, C = `detected`; 5 missed runs invalidate, acting as the cooldown).

Edge is small (median 20d excess ≈ +1% vs median stock, hit ≈ 56-58%, ~26 variants tried, no costs). Storage (DATA_RULES): `signal-ledger` + `signal_transition` events, one `mtf_flush_scan` event per day in `events`, disposable rolling cache `cache/mtf-flush-book.json` (self-bootstraps ~25 s). Creator: `mtf-flush`.

Suggested slot: weekdays 22:50 IST (indiamtf publishes ~22:05 IST; ≥60 min after the 21:45 ledger writers `technical-setups-daily`/`market-regime-daily`). Run once per evening.

## Execution Plan

Call the following exact scripts, in order:

1. `export STOCKMARKET_JOB_NAME=mtf-flush-daily`
2. Execute script (bash): `yarn mtf-flush-daily` (`--dry-run` previews with no writes/email; `--always-email` forces a mail)
3. Execute script (bash): `yarn workspace @stock/jobs-runtime data:push`
4. Report from the JSON of step 2: signal date, stage-1 count vs 20-session median, tiers A/B/C with scores, `fetchErrors`/`excluded` (a failed fetch is skipped, never counted as a miss), email status and the `filesTouched` manifest.

If step 2 exits non-zero (e.g. "book cache ends … expected …" = indiamtf has not yet published the session), surface the exact error and do not retry more than once after 30 minutes. Do NOT run any logic, fetching or calculations directly.

Final step (every run): `python scripts/metrics/track_invocation.py --name mtf-flush-daily --type task --model <exact model>`. No `modelUsed` — purely scripted.
