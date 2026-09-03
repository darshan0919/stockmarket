---
name: volume-rocketing
description: Daily volume-surge signal — sibling to gainers-signal, identical output UX. Pulls the Stockscans "Volume Rocketing" scan (Volume >= 2.5x its own 5D SMA, Market Cap >= 300 Cr, Returns 1D >= 1, sorted desc by Volume), skips any name already covered by that day's gainers-signal run, takes the next 20 names, then runs the identical pipeline: quality filters, dual-axis delivery, market cap, delivery-as-%-of-mcap, 14-day announcements, ACT/WATCH/NOTED tiering, top-20 trigger research, cached rerating-catalysts EPS theses for the top 10 by delivery value, the WHY resolution ladder, and a Thesis Card email sorted by delivery value. Invoke with defaults for the 8 AM run (after gainers-signal), or pass a specific market date on demand.
---

# Volume Rocketing Signal

**Same actionability bar as gainers-signal, different entry filter.**
gainers-signal finds names moving on PRICE; this skill finds names moving on
VOLUME — a 2.5x surge over the name's own trailing 5-day average, which price
alone can miss. A stock up only 3% can still be seeing 4x its normal volume, and
that is often the earlier tell. The two scans overlap heavily in practice, so
this skill exists specifically to surface the volume-driven names
gainers-signal's price sort left behind, not to duplicate its picks under a
different banner — see the dedupe in Step 1.

**Read [`../_shared/scan-signal-pipeline.md`](../_shared/scan-signal-pipeline.md)
in full before running.** It is the source of truth for every step, threshold,
and design decision this skill shares with `gainers-signal`, which is everything
except the universe fetcher and the labels below. The rendered email is
deliberately identical to that skill's, card for card.

## Parameters

| Param   | Default          | Meaning                                           |
| ------- | ---------------- | ------------------------------------------------- |
| `date`  | last trading day | market date (`--date YYYY-MM-DD`) for the scanner |
| `email` | on               | set off to `render` the briefing without sending  |

`--top-n` is fixed at 20 by design (see Step 1) — not exposed as a CLI override
the way gainers-signal's is, since the count is a dedupe outcome, not a raw
universe size.

## Ordering — run this AFTER gainers-signal for the same market date

The dedupe reads that day's `gainers_raw_{YYYYMMDD}.json`. If gainers-signal
hasn't run yet for the date, this skill still runs (a missing file means an
empty exclusion set, not a failure) but cannot skip names gainers-signal would
also report — **say so explicitly in that day's briefing** as a caveat rather
than letting duplicate coverage pass unremarked.

Running second also means the EPS-thesis cache is usually warm: any name in both
scans was briefed by the gainers run an hour earlier, so this run serves it from
cache and both emails carry the identical thesis (shared §Step 6).

## Setup

```bash
SCAN=$(find /sessions -path '*packages/jobs-runtime/volumeRocketingScanner.js' -not -path '*/node_modules/*' 2>/dev/null | head -1)
RUNTIME=$(dirname "$SCAN")                        # …/packages/jobs-runtime
WI="$RUNTIME/watchlistInsights.js"
EMAIL="$RUNTIME/scanSignalEmail.js"
BC=skills/equity-research/rerating-catalysts/scripts/brief_cache.js
```

Do NOT export data-path env vars — same rule as gainers-signal: data root
defaults to `<repo>/data/`, secrets to `<repo>/.env`.

## Run order

Identical to gainers-signal's, with this skill's scanner and classifier:

| Step | What                                               | Where it's documented               |
| ---- | -------------------------------------------------- | ----------------------------------- |
| 1    | `node "$SCAN"`                                     | below, then shared §Step 1          |
| 2    | `node "$RUNTIME/lib/volumeRocketingClassifier.js"` | shared §Step 2                      |
| 3    | read the research seed                             | shared §Step 3                      |
| 4    | top-20 trigger research                            | shared §Step 4                      |
| 5    | **EPS briefs for the top 10**                      | shared §Step 6 — run BEFORE the WHY |
| 6    | WHY resolution ladder                              | shared §Step 5                      |
| 7    | compose content overlay, send                      | shared §Step 7 (+ labels below)     |
| 8    | `yarn data:push`                                   | shared §Step 8                      |

## Step 1 — Scanner and dedupe (what's specific to this skill)

```bash
node "$SCAN"                          # add --date YYYY-MM-DD to override the market date
```

Writes `data/runs/volume_rocketing_raw_{YYYYMMDD}.json`. Internally this calls
`gainersScanner.main()` with a `universeFetcher` that:

1. Calls `gainersScanner.fetchVolumeRocketing(client)` — a
   `POST /api/company/scans/run` against Stockscans scan id
   `50f6d1a6f885626f8244a239` ("Volume Rocketing": `Volume >= 2.5 * Volume SMA
5D` AND `Market Capitalization >= 300` AND `Returns 1D >= 1`),
   `orderBy: 'Volume', order: 'desc'` — results arrive pre-sorted by the API, no
   local re-sort needed.
2. Loads `gainers_raw_{YYYYMMDD}.json` for the same market date and builds the
   set of tickers gainers-signal already picked.
3. Walks the sorted Volume Rocketing rows in order, skipping any ticker in that
   set, and takes the first 20 that remain. **This is a straight
   skip-and-continue down the sorted list, not a re-sort or re-rank** — a name
   that's #3 by volume but already in gainers-signal's output is simply passed
   over; #4 moves up to fill the slot, preserving the API's own volume ordering
   for everyone else.

Auth is `gainersScanner.js`'s existing `StockscansAuth` (`client.runScan()`
attaches the `authtoken` cookie) — nothing new to configure.

From here everything is `gainers-signal`'s Step 1e onward, unmodified. If the
scan yields 0 candidates — holiday, API issue, or gainers-signal already covered
everything volume-surging that day — send a "no incremental volume-rocketing
signals today" email and stop. That last case is a legitimate, non-alarming
outcome worth stating plainly, not padding.

**The ⚡ Vol 2.5x badge is suppressed in this skill's email.** It is
definitionally true of every name here, so pass `volumeRocketing: false` in the
content overlay rather than decorating every row with the same uninformative
badge. On a gainers card the same badge is real independent confirmation, which
is why that skill keeps it.

## Step 2 — Classifier

```bash
node "$RUNTIME/lib/volumeRocketingClassifier.js"
```

A thin wrapper around `gainersClassifier.main()` — identical tiering, conviction
scoring, streaks, clusters, novelty, and the delivery-value sort. Only the labels
differ:

| Thing             | Value                                            |
| ----------------- | ------------------------------------------------ |
| raw file          | `volume_rocketing_raw_{YYYYMMDD}.json`           |
| insights DTO      | `volume_rocketing_insights_{YYYYMMDD}.json`      |
| research seed     | `volume_rocketing_research_seed_{YYYYMMDD}.json` |
| event type        | `volume-rocket`                                  |
| creator           | `volume-rocketing`                               |
| research DTO type | `volume-rocketing-trigger-research`              |
| email title       | `Volume Rocketing Signal`                        |
| subject           | `Volume Rocketing Signal — {market_date}`        |

Streaks use this skill's own event type, so a volume-rocketing streak and a
gainers-signal streak for the same company are tracked independently — they are
different triggers and shouldn't silently merge.

## Step 7 — Email specifics

Everything in shared §Step 7 applies. Two additions:

- The lead sentence states how many names were skipped as gainers-signal dupes
  (e.g. "18 volume-surge names today; 6 already covered by this morning's
  Gainers Signal, 12 fresh ones below"). This is the number that makes clear the
  skill is adding incremental coverage rather than re-labelling the same list.
- Pass `dedupedFromGainers` in the stats footer JSON so that number is also
  visible as a tile.

## Step 4 research DTO

Same shape as gainers-signal's, with `creator: 'volume-rocketing'` and
`type: 'volume-rocketing-trigger-research'` — see that skill's Step 4 section
for the field-by-field notes, which apply unchanged.

## Rules

Everything in the shared doc's Rules section applies unchanged, plus one:

- **Never report a name gainers-signal already reported that day.** The dedupe
  in Step 1 is load-bearing, not a nice-to-have. If it silently fails (e.g.
  `gainers_raw_*` missing), say so in the email as a caveat.
