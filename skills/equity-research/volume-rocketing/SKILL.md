---
name: volume-rocketing
description: Daily volume-surge signal — sibling to gainers-signal. Pulls the Stockscans "Volume Rocketing" scan (Volume >= 2.5x its own 5D SMA, Market Cap >= 300 Cr, Returns 1D >= 1, sorted desc by Volume), skips any name already covered by that day's gainers-signal run, takes the next 20 names, then runs the identical quality-filter + delivery + announcements + classifier + email pipeline gainers-signal uses (ACT/WATCH/NOTED tiering, conviction, sector clusters, top-20 trigger research). Invoke with defaults for the 8 AM run (after gainers-signal), or pass a specific market date on demand.
---

# Volume Rocketing Signal

**Same actionability bar as gainers-signal, different entry filter.** Gainers-signal
finds names moving on PRICE; volume-rocketing finds names moving on VOLUME — a 2.5x
surge over the name's own trailing 5-day average, which price alone can miss (a stock
up only 3% can still be seeing 4x its normal volume, and that's often the earlier
tell). The two scans overlap heavily in practice, so this skill exists specifically
to find the volume-driven names gainers-signal's price-sort left behind, not to
duplicate its picks under a different banner — see "Step 1 — dedupe" below.

Everything downstream of Step 1 (quality filters, delivery, announcements, concall
sentiment, classification, tiering, top-20 trigger research, email) is byte-identical
logic to `gainers-signal`, reused via its `packages/jobs-runtime/gainersScanner.js`
and `packages/jobs-runtime/lib/gainersClassifier.js` `main()` functions — this skill
supplies only the universe fetcher and the filename/event-type/creator labels. Read
`skills/equity-research/gainers-signal/SKILL.md` for the full explanation of every
field, threshold, and design decision below; this file only calls out what's
different.

## Parameters (optional)

| Param     | Default          | Meaning                                                       |
| --------- | ---------------- | ------------------------------------------------------------- |
| `date`    | last trading day | market date (`--date YYYY-MM-DD`) for the scanner             |
| `email`   | on               | set off to build the briefing without sending                 |

`--top-n` is fixed at 20 by design (see Step 1) — not exposed as a CLI override the
way gainers-signal's is, since the count is a dedupe outcome, not a raw universe size.

## Ordering — run this AFTER gainers-signal for the same market date

The dedupe in Step 1 reads that day's `gainers_raw_{YYYYMMDD}.json`. If gainers-signal
hasn't run yet for the date, this skill still runs (a missing file means an empty
exclusion set, not a failure) but will not be able to skip names gainers-signal would
otherwise also report — say so explicitly in that day's briefing if `gainers_raw_*`
was missing at run time.

## Setup

```bash
SCAN=$(find /sessions -path '*packages/jobs-runtime/volumeRocketingScanner.js' -not -path '*/node_modules/*' 2>/dev/null | head -1)
RUNTIME=$(dirname "$SCAN")   # …/packages/jobs-runtime
WI="$RUNTIME/watchlistInsights.js"
```

Do NOT export data-path env vars — same rule as gainers-signal: data root defaults to
`<repo>/data/`, secrets to `<repo>/.env`.

## Step 1 — Scanner (Node, deterministic)

```bash
node "$SCAN"                          # add `--date YYYY-MM-DD` to override the market date
```

Writes `data/runs/volume_rocketing_raw_{YYYYMMDD}.json`. Internally this calls
`gainersScanner.main()` with a `universeFetcher` that:

1. Calls `gainersScanner.fetchVolumeRocketing(client)` — a `POST
   /api/company/scans/run` against Stockscans scan id `50f6d1a6f885626f8244a239`
   ("Volume Rocketing": `Volume >= 2.5 * Volume SMA 5D` AND `Market Capitalization >=
   300` AND `Returns 1D >= 1`), `orderBy: 'Volume', order: 'desc'` — results arrive
   pre-sorted by the API, no local re-sort needed.
2. Loads `gainers_raw_{YYYYMMDD}.json` (same market date) and builds the set of
   tickers gainers-signal already picked that day.
3. Walks the sorted Volume Rocketing rows in order, skipping any ticker in that set,
   and takes the first 20 that remain. **This is a straight skip-and-continue down the
   sorted list, not a re-sort or re-rank** — a name that's #3 by volume but already in
   gainers-signal's output is simply passed over; the name at #4 moves up to fill the
   slot, preserving the API's own volume ordering for everyone else.

The auth mechanism (Stockscans `authtoken` cookie) is `gainersScanner.js`'s existing
`StockscansAuth` — `client.runScan()` already attaches it; nothing new to configure.

From here (quality filters at Mcap >= 300 Cr / delivery >= ₹5 Cr / retail stake >= ₹50
Cr, price history, per-symbol delivery, 7-day announcements, concall sentiment,
industry clusters) this IS `gainers-signal`'s Step 1e onward, unmodified — see that
skill's SKILL.md for what each of those does and why. If it yields 0 candidates
(holiday, API issue, or gainers-signal already covered everything volume-surging that
day), send a "no incremental volume-rocketing signals today" email and stop — that
last case is a legitimate, non-alarming outcome worth stating plainly, not padding.

## Step 2 — Classifier (Node, deterministic, no API)

```bash
node "$RUNTIME/lib/volumeRocketingClassifier.js"
```

Thin wrapper around `gainersClassifier.js`'s `main()` — identical ACT/WATCH/NOTED
tiering, conviction scoring, streak tracking (own event type, see below, so a
volume-rocketing streak and a gainers-signal streak for the same company are tracked
independently — they're different triggers and shouldn't silently merge), sector
clusters, and novelty assessment. Only the labels differ:

- reads `volume_rocketing_raw_{YYYYMMDD}.json`
- writes events with `type: "volume-rocket"` (not `"gainer"`) and `creator:
  "volume-rocketing"`
- writes `data/runs/volume_rocketing_insights_{YYYYMMDD}.json` (the DTO — envelope
  per `skills/tooling/output-dto-standard/SKILL.md`: `companyId`, `creationTime`,
  `modifiedTime`, `creator: "volume-rocketing"` on every signal record)
- writes `data/runs/volume_rocketing_research_seed_{YYYYMMDD}.json` (top-20 seed for
  Step 4, same selection rule as gainers-signal: top-10 by delivery %, top-10 by
  delivery ₹ Cr excluding the first list)

## Step 3 — Compose & send the email (your judgment)

Same structure, tone, and rules as gainers-signal Step 3 (front-loaded, tiered,
explained/unexplained/mismatched linkage discipline, `stockscansLink()` for every
name, dark-theme inline-CSS HTML) — read that skill's Step 3 in full and apply it
here unchanged, with two differences:

- Subject: `Volume Rocketing Signal — {market_date}`.
- Lead sentence should say how many names were skipped as gainers-signal dupes (e.g.
  "18 volume-surge names today; 6 already covered by this morning's Gainers Signal,
  20 fresh ones below") — this is the number that makes clear the skill is adding
  incremental coverage, not just re-labelling the same list.

Send the same way (`emailService.js` via `loadEnv()` first, same mailer helper).

## Step 4 — Top-20 trigger research (MANDATORY, your judgment)

Identical to gainers-signal Step 4, reading
`volume_rocketing_research_seed_{YYYYMMDD}.json` instead. Save DTOs with `creator:
'volume-rocketing'`, `type: 'volume-rocketing-trigger-research'`.

## Step 5 — Offload & cleanup (MANDATORY, even on failure)

```bash
yarn data:push
```

Same as gainers-signal — idempotent push, push-only, never delete.

## Rules

- Do NOT re-fetch or re-compute — both scripts did that, same discipline as
  gainers-signal.
- Files-touched manifest at the end of the run (`docs/DATA_RULES.md` §7).
- Never report a name gainers-signal already reported that day — the dedupe in Step 1
  is load-bearing, not a nice-to-have; if it silently fails (e.g. `gainers_raw_*`
  missing), say so in the email rather than letting duplicate coverage pass unremarked.
- Detail scales with tier, linkage is always explained/unexplained/mismatched, concall
  sentiment is corroborating not standalone — same rules as gainers-signal, unchanged.
