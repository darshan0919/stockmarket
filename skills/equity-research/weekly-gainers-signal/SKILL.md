---
name: weekly-gainers-signal
description: Weekly gainers ACTIONABILITY signal — top-20 names by Returns 1W, run through the same scan-signal-pipeline as gainers-signal (quality filters, delivery, 14-day announcements, classifier, WHY ladder), but with a FULL rerating-catalysts J-Curve report (widget + 1-page PDF, not the brief) for all 20, and an email that links each PDF's Google Drive URL instead of an inline EPS-brief snippet. Invoke with defaults for the weekly Saturday run, or pass a specific market date on demand.
---

# Weekly Gainers Signal

Sibling to [`gainers-signal`](../gainers-signal/SKILL.md) and
[`volume-rocketing`](../volume-rocketing/SKILL.md) — same pipeline, different
universe and a heavier Step 6. Finds the top 20 names by **weekly** return
(`Returns 1W`) rather than a single session's, and instead of a cheap EPS-brief
snippet for the top names, produces a full standalone J-Curve report (with PDF)
for every one of the 20, so a Saturday reader can open any name's report
directly from the email without asking for it separately.

**Read [`../_shared/scan-signal-pipeline.md`](../_shared/scan-signal-pipeline.md)
in full before running.** This file only documents what differs from
`gainers-signal`; everything else (quality filters, delivery-value sort,
14-day announcements, the WHY ladder, the Thesis Card renderer, the rules
section, the files-touched manifest) is unchanged and shared verbatim.

## A note on "top N"

Everywhere in this skill and the shared pipeline doc, "top N" for a
_selection within_ the pipeline (research, reports, the email) always means
sorted by **Deliv Val** descending — same convention as `gainers-signal`'s
"top 3"/"top 10" (see that skill's "Step 5 delta" section). This does NOT
apply to `--top-n` below, which sizes the _universe entry filter_ — "top 20
gainers of the week" is inherently a `Returns 1W` rank (that is what makes a
name a weekly gainer at all), the same relationship `--top-n` has to
`Returns 1D` in `gainers-signal`. Once that universe of 20 is fetched, every
downstream step in this skill treats all 20 equally (all get research, all
get a full report) — there is no further Deliv-Val subset to pick, so this
distinction is documentation-only for this skill today.

## Parameters

| Param     | Default          | Meaning                                                  |
| --------- | ---------------- | -------------------------------------------------------- |
| `date`    | last trading day | market date (`--date YYYY-MM-DD`) for the scanner        |
| `email`   | on               | set off to `render` the briefing without sending         |
| `--top-n` | `20`             | size of the weekly-gainers universe (NOT 50 — see below) |

## Setup

```bash
SCAN=$(find /sessions -path '*packages/jobs-runtime/weeklyGainersScanner.js' -not -path '*/node_modules/*' 2>/dev/null | head -1)
RUNTIME=$(dirname "$SCAN")                        # …/packages/jobs-runtime
WI="$RUNTIME/watchlistInsights.js"                # shared I/O runtime (read-pdf, insight-template)
EMAIL="$RUNTIME/scanSignalEmail.js"                # Thesis Card renderer + mailer
DB="$RUNTIME/lib/db.js"                            # resolveDriveUrl() after push
```

Do NOT export `GAINERS_OUTPUT_DIR` / `WI_DATA_DIR` / `COWORK_ENV` — same rule
as `gainers-signal`, the scripts resolve everything themselves.

## What's specific to this scan

**Universe — top 20 by `Returns 1W`, not top 50 by `Returns 1D`.** Platform-
native sort (`skills/tooling/cowork-task-architect/SKILL.md`'s platform-reuse-
first check applies here too — Stockscans already serves `Returns 1W` as a
selectable scan column, the same column `weekly-gainers-digest` already uses;
no local weekly-return derivation needed). Run:

```bash
node "$SCAN" --date <market_date> --top-n 20
```

This calls `gainersScanner.fetchTopWeeklyGainers` (Market Cap ≥ ₹300 Cr,
Returns 1W ≥ 3%, `orderBy: 'Returns 1W' desc`) as the `universeFetcher`, and
reuses `gainersScanner.main()` end to end via the same hooks
`volumeRocketingScanner.js` established — Steps 1-5 of the shared pipeline
(quality filters, delivery, 14-day announcements, classifier, WHY ladder) run
completely unchanged. Writes `data/runs/weekly_gainers_raw_{YYYYMMDD}.json`.

**No dedup against the daily runs.** Unlike `volume-rocketing` (which skips
names `gainers-signal` already covered that day), a name can legitimately be
both a daily gainers-signal pick on, say, Monday AND this week's
weekly-gainers-signal pick on Saturday — they answer different questions
("what moved today" vs "what moved this week") and Darshan reads them on
different cadences. Do not filter one against the other.

**Step 3 seed — all 20, one list, no tiering.** `gainers-signal`'s seed splits
into 20 names for trigger research and a separate 10 for an EPS thesis
(shared doc Step 3/Step 6). Here there is only one universe of 20 and every
name gets full research AND a full report — do not apply the two-list split.

**Step 4 — trigger research for all 20.** Same procedure as the shared doc's
Step 4 (extract-store check before any PDF read, `announcement-insights`
category template, `HIGH_CONVICTION_CATEGORIES` at `--depth standard`). With
only 20 names (not up to 30), there is no need to invoke the cost-control cap
— research every name.

**Step 5 — WHY ladder, rung 2 runs for all 20, not just ACT/WATCH.** The
shared doc gates `announcement-info-classifier` (rung 2) to ACT and WATCH tier
names with a filing. For this weekly run, invoke it for **every one of the 20**
that has a filing in the 14-day window, tier notwithstanding — the user asked
for the classifier to run "for the top 20 gainers of the week" explicitly, and
at 20 names the cost is bounded regardless of tier.

**Step 6 — FULL `rerating-catalysts` report for all 20 (replaces the EPS
brief).** This is the load-bearing difference from `gainers-signal`. Where the
daily skills call `rerating-catalysts --mode brief` (Modes section of that
skill) for a cheap, render-free EPS snippet, this skill calls it in its
**default `full` mode** — no `--mode` flag — for every one of the 20 names:

```bash
node skills/equity-research/rerating-catalysts/scripts/brief_cache.js plan --tickers "<comma-joined 20 tickers>"
```

`plan` still tells you which are cache-servable (a full-mode report built
today or very recently) vs which need a fresh build — reuse the cache exactly
as `gainers-signal` does (never re-derive a served result), but for anything
not servable, run rerating-catalysts's full Workflow (Phases 1-4, "Modes"
section confirms `full` is what a direct catalyst-note request gets) rather
than `--mode brief`. That means: full document acquisition, the "new" lens
read, Phase 2.5 price-volume spike days, Phase 3 synthesis, Phase 4 persist +
render — HTML widget AND the 1-page PDF with the J-Curve badge, saved to
`data/rerating-catalysts/<Company>_Output.pdf`, exactly as that skill's PDF
section specifies. **Never skip the PDF for this run** — it is the deliverable
this scheduled task exists to produce; if the render pipeline is genuinely
unavailable, say so explicitly per that skill's own fallback rule rather than
silently sending an email with missing links.

Report `fullReports`, `reportCacheHits`, `reportExtractHits` in the stats
footer (parallel to `gainers-signal`'s `epsBriefs`/`briefCacheHits`/
`briefExtractHits`), so cache health stays visible.

**Push BEFORE composing the email, not just at Step 8.** `resolveDriveUrl()`
(`packages/jobs-runtime/lib/db.js`) only returns a link once `yarn data:push`
has synced the file and written its id into `cache/sync-state.json` — a PDF
written this run has no Drive id until pushed. So run `yarn data:push` right
after all 20 reports are rendered (before Step 7), THEN resolve each report's
Drive URL:

```bash
node -e "const db=require('$DB'); console.log(db.resolveDriveUrl('rerating-catalysts/<Company>_Output.pdf'))"
```

for each of the 20 companies, and attach the result as `reportDriveUrl` on
that company's `epsThesis` object in the content overlay (Step 7 below) — the
renderer (`thesisCardEmail.js`) already knows to turn a present
`reportDriveUrl` into a "Full J-Curve report (PDF) →" link on the card. If a
link fails to resolve (push race, or the push itself failed) leave
`reportDriveUrl` unset for that card rather than fabricating a path-based
URL — an absent link is honest, a dead one is not.

Step 8's final `yarn data:push` still runs as usual (idempotent) to catch the
research DTOs and any other writes made after the mid-run push above.

**Event type / labels.**

| Thing             | Value                                          |
| ----------------- | ---------------------------------------------- |
| raw file          | `weekly_gainers_raw_{YYYYMMDD}.json`           |
| insights DTO      | `weekly_gainers_insights_{YYYYMMDD}.json`      |
| research seed     | `weekly_gainers_research_seed_{YYYYMMDD}.json` |
| event type        | `weekly_gainer`                                |
| creator           | `weekly-gainers-signal`                        |
| research DTO type | `weekly-gainers-trigger-research`              |
| report DTO type   | `rerating-catalysts` (unchanged — same skill)  |
| email title       | `Weekly Gainers Signal`                        |
| subject           | `Weekly Gainers Signal — {market_date}`        |

## Step 7 — compose and send (delta from the shared doc)

Same `scanSignalEmail.js` renderer, same content-overlay contract as the
shared doc's Step 7 — do not hand-write HTML. The only change is what rides
on `epsThesis`: instead of the brief's `{jCurveTag, jCurveReason, thesis,
catalysts[], asOf, cacheHit}`, attach the SAME fields (full mode's Phase 4 DTO
carries `jCurveTag`/`jCurveReason` too) plus `reportDriveUrl` resolved above.
The lead paragraph should state the count of reports rendered vs cache-served,
same honesty rule as `gainers-signal`'s brief count.

## Downstream

None yet — `insight-validation`'s D+2 follow-up is gainers-signal/
volume-rocketing-only for now; a weekly-cadence equivalent would need its own
follow-up window and is out of scope for this skill.

## Rules

Everything in the shared doc's Rules section applies unchanged, including the
files-touched manifest and the token-optimization suggestion. Nothing in this
file overrides it.
