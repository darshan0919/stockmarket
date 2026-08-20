---
name: post-close-scan-insights
description: Nightly post-market-close corporate-announcement digest for a fixed ad-hoc Stockscans scan (mid/small-cap, price above 200DMA, meaningful retail holding, liquid) — fetches every announcement filed after that day's 3:30 PM IST close, drops routine noise, reads each PDF, writes an actionable quantified insight per category, and emails a digest grouped by significance (high/medium/low). Invoke with defaults for the nightly 2 AM run, or on demand with an explicit --window-hours override to re-run a specific evening's post-close activity.
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
(`skills/equity-research/announcement-insights/SKILL.md`) job. This skill's job is: fetch
the right announcements, filter noise, categorise, route heavy documents away, then hand
each remaining announcement to `announcement-insights`, and finally digest+email.

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

| Param             | Default                                   | Meaning                                                                                                   |
| ------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `--window-hours`   | deterministic (see below)                  | explicit override — use for a deliberate re-run of a specific past evening. Leave unset for the nightly run. |
| `email`            | on                                         | run `send-digest` at the end (off = just persist notes)                                                     |

### Why the window is "since the most recent 3:30 PM IST close", not a resumable cursor

`watchlist-insights` uses a resumable cursor (`cache/watchlist-insights-cursor.json`)
because a missed/late run there could silently create a multi-day gap. This skill is
simpler by design: it runs once nightly at ~2 AM IST, a few hours after that same day's
3:30 PM close — there is no earlier same-day run whose gap it needs to protect against. If
a nightly run is genuinely missed (the scheduled task itself fails to fire), catch up
explicitly with `--window-hours 34` (or however many hours cover the gap) rather than
silently auto-expanding — same reasoning as `watchlist-insights`' "cursor stale beyond 30
days is an error, not a silent backfill", just without needing the cursor machinery for
the common case.

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
run fetch-scan                          # deterministic "since yesterday's 3:30 PM IST close" — normal nightly run
run fetch-scan --window-hours 34        # explicit catch-up after a missed run
```

Paginates the fixed ad-hoc scan (30/call, per the documented `announcements/scan`
convention — see `docs/stockscans-api-schemas.md`) until it crosses the cutoff, since
results are returned newest-first. Returns `{cutoffUtc, quarterDate, totalFetched,
inWindow}`. Save `inWindow` to a file for the next step.

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
  *how much attention* the announcement gets, not what to conclude about it.
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

## Step 4 — Send the digest

```bash
run send-digest <insights-array.json> --cutoff-human "<human-readable window start>"
```

Build `<insights-array.json>` from every `add-note` payload's `note` object across this
run (one array entry per processed, non-heavy, non-routine announcement — significance,
category, companyId, insight text). `send-digest` groups by `significance`
(high/medium/low, high first) and emails via the shared `sendHtmlEmail` helper
(`@stock/cloud-utils` — same email pipe every other jobs-runtime script uses, secrets via
`loadEnv()`, never hand-rolled SMTP). Subject line flags the high-conviction count when
nonzero so it's visible without opening the email.

If `email` param is off, skip this step — the notes are already durably persisted by
Step 3's `add-note` calls regardless of whether a digest is sent.

## Step 5 — Offload & cleanup (MANDATORY, even on partial failure)

```bash
yarn data:push
```

Idempotent push of everything under `data/` to Google Drive (`StockMarket/data/v2`).
Push-only — nothing under `data/` is ever deleted. The run is not complete until this has
run, same as every other data-writing skill in this repo (`skills/_shared/conventions.md`
§6).

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
  routes there) — never write data files to the repo root, and always finish with Step 5.
- **Token-optimization suggestion** (standing requirement, `skills/_shared/conventions.md`
  §11): every run ends with a concrete, evidence-based suggestion for the next run — e.g.
  which categories consistently need zero attention and could move to noise-keywords,
  which PDF fetches were cache hits vs. fresh, whether the fixed scan universe is
  returning too many/too few candidates most nights.
