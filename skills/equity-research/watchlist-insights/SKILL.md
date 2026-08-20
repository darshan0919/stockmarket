---
name: watchlist-insights
description: Daily watchlist corporate-announcement insights — fetch new non-routine announcements across the Near Highs + Radar watchlists, read each PDF, write an actionable quantified insight per category into the notes DB, and email the full 24h digest. Deliberately skips heavy dedicated-workflow documents (earnings results, concall transcripts, investor presentations, annual reports) rather than PDF-parsing them, logging every skip with its reason for visibility. Invoke with defaults for the 8 AM run, or on demand to re-process a company.
---

# Watchlist Daily Insights

This skill is an **orchestrator only**: fetch the window, hand each announcement to the
`announcement-insights` skill for the actual reading/judgment, then digest and push. It
does not own any category-extraction logic itself — that all lives in
`announcement-insights` (`skills/equity-research/announcement-insights/SKILL.md`) so
`watchlist-insights`, `gainers-signal`, and any future caller share one template
library instead of drifting apart. If you're looking for "what should the insight for a
demerger/order-win/SAST filing say", that answer is in `announcement-insights`, not
here.

Script-first: the companion job `watchlistInsights.js` handles all I/O (Stockscans API,
PDF text, notes DB, email) — it's shared with `announcement-insights`, not duplicated.

## Parameters

| Param            | Default                             | Meaning                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `watchlistIds`   | _(required, caller-supplied)_       | comma-separated watchlist IDs, e.g. Near Highs + Radar + Upcoming Results. The job is agnostic of which watchlists it scans — the calling skill/task always supplies this.                                                                                                                                                                                                |
| `--window-hours` | _deterministic default (see below)_ | **explicit override only** for `fetch-announcements` / `build-digest` / `send-digest` — use it for a deliberate wider catch-up (e.g. `--window-hours 72` after a known multi-day outage). Leave it unset for the normal daily run: the default window is resolved automatically (never a plain "last 24h"), so you should not need this flag just because a run was late. |
| `email`          | on                                  | run `send-digest` at the end (off = just update notes)                                                                                                                                                                                                                                                                                                                    |
| company filter   | none                                | on demand, process only a given `companyId`                                                                                                                                                                                                                                                                                                                               |

### Why the default window isn't just "last 24h"

This job runs on a daily ~8AM IST schedule, but the run itself might fire late, fail
outright, or get triggered manually hours or days after that. A plain rolling 24h
window silently drops whatever fell in the gap: a run delayed to 2PM only looks back
to 2PM the day before, missing the 8AM–2PM slice the _previous_ day's on-time run
already covered by the time it looked back 24h from its own (earlier) invocation.

With no `--window-hours` flag, `fetch-announcements`/`build-digest`/`send-digest` now
resolve the window deterministically instead:

1. **Anchor floor** — the window never starts later than the _previous calendar day's_
   8AM IST, regardless of what time the run actually fires. A same-day delay just
   produces a longer (safe — see below) window, not a gap.
2. **Resumable cursor** — `commit-window <watchlistIds>` persists the exact windowEnd
   a healthy run used, in `cache/watchlist-insights-cursor.json`. If that cursor is
   _older_ than the anchor floor (one or more entire scheduled runs were missed or
   failed), the window reaches back to the cursor instead — covering the full gap,
   however many days long, not just one extra day.

Re-fetching announcements already seen is harmless: `fetch-announcements` already
dedupes against each company's `processedAnnouncements`, so a wider-than-strictly-
necessary window never produces duplicate insights or emails — it can only prevent
a silent gap. A cursor stale beyond 30 days is treated as an error (not a silent
month-long backfill) — that's almost certainly a bug worth a human look, run an
explicit `--window-hours <n>` catch-up covering the real gap in that case.

## Setup

```bash
JOB=$(find /sessions -path '*packages/jobs-runtime/watchlistInsights.js' -not -path '*/node_modules/*' 2>/dev/null | head -1)
RUNTIME=$(dirname "$JOB")   # …/packages/jobs-runtime
run(){ node "$JOB" "$@"; }
```

Do NOT export `WI_DATA_DIR` / `WI_NOTES_DIR` / `COWORK_ENV` — the job resolves everything
itself: the notes DB and validation logs default to `<repo>/data/` and secrets to
`<repo>/.env`. Exporting paths derived from fragile `find`s is what previously scattered
`notes/` and `validation/` at the repo root.

## Step 1 — Fetch new announcements

```bash
run fetch-announcements "$WATCHLIST_IDS"                      # deterministic default window (see above) — normal daily run
run fetch-announcements "$WATCHLIST_IDS" --window-hours 72     # explicit override, e.g. a deliberate wider catch-up
```

Returns a JSON array of new, non-routine, unprocessed announcements — each with a
`category` and `pdfUrl`. (Routine noise is already dropped and logged for the validator.)
This also records the exact window this call used (`cache/watchlist-insights-pending-window.json`)
so Step 4's `commit-window` can later advance the cursor to precisely that windowEnd.
"Unprocessed" here means unprocessed under the `announcement-insights` usecase family
specifically (the default `--usecase-prefix`) — this skill never needs to pass that flag
explicitly since it's always operating in that family; it only matters if you're
building a NEW orchestrator with different extraction logic (see announcement-insights'
SKILL.md "Caching" section).

## Step 2 — Process each meaningful announcement (one at a time)

For EACH item, first check `item.heavyDocument` (already computed deterministically by
`fetch-announcements` from `HEAVY_DOCUMENT_CATEGORIES` in
`lib/announcementTaxonomy.js` — `results`, `concall_transcript`,
`investor_presentation`, `annual_report`):

**If `heavyDocument` is true — SKIP, don't call `announcement-insights` at all:**

1. `run log-heavy-skip '<json>'` with `{companyId, name, title, category,
heavyDocumentSkipReason, announcementId, date}` (all fields already present on the
   fetch-announcements item — pass them straight through).
2. `run mark-processed "<companyId>" "<announcementId>" "heavy-doc-skip"` — the explicit
   `heavy-doc-skip` usecase (NOT the `announcement-insights` default) matters here: this
   document was never actually read, so a different skill that DOES own this document
   type (`quarterly-result-analysis`, `concall-analysis`, etc.) must never be blocked
   from processing it later just because watchlist-insights' own skip got recorded under
   its usecase. See announcement-insights' SKILL.md "Caching" section for why usecase
   scoping matters here.
3. Move on to the next item — no PDF fetch, no `announcement-insights` call.

This is deliberate: `results`, `concall_transcript`, `investor_presentation`, and
`annual_report` are exactly the documents dedicated skills already own
(`quarterly-result-analysis`/`pre-pead-scanner`, `concall-analysis`, `stock-report`/
`equity-research-extraction`, `annual-report-analysis`) and can run 15-300+ pages —
parsing them here would spend this skill's thinking time on document mechanics instead
of insight synthesis, which is the opposite of what a daily scan is for. If you notice
a genuinely material signal that would have been missed by skipping a category (e.g. a
"Financial Results" filing whose title also buried an unrelated stake sale), don't
silently let it go — that's exactly what the digest's Skipped section (Step 3) exists
to surface for a human to catch and correct via `skill-manager`.

**Otherwise, run the full `announcement-insights` skill** (its SKILL.md Steps 0-4:
heavy-doc re-check → read-pdf-with-meta → get-company-notes → fetch template by
category+depth → add-note), then `run mark-processed "<companyId>" "<announcementId>" "<usecase>"`
using the EXACT SAME `usecase` string you passed to `add-note`
(`"announcement-insights:<depth>"`) — this is what lets a future run recognize the
announcement as already handled for THIS specific depth, without ever confusing it with
a different skill's or a different depth's processing of the same document.

Depth: use `--depth deep` for the four HIGH_CONVICTION_CATEGORIES
(`demerger`/`merger`/`acquisition`/`management_change`) — this is the default this
skill asks for, since the daily digest is exactly the kind of "time to spend judgment"
context `announcement-insights` describes, not a time-boxed scan. Use `--depth
standard` for everything else, same as before.

Routine items that slip through the noise filter (not heavy-document, just
uninteresting): just `run mark-processed "<companyId>" "<announcementId>"` (default
usecase — fine here since a routine item is essentially never a HIGH_CONVICTION
category) and move on (no insight, no heavy-skip log — those are two different reasons
for "no insight" and the digest keeps them visually separate). The `modelUsed` field in
the note payload must be the model actually doing the reading/writing right now (e.g.
`claude-sonnet-5`) — `announcement-insights`' Step 4 covers the full payload shape,
including the `usecase` field, and the deterministic significance-floor/tag guard that
applies automatically to high-conviction categories. `numPages`/`isHeavyParse` from
`announcement-insights`' Step 1 go straight into that same `add-note` payload — they're
what let the digest's Heavy Parse Highlights section (Step 3) render without a second
PDF fetch.

**A cache hit is never a reason to omit an announcement from the digest.** If Step 1's
`fetch-announcements` doesn't return an announcement because it was already processed
under this same usecase, that's correct — but Step 3's `send-digest`/`build-digest` pull
from the FULL in-window announcement list independently (via `collectDigest`) and always
show every one of them, using whichever cached note applies (see `pickDigestNote` in
`watchlistInsights.js`). Never add logic that filters the digest by "already processed"
— that would silently drop something a human is meant to see today just because it
wasn't newly generated today. See announcement-insights' SKILL.md "Caching" section for
the full two-tier model this all rests on.

If you spot any OTHER category that seems to consistently produce heavy, low-marginal-
value-per-page documents beyond the four above, say so explicitly in your final report
rather than silently working around it — that's a candidate for
`HEAVY_DOCUMENT_CATEGORIES`, and `insight-validation`'s Heavy Parse Highlights review
(see its SKILL.md) is where that candidate gets proposed formally.

## Step 3 — Send the digest

```bash
run send-digest "$WATCHLIST_IDS"                      # same 24h window as Step 1
run send-digest "$WATCHLIST_IDS" --window-hours 72     # match whatever --window-hours Step 1 used
```

Emails insights for ALL non-routine announcements in the window (stored insights are
read back from the notes DB; only genuinely-new ones get a fresh insight above). Prints
`{status, totalAnnouncements, withInsight, missingInsight, missingIds}`. Inspect without
sending via `run build-digest "$WATCHLIST_IDS" [--window-hours N]` (returns `{digest,
heavySkips, heavyParseCount}`).

The email itself (`buildDigestHtml`, deterministic, no LLM composition) always ends
with two sections, in this order, right before the watchlist-source footer:

- **📄 Heavy Parse Highlights** — announcements whose category was NOT skip-listed but
  whose PDF still turned out >4 pages (rendered from any note tagged `heavy_parse`,
  written automatically by `add-note` whenever `numPages > 4`). This is what surfaces
  "we should maybe skip this category too" candidates.
- **🚫 Skipped (heavy-document category — not parsed)** — everything logged via
  `log-heavy-skip` in Step 2, with its category and reason, read back from
  `cache/heavy-doc-skips_<date>.json`. This is the safety net: if something genuine got
  skipped, it's visible here, not silently dropped.

Any note tagged `high_conviction` (the four HIGH_CONVICTION_CATEGORIES) should stand
out in the digest — a dedicated top section, not buried alphabetically with routine
credit-rating/investor-meet notes. If `missingInsight > 0`, treat that as a data-quality
signal worth a one-line flag in your final report, not just a silently-passed-through
number — investigate before the next run if the count is unusually high relative to
`totalAnnouncements` (most announcements in-window should already have insights from
Step 2, since routine items are mark-processed without one but shouldn't dominate; a
heavy-document skip is a THIRD reason for "no insight" beyond routine/missing, so a
healthy run has `missingInsight` roughly equal to `heavySkips.length`, not wildly
larger).

`--window-hours` must match between Step 1 and Step 3 if you pass it explicitly — if you
leave it unset in both (the normal case), they resolve to the same window automatically
(same anchor floor + same cursor, since `commit-window` hasn't run yet at this point), so
nothing extra to keep in sync there.

## Step 4 — Commit the window, then offload & cleanup (MANDATORY, even on failure)

```bash
run commit-window "$WATCHLIST_IDS"
```

Only run this once the Step 3 digest confirms a healthy run — `missingInsight` roughly
equal to `heavySkips.length`, no unexplained errors. This durably advances the resumable
cursor (`cache/watchlist-insights-cursor.json`) to the exact windowEnd Step 1 used, which
is what lets tomorrow's run pick up exactly where this one left off even if it's delayed
or manually re-triggered. **Do NOT call this if the run was only partially completed** —
committing on a partial failure would let the next run's window skip past whatever didn't
get processed this time, silently losing it. If the run failed partway through, skip
`commit-window` entirely and report the failure; the next run's anchor floor + old cursor
will naturally reach back far enough to pick up the unfinished work.

```bash
yarn data:push
```

Idempotent push of everything under `data/` to Google Drive (`StockMarket/data/v2`).
Push-only: local files are KEPT (full mirror), nothing is deleted. The skill is NOT complete until this has run. Generated data belongs ONLY under `data/`; if the sync fails, report it and retry later.

## Rules

- **Files-touched manifest (docs/DATA_RULES.md §7):** end the run by listing every file created/modified — collections with record counts (db.js helper stats / `db.touchedFiles()`), plus `runs/`/`cache/`/`assets/` files (`StorageService.touchedFiles()`), plus the `data:push` `↑ <file>` lines. A run that stored data without reporting what it touched is incomplete.

- One PDF at a time; every meaningful, non-heavy-document announcement gets its PDF
  read and an actionable, quantified insight — never from the title alone.
  `cache/heavy-doc-skips_<date>.json` (touched via `log-heavy-skip`),
  `cache/watchlist-insights-pending-window.json` (touched via `fetch-announcements`),
  `cache/watchlist-insights-cursor.json` (touched via `commit-window`), and
  `cache/pdf-text/<hash>.json` (touched via `read-pdf`/`read-pdf-with-meta` — one per
  distinct PDF URL, shared across every skill that reads it, see announcement-insights'
  SKILL.md "Caching" section) are all part of the files-touched manifest same as any
  other `cache/` file.
- The notes DB is long-term memory: treat prior notes as signal, look for patterns and
  contradictions. Log any API error in the insight and continue. Every note this skill
  writes MUST carry an explicit `usecase: "announcement-insights:<depth>"` field, and
  every `mark-processed` call the matching usecase string — see announcement-insights'
  SKILL.md "Caching" section for why (two different skills, or two different depths,
  reading the same announcement produce genuinely different artifacts and must never
  share or shadow each other's cache entry).
- All outputs go under `data/` (the job does this by default) — never write data
  files to the repo root, and always finish with Step 4.
