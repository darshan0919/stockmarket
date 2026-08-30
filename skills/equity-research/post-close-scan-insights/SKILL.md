---
name: post-close-scan-insights
description: Nightly post-market-close corporate-announcement digest for a fixed ad-hoc Stockscans scan (mid/small-cap, price above 200DMA, meaningful retail holding, liquid) — fetches every announcement filed after that day's 3:30 PM IST close, drops routine noise, reads each PDF, writes an actionable quantified insight per category, runs the top 5 most significant items through announcement-info-classifier for a NEW/KNOWN/FOLLOW-UP read on each, and emails a digest grouped by significance (high/medium/low). Invoke with defaults for the nightly 2 AM run, or on demand with an explicit --window-hours override to re-run a specific evening's post-close activity.
---

# Post-Close Scan Insights

This skill is an **orchestrator**, same shape as `watchlist-insights`, but scoped to a
different universe and a different window: instead of a saved watchlist, it scans a fixed
ad-hoc Stockscans filter set (see `DEFAULT_SCAN` in the companion script) for everything
filed strictly AFTER that trading day's 3:30 PM IST market close. It exists because
post-close is when board outcomes, preferential allotments, and NCLT/regulatory approvals
disproportionately get filed — the standard 8 AM `watchlist-insights` run already covers a
much wider daily window but isn't scoped to catch "what happened after the bell,
specifically" as its own signal.

Like `watchlist-insights`, this skill does **not** own the category-extraction logic
itself — reading a PDF and writing an insight is `announcement-insights`'
(`skills/equity-research/announcement-insights/SKILL.md`) job, and deciding how much of
an announcement is actually NEW information vs already known/committed is
`announcement-info-classifier`'s (`skills/equity-research/announcement-info-classifier/SKILL.md`)
job. This skill's job is: fetch the right announcements, filter noise, categorise, route
heavy documents away, hand each remaining announcement to `announcement-insights`, run
the night's top 5 most significant items through `announcement-info-classifier` on top
of that base read (Step 3.5), and finally digest+email.

Script-first: the companion job `packages/jobs-runtime/postCloseScanInsights.js` owns
everything that's pure logic (scan pagination-to-cutoff, noise filter, categorisation,
digest HTML/email). Everything else — PDF reading, company-notes lookup, note
persistence — is NOT duplicated here; this skill shells out to the EXACT SAME
`packages/jobs-runtime/watchlistInsights.js` commands that `announcement-insights` already
uses (`read-pdf-with-meta`, `get-company-notes`, `add-note`, `mark-processed`,
`log-heavy-skip`). See `skills/_shared/conventions.md` §17 — two skills reading a PDF and
writing a note is the same extraction, so it goes through the same cache and the same
code, not a second copy of the logic.

## Parameters

| Param            | Default                   | Meaning                                                                                                      |
| ---------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `--window-hours` | deterministic (see below) | explicit override — use for a deliberate re-run of a specific past evening. Leave unset for the nightly run. |
| `email`          | on                        | run `send-digest` at the end (off = just persist notes)                                                      |

### Resumable cursor (added 2026-08-23 — corrects an earlier design assumption)

This skill originally shipped WITHOUT a resumable cursor, reasoning that "it runs once
nightly, a few hours after that same day's close — there's no earlier same-day run whose
gap it needs to protect against." That reasoning missed a real case: a run CAN fire on a
Saturday or Sunday (a manual catch-up, or the schedule changing), and without a cursor the
very next scheduled run would recompute its window from the trading-day floor alone
(see below) and re-fetch/re-process everything the weekend run already handled. Re-reading
the same PDFs and re-asking the model to judge the same announcements' significance is
exactly the repeated work `skills/_shared/conventions.md` §17 says to design out.

So this skill now uses the SAME resumable-cursor pattern as `watchlist-insights`
(`cache/post-close-scan-insights-cursor.json` + a `commit-window` command), simplified
since there's only one fixed scan universe here (no per-watchlist cursor key needed):

- **Step 1's `fetch-scan`** resolves its actual cutoff as the LATER of the trading-day
  floor (last real trading day's 3:30 PM close) and the last-committed cursor — a
  committed cursor means "everything up to here is already handled," so the cutoff must
  never move earlier than that or it re-fetches already-processed announcements. It also
  writes a pending-window marker recording this run's own invocation time.
- **After a run is confirmed healthy** (Step 5's `send-digest` succeeds, or with `email`
  off, Step 3's `mark-processed`/`add-note` calls all complete cleanly), call
  `run commit-window` to durably advance the cursor to that pending marker's timestamp.
  **Never commit after a partially-failed run** — that would permanently drop whatever
  didn't get processed, since the next run's window would no longer reach back far enough
  to see it.
- If a nightly run is genuinely missed entirely (the scheduled task itself fails to fire
  for one or more full days), catch up explicitly with `--window-hours <n>` covering the
  real gap, then still call `commit-window` afterward to reset the cursor — same as
  `watchlist-insights`' "cursor stale beyond 30 days is an error, not a silent backfill"
  (this skill uses the identical 30-day safety cap).

**Weekend AND holiday handling (weekends fixed 2026-08-23, holidays fixed 2026-08-23):**
the trading-day FLOOR half of `resolveCutoffUtc` (i.e. `defaultCutoffUtc`) means the most
recent REAL NSE/BSE trading day's close — not literally "yesterday's", and not just "the
last weekday's." It calls the shared `packages/jobs-runtime/lib/tradingCalendar.js` module
(`lastTradingDayOnOrBefore`), which walks back over both weekends and NSE trading
holidays, so:

- The Sunday-night/Monday ~2 AM run correctly reaches back to the prior **Friday** 3:30 PM
  close, picking up everything filed Friday evening plus any weekend filings (NCLT orders
  and SAST disclosures do land on non-trading days) that a plain "yesterday" cutoff would
  otherwise silently drop.
- The morning after ANY NSE trading holiday (Diwali, Republic Day, Holi, etc.) correctly
  reaches back to the last real trading day before the holiday, not the holiday itself —
  the identical failure mode as the weekend gap, just triggered by a different calendar.
- A run that happened to fire on a non-trading day (Saturday, Sunday, or a holiday)
  computes the SAME floor as the next Mon-Fri run would — it's the cursor (see above),
  not the floor, that then actually determines whether that weekend run's own results get
  reused or re-covered.

`tradingCalendar.js` sources the holiday list from NSE's public holiday-master API
(`https://www.nseindia.com/api/holiday-master?type=trading`, "CM"/capital-market segment),
cached per-year at `data/cache/trading-holidays-<year>.json` — a normal nightly run reads
the cache and makes no network call; the module re-fetches when the cache is missing OR
older than 7 days (added 2026-08-23 — NSE occasionally revises its published holiday list
mid-year, e.g. last-minute regional election-day additions, so a once-a-year refresh could
sit on a stale correction for months). **Fail-open by design**: if the NSE fetch fails and
there's no usable cache, every day is treated as tradable (equivalent to the old
weekend-only behavior) rather than the run erroring out — a warning is printed to logs
either way, so check for `[tradingCalendar]` warnings if a Monday/post-holiday digest ever
looks thin. `gainersScanner.js` has an identical, longer-standing "weekends only, no
holiday calendar" gap (flagged in its own comments, never fixed) — `tradingCalendar.js` is
written to be reusable there too if that gets prioritized, so as not to re-solve this a
third time.

## Setup

```bash
JOB=$(find /sessions -path '*packages/jobs-runtime/postCloseScanInsights.js' -not -path '*/node_modules/*' 2>/dev/null | head -1)
WI_JOB=$(find /sessions -path '*packages/jobs-runtime/watchlistInsights.js' -not -path '*/node_modules/*' 2>/dev/null | head -1)
run(){ node "$JOB" "$@"; }
runwi(){ node "$WI_JOB" "$@"; }
```

Do NOT export `WI_DATA_DIR`/`WI_NOTES_DIR`/`COWORK_ENV` — both scripts resolve everything
themselves via `loadEnv()` (repo-root `.env`) and `<repo>/data/`, same as every other
jobs-runtime script (see `skills/_shared/conventions.md` §2).

**Network note:** the Stockscans API is reachable from a cloud/CI execution environment
but has been observed blocked (`403 blocked-by-allowlist`) from some local-network
execution paths. If `fetch-scan` fails with a network/403 error, re-run it from an
environment with open network access rather than assuming the token is bad — check the
error body first (an expired/invalid `STOCKSCANS_AUTH_TOKEN` message is unambiguous and
different from a network block).

## Step 1 — Fetch the post-close window

```bash
run fetch-scan                          # since max(last-trading-day's 3:30PM IST close, last-committed cursor) — normal nightly run
run fetch-scan --window-hours 34        # explicit catch-up after a missed run (bypasses both the floor and the cursor)
```

Paginates the fixed ad-hoc scan (30/call, per the documented `announcements/scan`
convention — see `docs/stockscans-api-schemas.md`) until it crosses the cutoff, since
results are returned newest-first. Returns `{cutoffUtc, quarterDate, totalFetched,
inWindow}`. Save `inWindow` to a file for the next step. Also writes a pending-window
marker (`cache/post-close-scan-insights-pending-window.json`) that Step 6's
`commit-window` reads back — don't call `fetch-scan` again mid-run for the same cycle, or
the pending marker will point at the later call's window instead.

## Step 2 — Filter noise, then categorise

```bash
run filter-noise <fetch-scan-output.json>     # -> {kept, dropped}
run categorise <filter-noise-output.json>     # -> [{companyId, category, heavyDocument, highConviction, pdfUrl, ...}]
```

Both commands reuse the SAME shared modules `watchlist-insights` uses —
`stock-api/src/utils/announcementNoiseFilter.js` (title/description keyword lists, one
shared source of truth, editable via the app) and
`packages/jobs-runtime/lib/announcementTaxonomy.js` (`categoriseAnnouncement`,
`HEAVY_DOCUMENT_CATEGORIES`, `HIGH_CONVICTION_CATEGORIES`). This is deliberate: a company
whose announcement was filtered/categorised one way by `watchlist-insights` should never
get a second, different answer from this skill just because it scanned the same document
independently — both skills are asking the same objective questions about the same
category taxonomy.

**Known taxonomy gaps to watch for** (confirmed live 2026-08-19, not yet fixed upstream —
flag recurring instances to `insight-validation`/`skill-manager` as candidates for
`CATEGORY_RULES` fixes, don't silently work around them every run):

- A bare `"PPT <Month> <Year>"` title (no other recognisable keyword) fails to match
  `investor_presentation` and is categorised `general` instead of being heavy-doc-skipped.
  If you see this pattern, note it in the run's final report even though you still handle
  it per the category the taxonomy actually returned.
- Generic `"Scheme of Arrangement"` language matches `demerger` even when the underlying
  scheme is a capital-return/bonus-preference-share distribution, not an actual business
  split. Read the PDF before trusting the category label for anything in the
  `demerger`/`merger`/`acquisition`/`management_change` bucket — the category decides
  _how much attention_ the announcement gets, not what to conclude about it.
- A generic `"Press Release"` title can hide a genuinely high-conviction event (e.g. an
  NCLT demerger-approval press release) that the taxonomy has no title keyword to catch.
  If the category comes back `general` for a company/announcement pair that also has
  `regulatory`/`arrangement`/`NCLT`/`tribunal` language in the actual PDF text, treat it
  as a potential miscategorisation and read the PDF in full before writing a routine
  `low`-significance insight.

## Step 3 — Route each item (heavy-doc skip vs. process)

For EACH item from Step 2's output:

**If `heavyDocument` is true — skip, don't call `announcement-insights` at all:**

```bash
runwi log-heavy-skip '<json: {companyId, name, title, category, heavyDocumentSkipReason, announcementId, date}>'
runwi mark-processed "<companyId>" "<announcementId>" "heavy-doc-skip"
```

Same four categories as `watchlist-insights` (`results`, `concall_transcript`,
`investor_presentation`, `annual_report`) — full rationale in
`skills/equity-research/watchlist-insights/SKILL.md` Step 2, not repeated here.

**Otherwise, run `announcement-insights`' Steps 1-4** exactly as documented in
`skills/equity-research/announcement-insights/SKILL.md` (`read-pdf-with-meta` →
`get-company-notes` → `insight-template` → judge significance/tags/insight text →
`add-note` with `usecase: "announcement-insights:<depth>"` → `mark-processed` with that
same usecase). Depth: `deep` for the four `HIGH_CONVICTION_CATEGORIES`
(`demerger`/`merger`/`acquisition`/`management_change`), `standard` otherwise — same rule,
same reason, as `watchlist-insights`.

**`shareholding_change` (SAST) items — cross-check against that day's `dealsDigest`
snapshot before judging routine.** SAST Reg 29 disclosures are exactly what
`packages/jobs-runtime/dealsDigest.js`'s SAST category (Category 3) independently prices
and ranks by rupee value — smart-money buying/selling and promoter pledge
creation/release are always worth surfacing per Darshan's standing direction (2026-08-24),
and rupee value is the objective materiality signal, not share count or category label
alone. Before defaulting a `shareholding_change` item to routine:

1. Check `data/runs/digest_<YYYYMMDD>.json` (same calendar date as the announcement, IST)
   for a `sast.rows` entry matching the same company/acquirer/timestamp.
2. **If it appears there with a real (non-zero, above-threshold) net value** — treat it as
   confirmed-material and write a note citing the priced value from that digest (e.g. "per
   same-day dealsDigest, this pledge-revoke is valued at ₹979cr, 6.4% of Paradeep
   Phosphates' market cap" — see the 21-Aug-2026 PARADEEP case that established this
   pattern). Don't re-derive your own share-count-based estimate when a priced figure
   already exists.
3. **If it's absent from that day's dealsDigest snapshot** (below dealsDigest's ₹5cr
   net-value threshold, an intra-promoter-group transfer with zero net change, or
   dealsDigest itself errored/hasn't run yet for that date) — don't silently mark it
   routine either. Read the PDF and use judgment on strategic relevance: an inter-se
   transfer into a family trust (net promoter holding unchanged) can still be worth a
   brief note for succession/governance context, even though it nets to ~₹0 and will never
   surface via dealsDigest's value-ranked view. This is the case that was missed on
   2026-08-22 (IVG Trust/Vadilal Industries family-trust consolidation, 3 SAST filings,
   OCR-blocked at the time — see "Reading blocked/scanned PDFs" below).
4. If `data/runs/digest_<YYYYMMDD>.json` doesn't exist yet for that date (dealsDigest runs
   on its own schedule and may not have completed), note that in the run's final report
   rather than silently treating "no snapshot" the same as "checked, not material."

**Reading blocked/scanned PDFs — `ocrFailed: true` is a hard stop, not routine.** Some
SAST/board-resolution PDFs are scanned/image-only and the text layer comes back
near-empty; `read-pdf-with-meta` now returns an `ocrFailed` flag alongside `text` (see
`announcement-insights` SKILL.md's Step 1 for the full contract — fixed 2026-08-24 after a
run marked 4 such SAST filings "routine" without ever reading them, one of which turned
out to be the ₹979cr Paradeep pledge-revoke above). If `ocrFailed` comes back true, say so
explicitly in the run's report and flag the item for manual follow-up — never fold it into
a routine mark-processed.

**General-category items are not automatically low-significance just because the rupee
amount is small.** A new associate-company/JV incorporation, a new retail store opening,
or any other filing that represents the business DOING something new (vs. routine
governance housekeeping like a like-for-like director reappointment or a scrutinizer's
AGM voting report) is a real expansion/operating-cadence signal per Darshan's standing
direction (2026-08-24) — judge materiality by "did the company's state change" (new
entity/location/relationship = yes; same people continuing the same roles = no), not by
the absolute rupee figure in the filing.

**Judgment note on `highConviction: true` items:** the category flag means "look harder,"
not "treat as automatically significant." A `HIGH_CONVICTION_CATEGORIES` match can still
turn out to be a minor, incremental event once actually read (e.g. a small follow-on stake
top-up mechanically tagged `acquisition`) — write the significance that the actual content
supports, while still giving it the deep-template's full attention. The
`add-note`/`cmdAddNote` significance floor (`medium` minimum for these four categories)
still applies regardless of what you conclude — it's a code-level guard, not something you
can undershoot even when the real story is modest.

Routine items that survived the noise filter but are genuinely uninteresting on read: just
`runwi mark-processed "<companyId>" "<announcementId>"` (default usecase) and move on — no
insight, no heavy-skip log.

## Step 3.5 — Info-classify the top 5 most significant items

Once Step 3 has produced this run's full `add-note` payload set (every non-heavy,
non-routine item's `{significance, category, companyId, announcementId, pdfUrl, insight,
headline, ...}`), select up to 5 of them and run
`announcement-info-classifier`'s Steps 3-4
(`skills/equity-research/announcement-info-classifier/SKILL.md`) on each, so the digest
carries not just "what happened" but "how much of it is actually new" for the handful of
items that matter most that night.

**Selection: by significance, high first, up to 5.** Rank this run's non-routine items by
`significance` (`high` > `medium` > `low`), take the top 5. On a typical night this is
just the high-conviction items; if fewer than 5 came back `high`, fill the remainder from
`medium`, then `low` only if still short. If fewer than 5 non-routine items exist at all
in this run's window, classify however many qualify — don't pad, don't skip the step
entirely just because the count is under 5. Zero non-routine items means zero
classifications; that's a normal quiet night, not an error.

**Reuse this run's own Step 3 read — don't call `announcement-insights` a second time.**
Each selected item already has its `announcement-insights` base read (`insight`,
`headline`, `category`, `thesisChain`) from Step 3 of THIS run. That satisfies
`announcement-info-classifier`'s own Step 2 in full — go straight to its Step 1 (resolve
companyId, already have it) and Step 3 (build the "already known" baseline: last 4
concalls, latest PPT, full announcement history via `scanAnnouncements` with
`companyFilters: [{companyId}]` objects and `searchMode: "full"`, notes DB + thesis file
via `buildCompanyContext`) — see that skill's Step 3e for the same-day/adjacent-filing
exclusion rule, which matters here more than usual: a post-close run is exactly the kind
of window where a board-outcome filing and its companion press release can both land in
the SAME night's `inWindow` set, and treating one as "prior knowledge" for the other would
be the identical mistake that rule exists to prevent. Then its Step 4 (bucket every claim
NEW / KNOWN / FOLLOW-UP, write the one-line signal-strength verdict).

Attach the result as an `infoClassification` field directly on that item's insight object
(same shape `announcement-info-classifier`'s own Step 5 payload uses:
`{claims[], verdict, baselineCoverage}`) — do NOT call that skill's own Step 5 `add-note`
separately for these 5; this run already persists one note per item via ITS OWN Step 3
`add-note` call, so fold `infoClassification` into that SAME note payload (one note per
announcement, richer payload — same one-note-per-announcement principle Step 3 already
follows for the base insight) rather than writing a second, competing note record for the
same announcement.
Use `usecase: "post-close-scan-insights:standard"` (or `:deep` for the
`HIGH_CONVICTION_CATEGORIES`) as already set by Step 3 — do not switch to
`announcement-info-classifier:standard` here, since that usecase string is for
STANDALONE invocations of that skill and switching would break this run's own note
dedup/cache scoping (see that skill's Step 5 note on `usecase` scoping, and
`skills/_shared/conventions.md`'s Caching section for why the scoping rule exists at all).

This step costs real time/tokens per item (a Step-3 baseline build touches 4 concalls + a
PPT + a full announcement-history scan) — that's exactly why it's capped at 5 rather than
run on every item in the digest. If a selected item's `announcement-insights` category was
already flagged `heavyDocument: true` and skipped in Step 3 (so it has no base read to
build on), it cannot have been selected in the first place — heavy-doc-skipped items never
enter the `add-note` payload set this selection draws from.

## Step 5 — Send the digest

```bash
run send-digest <insights-array.json> --cutoff-human "<human-readable window start>" --stats-file <stats.json>
```

Build `<insights-array.json>` from every `add-note` payload's `note` object across this
run (one array entry per processed, non-heavy, non-routine announcement — significance,
category, companyId, insight text, plus `infoClassification` on the Step 3.5 top-5).
`send-digest` groups by `significance` (high/medium/low, high first) and emails via the
shared `sendHtmlEmail` helper (`@stock/cloud-utils` — same email pipe every other
jobs-runtime script uses, secrets via `loadEnv()`, never hand-rolled SMTP). Subject line
flags the high-conviction count when nonzero so it's visible without opening the email.

**Within a significance bucket, cards are further ranked by a deterministic score**
(`computeRankScore` in `postCloseScanInsights.js`) — `significance` alone still spans a
wide range of how much attention an item actually deserves (a bare-minimum `high` and an
unambiguous M&A announcement are both `high`, but not equally so), so the reader's eye
should land on the strongest item in each bucket first, not whichever happened to be
processed first. The score is purely additive from fields already on the note payload —
no extra fetch, no second model judgment:

- **Category (0-30):** `high_conviction: true` — the taxonomy's own considered judgment
  that this category structurally deserves deep attention.
- **EPS-impact confidence (0-25):** `high`/`medium`/`low` per `epsImpact.confidence`'s own
  rubric (a disclosed rupee figure with a stated date is `high`; a qualitative read with no
  hard number is `low`) — a concretely quantified item is more actionable than a
  vaguely-worded one at the same significance.
- **EPS-impact direction (0-10):** a non-neutral directional call (positive or negative)
  still beats no EPS linkage at all, even when magnitude/confidence is soft.
- **Info-classification NEW-ness (0-35, only on the Step 3.5 top-5):** the fraction of
  claims bucketed NEW, scaled to 35 — this is where the SOIC "new information" framework
  actually earns its keep in the ranking: within the same significance bucket, an
  announcement that's mostly genuinely NEW should outrank one that's mostly
  KNOWN/restated, even though `announcement-insights` judged both equally significant (it
  scores the EVENT's importance, not how much of THIS filing is new information about it).
  Items outside the top-5 score 0 here and fall back to the first three components,
  unaffected — this mirrors `infoClassificationHtml`'s own "absent field renders exactly
  as before" guarantee.
- **Market reaction (0-20, resend only):** `resend-with-market-data` adds a fifth
  component once real `returns1d`/`volRatio7d` exist — `|returns1d|` scaled and capped,
  plus a flat bonus when `volRatio7d` crosses the same >=2.0x spike threshold
  `marketDataHtml` already colors red for. This is deliberately absent from the initial
  nightly send (marketData doesn't exist yet at that point — see the resend command below)
  so the first email's ordering is fully reproducible from the note payload alone; the
  morning resend then re-ranks using what the market actually did overnight, which is a
  legitimate refinement rather than a contradiction of the first email's order: the
  initial send reflects what was judged to matter most that night, and the resend
  reflects what the market itself then agreed mattered most.

**`--stats-file <stats.json>` (added 2026-08-24) renders a pictorial run-summary footer**
— one icon tile per funnel stage so the whole night's routing outcome is graspable at a
single glance, per Darshan's request. Assemble `<stats.json>` yourself across Steps 1-3
(this script has no cross-invocation state, so only the orchestrating run knows the full
funnel) as:

```json
{
  "total": 26,        // inWindow.length from Step 1
  "insights": 11,      // count of add-note calls in Step 3
  "highConviction": 2, // count of those notes where high_conviction was true
  "heavyDocSkipped": 4,// count of log-heavy-skip calls in Step 3
  "routine": 5,        // count of mark-processed calls with NO preceding add-note
  "ocrFailed": 3,       // count of items where read-pdf-with-meta returned ocrFailed:true
  "noiseDropped": 1     // filter-noise output's dropped.length from Step 2
}
```

Every key is optional — omit a key entirely (don't pass `0` for "didn't track this") if
you genuinely didn't count that stage this run; the footer only renders tiles for keys
present in the file. The `ocrFailed` tile additionally renders a highlighted warning strip
when non-zero, since that count means "these announcements were never actually read" — see
"Reading blocked/scanned PDFs" above; this is deliberately impossible to miss without
opening every card.

If `email` param is off, skip this step — the notes are already durably persisted by
Step 3's `add-note` calls regardless of whether a digest is sent.

## Step 6 — Commit the window cursor, then offload & cleanup

```bash
run commit-window       # ONLY after Step 5 (or Step 3, if email is off) completed cleanly
yarn data:push
```

**`commit-window` first, and only on a healthy run.** It durably advances
`cache/post-close-scan-insights-cursor.json` to Step 1's own recorded windowEnd, so the
NEXT run's `fetch-scan` starts exactly where this one left off instead of re-covering
ground already processed (see "Resumable cursor" above). Skip this call if ANYTHING in
Steps 1-4 errored or was left incomplete — an uncommitted cursor just means the next run's
window is a little wider (safe, dedup'd via `mark-processed`); a wrongly-committed one
after a partial failure permanently drops whatever didn't get processed.

`yarn data:push` is MANDATORY even on partial failure (unlike `commit-window`, which is
conditional) — idempotent push of everything under `data/` to Google Drive
(`StockMarket/data/v2`). Push-only — nothing under `data/` is ever deleted. The run is not
complete until this has run, same as every other data-writing skill in this repo
(`skills/_shared/conventions.md` §6).

## Rules

- **Files-touched manifest** (`skills/_shared/conventions.md` §9 /
  `docs/DATA_RULES.md` §7): end the run listing every collection touched (notes DB record
  counts), plus any `cache/`/`runs/` files, plus the `data:push` `↑ <file>` lines.
- One PDF at a time; every meaningful, non-heavy-document, non-routine announcement gets
  its PDF read and an actionable, quantified insight — never from the title alone. This is
  non-negotiable even under a fixed nightly time budget: if the scan returns an unusually
  large `inWindow` set, say so in the final report rather than silently truncating which
  announcements get read.
- Every note this skill writes MUST carry `usecase: "announcement-insights:<depth>"` —
  same scoping rule as `announcement-insights`' "Caching" section, so a note written by
  this skill and a note written by `watchlist-insights` for the SAME announcement (if it
  happens to also be on a watchlist) correctly share the same cache entry rather than
  producing two independent, possibly-contradictory insights.
- All outputs go under `data/` (the shared `db.js`/`StorageService` machinery already
  routes there) — never write data files to the repo root, and always finish with Step 6.
- **Token-optimization suggestion** (standing requirement, `skills/_shared/conventions.md`
  §11): every run ends with a concrete, evidence-based suggestion for the next run — e.g.
  which categories consistently need zero attention and could move to noise-keywords,
  which PDF fetches were cache hits vs. fresh, whether the fixed scan universe is
  returning too many/too few candidates most nights.
