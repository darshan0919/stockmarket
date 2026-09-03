# Slot schedule, cursor semantics, and the `createdAt` timezone

Reference for `post-close-scan-insights`. Read this when changing slot times,
debugging a window that looks too wide or too narrow, or before "fixing" the
`createdAt` parsing again.

## Slot schedule

The raw per-bucket figures live beside this file in
`announcement-timing-heatmap.json`, with the sampling caveats in its `_meta`
block — regenerate it before changing slot times rather than arguing from this
summary alone.

Derived from a 6,750-announcement unfiltered sample (2026-08-31 to 2026-09-03,
four full trading days, Mon-Thu), fetched with no filters so the shape is the
market's, not this scan's. Share of a day's filings by IST session:

| Window                     |     Share | Avg filings/day (unfiltered) |
| -------------------------- | --------: | ---------------------------: |
| Overnight 00:00-09:15      |      1.4% |                           24 |
| Session 09:15-15:30        |     20.6% |                          347 |
| **Post-close 15:30-19:00** | **48.4%** |                      **816** |
| Evening 19:00-21:30        |     19.0% |                          320 |
| Night 21:30-24:00          |     10.7% |                          180 |

Within that, filing volume ramps monotonically through the session (09:30 is
near-dead, 15:00-15:30 is the intraday peak), spikes hard at **18:30-19:00**
(11.4% of the entire day in one 30-minute bucket — the single densest slot),
has a secondary spike at **21:30** (5.2%), and is 98.5% complete by 22:30.

The slots follow that shape — each fires just AFTER a dense block, so it
collects a full cluster rather than cutting one in half:

| Slot           | IST                    | Covers                                      | ~Share of day |
| -------------- | ---------------------- | ------------------------------------------- | ------------: |
| `mid-session`  | 13:00                  | overnight + morning                         |          ~12% |
| `late-session` | 15:45                  | midday + pre-close ramp                     |          ~11% |
| `post-close`   | 19:15                  | **the 15:30-19:00 peak**                    |          ~48% |
| `night`        | 21:45                  | evening + 21:30 spike                       |          ~19% |
| — day recap —  | 23:45                  | whole day, re-ranked by settled market data |             — |
| validation     | next trading day 20:00 | prior day's theses vs actual price action   |             — |

`post-close` is the load-bearing run. If only one slot can run on a given day,
it is that one.

**A `pre-open` slot (≈09:00) is deliberately NOT scheduled, and the reason is
worth keeping.** Only 1.4% of filings land 00:00-09:15, and the `night` slot
already reaches 21:45, so a pre-open run would find roughly one filtered
announcement a day. That is a bad trade on run cost — but it is the _cheapest
possible_ run and its payoff is asymmetric, since a filing seen before the
open is the only kind you can still act on at the open. The slot exists as a
`--slot pre-open` option for exactly that reason; turn it on if a genuinely
market-moving overnight filing is ever missed, and record the instance here so
the decision is revisited on evidence rather than re-argued from scratch.

### One cursor, many slots

All slots share ONE resumable cursor
(`cache/post-close-scan-insights-cursor.json`, via the shared
`packages/jobs-runtime/lib/windowCursor.js`). `--slot` is a label that steers
the email subject and header; it does not scope the cursor.

This is the whole answer to "avoid rework, capture everything, don't repeat
yourself in the emails," so it's worth being precise about why:

- **Capture everything.** `fetch-scan` resolves its cutoff as the LATER of the
  trading-day floor (last real trading day's 3:30 PM close, walked back over
  weekends and NSE holidays by `lib/tradingCalendar.js`) and the
  last-committed cursor. Consecutive slots therefore tile the day with no gaps
  — the 19:15 run starts exactly where the 15:45 run stopped.
- **No rework.** Because the windows don't overlap, an announcement is fetched
  once, its PDF read once, and judged once. Per-item dedup (`alreadyProcessed`,
  `mark-processed`) is still there as a backstop, but by the time per-item
  dedup fires you have already paid for the PDF read and the model call whose
  output you are about to throw away. The cursor avoids paying at all.
- **No repetition in the emails.** Each slot's digest renders its own window's
  notes. `send-digest` merges cached notes since the resolved cutoff — which,
  with a committed cursor, IS the slot boundary — so a card that appeared in
  the 15:45 email does not reappear at 19:15.
- **Per-slot cursors would break all three.** Each would independently reach
  back to the trading-day floor and re-cover ground its siblings already
  handled. That is precisely the rework the cursor exists to prevent.

**Commit rules (unchanged, and strict):** call `commit-window` ONLY after a run
is confirmed healthy — `send-digest` succeeded, or with `email` off, all of
Step 4's `add-note`/`mark-processed` calls completed cleanly. Never commit
after a partial failure: an uncommitted cursor just means the next slot's
window is wider (safe, and deduped), while a wrongly-committed one permanently
drops whatever didn't get processed, because the next window no longer reaches
back far enough to see it. If a slot is missed entirely, the next slot absorbs
it automatically (its floor still reaches the last close); only a gap longer
than that needs an explicit `--window-hours` catch-up, still followed by
`commit-window`. A cursor stale beyond 30 days is a hard error, not a silent
backfill.

**Weekend and holiday handling** is in the trading-day floor, not the cursor:
`lib/tradingCalendar.js` (`lastTradingDayOnOrBefore`) walks back over both
weekends and NSE trading holidays, sourced from NSE's public holiday-master
API and cached per-year at `data/cache/trading-holidays-<year>.json`,
refreshed when older than 7 days. It **fails open** — if the fetch fails with
no usable cache, every day is treated as tradable rather than erroring the run.
Check for `[tradingCalendar]` warnings if a Monday or post-holiday digest ever
looks thin.

### `createdAt` is IST — do not "fix" this again

The Stockscans `announcements/scan` API returns `createdAt` as a bare ISO
datetime with no zone marker. **It is IST.** A 2026-08-31 change concluded it
was UTC and parsed it that way; that was wrong, and re-verified as wrong on
2026-09-04 against a 1,014-announcement sample, three independent ways:
`createdAt`'s own date matches the API's separate `date` field on 99.9% of rows
(20% under the UTC reading); the newest `createdAt` was 2h11m in the _future_
relative to wall-clock UTC (impossible); and only the IST reading puts filing
activity in the 09:00-01:00 IST band an Indian exchange feed actually has —
the UTC reading claims the market files nothing during its own session.

Parsing IST as UTC shifted every announcement 5.5 hours later than reality,
which against a "since last close" cutoff is over-inclusive rather than lossy
— which is why it produced no visible symptom and survived. It matters now
because slot windows are hours wide, not a day wide: at that scale a 5.5-hour
error puts announcements in the wrong slot entirely and makes the cursor's
"everything up to here is handled" claim false. Fixed in `parseAnnDateToUtc`,
with the full evidence recorded there.
