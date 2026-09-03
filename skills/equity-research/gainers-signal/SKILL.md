---
name: gainers-signal
description: Daily gainers ACTIONABILITY signal — pre-compute gainers + quality filters + dual-axis delivery (% and ₹ Cr) + market cap + delivery-as-%-of-mcap + 14-day announcements (scanner), deterministically tier each into ACT / WATCH / NOTED with streaks and delivery-confirmed sector clusters (classifier), research the top-20 triggers from announcement PDFs, attach a cached rerating-catalysts EPS thesis to the top 10 by delivery value, resolve a WHY for every name via the filing → info-classifier → catalyst → concall → sector ladder, then email a Thesis Card briefing sorted by delivery value. Invoke with defaults for the 8 AM run, or pass a specific market date on demand.
---

# Daily Gainers Signal

Finds names moving on PRICE — the top 50 by 1-day return — and decides which of
them are worth acting on.

**Read [`../_shared/scan-signal-pipeline.md`](../_shared/scan-signal-pipeline.md)
in full before running.** It is the source of truth for every step, threshold,
and design decision this skill shares with `volume-rocketing`: the actionability
bar, the two announcement windows, the delivery-value sort, the WHY resolution
ladder, the EPS-thesis cache, the Thesis Card email contract, and the standing
rules. This file covers only what is specific to the gainers scan.

The two skills are intentionally identical from Step 2 onward, including the
rendered email — Darshan reads both back to back most mornings, and two layouts
for one kind of report is friction with no payoff.

## Parameters

| Param     | Default          | Meaning                                            |
| --------- | ---------------- | -------------------------------------------------- |
| `date`    | last trading day | market date (`--date YYYY-MM-DD`) for the scanner  |
| `email`   | on               | set off to `render` the briefing without sending   |
| `--top-n` | `50`             | size of the gainers universe pulled by the scanner |

## Setup

```bash
SCAN=$(find /sessions -path '*packages/jobs-runtime/gainersScanner.js' -not -path '*/node_modules/*' 2>/dev/null | head -1)
RUNTIME=$(dirname "$SCAN")                        # …/packages/jobs-runtime
WI="$RUNTIME/watchlistInsights.js"                # shared I/O runtime (read-pdf, insight-template)
EMAIL="$RUNTIME/scanSignalEmail.js"               # Thesis Card renderer + mailer
BC=skills/equity-research/rerating-catalysts/scripts/brief_cache.js
```

Do NOT export `GAINERS_OUTPUT_DIR` / `WI_DATA_DIR` / `COWORK_ENV` — the scripts
resolve everything themselves (data root `<repo>/data/`, secrets `<repo>/.env`).
Exporting paths derived from fragile `find`s is what previously scattered
`daily_gainers/`, `delivery_cache/` etc. at the repo root.

## Run order

| Step | What                                       | Where it's documented                    |
| ---- | ------------------------------------------ | ---------------------------------------- |
| 1    | `node "$SCAN"`                             | shared §Step 1 (+ scan specifics below)  |
| 2    | `node "$RUNTIME/lib/gainersClassifier.js"` | shared §Step 2                           |
| 3    | read the research seed                     | shared §Step 3                           |
| 4    | top-20 trigger research                    | shared §Step 4 (+ DTO shape below)       |
| 5    | **EPS briefs for the top 10**              | shared §Step 6 — run this BEFORE the WHY |
| 6    | WHY resolution ladder                      | shared §Step 5                           |
| 7    | compose content overlay, send              | shared §Step 7 (+ labels below)          |
| 8    | `yarn data:push`                           | shared §Step 8                           |

Steps 5 and 6 are numbered in the order you RUN them, not the order the shared
doc lists them: rung 3 of the WHY ladder reads the EPS briefs, so the briefs
must exist first.

## What's specific to this scan

**Universe.** The Stockscans gainers scan, server-sorted (`orderBy: 'Returns 1D',
order: 'desc'`), default top 50. Writes
`data/runs/gainers_raw_{YYYYMMDD}.json`.

**API efficiency (the reason this job is minutes, not hours).** The
announcements endpoint **ignores `scan.companyIds`** — verified live, a request
naming two tickers returns unrelated ones. So the scanner creates a throwaway
watchlist holding the whole universe and scans by `watchlistIds`, which DOES
filter server-side and has no 10-company cap (unlike `companyFilters`). That
took the announcement step from thousands of pages to 4-5. The scratch watchlist
is a REAL object in the account and is deleted in a `finally` — if you see
`_gainers_scan_*` watchlists accumulating, the cleanup is failing and should be
investigated. If creation fails the job falls back to a market-wide sweep with a
page cap and marks `announcements_meta.truncated`, so the email can say
"incomplete" rather than "none found".

**Price history runs BEFORE the quality filter.** The gainers scan table has no
`Close` column, and BSE delivery _value_ is derived from a close price. Without
it, BSE names had a null delivery value that sailed straight through the ₹5 Cr
floor — micro-caps delivering ₹0.08 Cr were passing a ₹5 Cr filter and consuming
top-20 research slots. Don't reorder these. Price history uses `ohlcv(tf='1h')`
aggregated to daily; the older `prices()` endpoint 404s for every ticker and
`tf='1d'` is rejected with HTTP 400.

**`volumeRocketing` cross-check.** Step 1f checks each gainer for live membership
in the Volume Rocketing scan rather than re-deriving a 5D SMA locally, so the ⚡
badge can never drift from what `volume-rocketing` itself would select. It does
NOT run that skill's downstream pipeline — a same-day filter cross-check only,
deliberately cheap. On a gainers card this badge is genuine independent
confirmation, which is why this skill passes it through and `volume-rocketing`
suppresses it.

**Event type / labels.**

| Thing             | Value                                   |
| ----------------- | --------------------------------------- |
| raw file          | `gainers_raw_{YYYYMMDD}.json`           |
| insights DTO      | `gainers_insights_{YYYYMMDD}.json`      |
| research seed     | `gainers_research_seed_{YYYYMMDD}.json` |
| event type        | `gainer`                                |
| creator           | `gainers-signal`                        |
| research DTO type | `gainers-trigger-research`              |
| email title       | `Daily Gainers Signal`                  |
| subject           | `Daily Gainers Signal — {market_date}`  |

## Step 4 research DTO

Per shared §Step 4, save one per researched company:

```
db.saveReport({ creator: 'gainers-signal', type: 'gainers-trigger-research',
  date: market_date, companyId, modelUsed: '<the model writing this>',
  summary, research_axis, tier, trigger, trigger_quantified, linkage,
  why,                        // {text, basis, sources} — same object the email card carries
  contextUsed: [ids actually referenced],
  concallCorroboration: needs_transcript_research
    ? { sentiment, resultQualityScore, guidanceHighlights: [...] }
    : null,
  ...narrative })
```

- `linkage` is one of `explained` / `unexplained` / `mismatched` — same
  discipline as the email.
- `why` is stored alongside the narrative so `insight-validation` can score the
  WHY ladder's accuracy at D+2, not just the tier's.
- `concallCorroboration` stays `null` (not `{}`) when the concall step didn't
  run, so a reader can distinguish "we checked and found nothing extra" from
  "we didn't check".
- `modelUsed` is required — this is LLM-written narrative, unlike the
  classifier's script-only `gainer` events.
- `contextUsed` = ids from `buildCompanyContext()`'s `availableIds` the write-up
  actually drew on (empty array if the bundle was empty).

These link into `companies.json` automatically via `db.saveReport` →
`linkToCompanies`, creating a lazy stub for tickers with no prior entry — itself
worth flagging ("no company-master coverage yet").

## Downstream

`insight-validation`'s nightly run performs a D+2 follow-up on this run's
ACT/HIGH picks. No action needed here.

## Rules

Everything in the shared doc's Rules section applies unchanged. Nothing in this
file overrides it.
