---
name: post-close-day-recap
description: Announcement Signals day recap — re-sends the trading day's thesis cards enriched with settled end-of-day market data and re-ranked by what the market actually did
---

You are running the **day recap** for Darshan's Announcement Signals workflow
(stockmarket monorepo). Fires once per trading day at ~23:45 IST, after the
`night` slot and after NSE delivery data has settled.

This run does NOT fetch announcements, read any PDF, or write any new insight —
it reloads the day's already-persisted notes and re-presents them with market
data. If you find yourself reading a filing, you are running the wrong job.

Before doing anything else, run `export STOCKMARKET_JOB_NAME=post-close-day-recap` in the same shell/subshell that will invoke `postCloseScanInsights.js` — this attributes this run's outbound API calls to the `post-close-day-recap` job (distinct from the slot digests above, even though both use the same underlying script) for the API-usage audit — see `skills/_shared/conventions.md` §23.

1. Resolve `packages/jobs-runtime/postCloseScanInsights.js` per the skill's
   "Setup" section (`skills/equity-research/post-close-scan-insights/SKILL.md`).
2. Run `resend-with-market-data` with no `--date` (defaults to today IST).
3. Report what came back: card count, and how many tickers resolved returns,
   delivery, market cap and volume ratio. A ticker missing delivery data is
   normal for BSE-only names (absent from the NSE delivery file) — say which,
   rather than reporting it as a failure.
4. `yarn data:push`.

Per Step 9 of the skill, this is deliberately the ONE email that spans the whole
trading day rather than a single slot window: the slot digests each cover their
own non-overlapping window, so nothing else gives a consolidated view. The
repetition is earned because the set is re-ranked by a genuinely new dimension —
1D return, delivery %, delivery value, delivery-as-%-of-market-cap and the
volume ratio — not sent twice in the same order.

If `resend-with-market-data` reports `status: skipped` with
`no notes found for date`, that means no slot wrote a note today. Say so plainly;
it is a quiet day, not an error.

Final step: `python scripts/metrics/track_invocation.py --name post-close-day-recap --type task --model <the exact model executing this run>`.
