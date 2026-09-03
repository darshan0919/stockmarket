---
name: post-close-scan-insights
description: Full-day corporate-filing signal engine for the "Signals - DND" saved Stockscans announcement scan — runs in several slots across the trading day (mid-session, late session, post-close, evening, night sweep), each covering its own non-overlapping window off a shared resumable cursor so nothing is re-read and no email repeats itself. Fetches the scan's announcements, drops routine noise, reads each PDF, writes a quantified thesis note per filing with an explicit J-curve / PAT-vs-EPS read, runs the strongest items through announcement-info-classifier for a NEW/KNOWN/FOLLOW-UP verdict, scores everything on a deterministic 5-level signal scale (S1-S5, 0-100), and emails a Thesis Card digest per slot plus a market-validated day recap. Closes the loop the next trading day by validating each thesis against actual delivery-backed price action and feeding what it learns back into the prompt. Invoke with --slot for a scheduled run, or with --window-hours for an explicit catch-up over a specific past window.
---

# Post-Close Scan Insights

An **orchestrator**, same shape as `watchlist-insights`, over a different
universe and a different rhythm. Two things distinguish it:

1. **It hunts signals in corporate filings all day, not once at night.** Only
   1.4% of Indian filings arrive overnight; 48% land in the 3.5 hours after
   the close and 21% during the session itself (evidence in "Slot schedule"
   below). A single 2 AM run therefore saw everything roughly half a day
   late — fine for a nightly digest, useless as a signal. It now runs in
   several slots, each covering the slice since the previous one.
2. **It learns.** Every thesis it writes gets checked the next trading day
   against what the stock actually did on delivery-backed volume, and the
   resulting hit/miss ledger is what tunes the next run's judgment. A thesis
   engine with no feedback loop is a generator of confident prose; the
   validation step (Step 8) is what makes it a research process.

Like `watchlist-insights`, this skill does **not** own category extraction.
Reading a PDF and writing an insight is `announcement-insights`'
(`skills/equity-research/announcement-insights/SKILL.md`) job; judging how
much of a filing is genuinely NEW is `announcement-info-classifier`'s
(`skills/equity-research/announcement-info-classifier/SKILL.md`); judging
whether a company is at a re-rating inflection is `rerating-catalysts`'
(`skills/equity-research/rerating-catalysts/SKILL.md`); and answering "what
does the SOIC framework say about this" is `ask-soic`'s
(`skills/tooling/ask-soic/SKILL.md`). This skill's job is to fetch the right
window, route it, compose, deliver, and validate.

Script-first: `packages/jobs-runtime/postCloseScanInsights.js` owns everything
that is pure logic (scan resolution, pagination-to-cutoff, noise filter,
categorisation, signal scoring, digest HTML/email, market-data enrichment,
validation arithmetic). PDF reading, notes lookup and note persistence are NOT
duplicated here — this skill shells out to the same
`packages/jobs-runtime/watchlistInsights.js` commands `announcement-insights`
already uses (`read-pdf-with-meta`, `get-company-notes`, `add-note`,
`mark-processed`, `log-heavy-skip`). Per `skills/_shared/conventions.md` §17,
two skills reading a PDF is the same extraction and goes through the same
cache and the same code, not a second copy.

## The scan universe — resolved live, never hardcoded

**Source of truth: the saved Stockscans announcement-scan named
`Signals - DND`.** `fetch-scan` resolves it at run time via
`GET /api/user/announcement-scans` and uses its `filters` verbatim.

This replaced a literal `DEFAULT_SCAN` object frozen in the script on
2026-08-19 (a copy of an ad-hoc scan then named `Test`). The reason matters
beyond tidiness: the universe is Darshan's decision, expressed by tuning
filters in the Stockscans UI, and every such tune silently failed to reach the
job because the job was reading a year-old snapshot. A universe that drifts
from what the user believes it is produces a digest whose absences can't be
trusted — you can't tell "nothing was filed" from "the filter no longer
matches what I think it matches."

`resolve-scan` prints what the job would use, and `fetch-scan`'s output
carries `scanSource` (`live` | `cache` | `fallback`), `scanName` and
`scanFilterCount`.

**If `scanSource` is not `live`, say so prominently in the run report.** A
cache hit means the filters are the user's real ones but possibly days stale;
`fallback` means the frozen in-source copy was used. Both are the exact
silent-staleness failure this change exists to remove, so a degraded run must
announce itself rather than look like a normal one. A "scan not found" error
means the saved scan was renamed or deleted — the error names every scan it
did see, so fix the name rather than reaching for the fallback.

## Parameters

| Param              | Default        | Meaning                                                                                                                                             |
| ------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--slot <name>`    | `adhoc`        | which scheduled slot this is: `mid-session`, `late-session`, `post-close`, `night`, `pre-open`, `adhoc`. Label only — see "One cursor, many slots". |
| `--window-hours n` | cursor-derived | explicit override for a deliberate catch-up over a past window. Bypasses both the floor and the cursor.                                             |
| `email`            | on             | run `send-digest` at the end (off = just persist notes)                                                                                             |

## Slot schedule — summary

Full evidence, the day-of-filing heatmap it came from, cursor semantics and the
`createdAt` timezone finding are in
`references/slot-schedule.md` — **read it before changing slot times or the
window logic.** The essentials:

| Slot           | IST                    | Covers                                      | ~Share of day |
| -------------- | ---------------------- | ------------------------------------------- | ------------: |
| `mid-session`  | 13:00                  | overnight + morning                         |          ~12% |
| `late-session` | 15:45                  | midday + pre-close ramp                     |          ~11% |
| `post-close`   | 19:15                  | **the 15:30-19:00 peak**                    |          ~48% |
| `night`        | 21:45                  | evening + 21:30 spike                       |          ~19% |
| day recap      | 23:45                  | whole day, re-ranked by settled market data |             — |
| validation     | next trading day 20:00 | prior day's theses vs actual price action   |             — |

`post-close` (19:15) is the load-bearing run — 48% of a day's filings land in the
window it covers, including the single densest 30-minute bucket of the day
(18:30-19:00, 11.4%). If only one slot can run, it is that one.

**All slots share ONE cursor.** `--slot` is a label for the email subject and
header; it does not scope the cursor. Consecutive slots therefore tile the day
with no gaps and no overlap — which is simultaneously what captures everything,
what prevents re-reading a PDF, and what keeps consecutive emails from repeating
each other. Per-slot cursors would break all three. Commit rules and the
weekend/holiday floor are in the reference.

## Setup

```bash
JOB=$(find /sessions -path '*packages/jobs-runtime/postCloseScanInsights.js' -not -path '*/node_modules/*' 2>/dev/null | head -1)
WI_JOB=$(find /sessions -path '*packages/jobs-runtime/watchlistInsights.js' -not -path '*/node_modules/*' 2>/dev/null | head -1)
run(){ node "$JOB" "$@"; }
runwi(){ node "$WI_JOB" "$@"; }
```

Do NOT export `WI_DATA_DIR`/`WI_NOTES_DIR`/`COWORK_ENV` — both scripts resolve
everything via `loadEnv()` (repo-root `.env`) and `<repo>/data/`, same as every
other jobs-runtime script (`skills/_shared/conventions.md` §2).

**Network note:** the Stockscans API is reachable from a cloud/CI environment
but has been observed blocked (`403 blocked-by-allowlist`) from some
local-network paths. If `fetch-scan` or `resolve-scan` fails with a network/403
error, re-run from an environment with open network access rather than assuming
the token is bad — check the error body first; an expired
`STOCKSCANS_AUTH_TOKEN` message is unambiguous and different from a block.

## Step 1 — Resolve the universe and fetch the window

```bash
run resolve-scan                                # inspect which filters will be used
run fetch-scan --slot post-close                # normal scheduled run
run fetch-scan --slot adhoc --window-hours 34   # explicit catch-up after a missed day
```

Paginates the resolved scan (30/call per the documented `announcements/scan`
convention — `docs/stockscans-api-schemas.md`) until it crosses the cutoff.
Returns `{cutoffUtc, windowStartIstHuman, windowEndIstHuman, slot, slotLabel,
scanSource, scanName, scanFilterCount, quarterDate, totalFetched, inWindow}`.
Save `inWindow` to a file for the next step, and pass
`windowStartIstHuman` straight through to `send-digest --cutoff-human` rather
than computing your own window string (getting that wrong silently mislabels
the email's own claimed window).

`fetch-scan` also writes the pending-window marker Step 7's `commit-window`
reads back. **Don't call `fetch-scan` twice for the same cycle** — the marker
would point at the later call's window.

Note the pagination stop condition is deliberately tolerant: it requires TWO
consecutive zero-in-window pages before concluding it has walked past the
cutoff, because the API's newest-first ordering has been observed unreliable (a
single page came back entirely out-of-window while newer in-window items
existed elsewhere — 2026-08-31 incident). One unlucky page must not truncate a
whole window to empty.

## Step 2 — Filter noise, then categorise

```bash
run filter-noise <fetch-scan-output.json>     # -> {kept, dropped}
run categorise <filter-noise-output.json>     # -> [{companyId, category, heavyDocument, highConviction, alreadyProcessed, pdfUrl, ...}]
```

Both reuse the SAME shared modules `watchlist-insights` uses —
`stock-api/src/utils/announcementNoiseFilter.js` (keyword lists, one shared
source of truth, editable via the app) and
`packages/jobs-runtime/lib/announcementTaxonomy.js` (`categoriseAnnouncement`,
`HEAVY_DOCUMENT_CATEGORIES`, `HIGH_CONVICTION_CATEGORIES`). Deliberate: a
company filtered or categorised one way by `watchlist-insights` must never get
a different answer here just because a different skill read the same document.
Both are asking the same objective question about the same taxonomy.

Record `dropped.length` — it is the `noiseDropped` (keyword-filtered) footer
stat, and one of the numbers Darshan reads the footer for.

**Known taxonomy gaps exist** — a bare `"PPT <Month> <Year>"` title, generic
`"Scheme of Arrangement"` language, and a generic `"Press Release"` title all
mis-categorise in ways that matter. See `references/routing-rules.md`.

## Step 3 — Route each item

For EACH item from Step 2:

**`alreadyProcessed: true` → skip immediately.** Do not call
`announcement-insights`, do not `add-note`. Computed deterministically by
`categorise` against the notes DB's
`processedAnnouncements`/`processedByUsecase` state. Before this flag existed
(added 2026-08-31) nothing enforced the check in code — it relied on the
orchestrating agent remembering to look it up, and that gap produced real
duplicates in production (NSE:STLTECH, VARROC and RAMRAT each got two
near-identical notes for the same `announcementId` from two runs ~4h apart).
Trust the flag; don't re-derive it from `get-company-notes`, which is both
redundant and slower.

**`heavyDocument: true` → skip, don't call `announcement-insights`:**

```bash
runwi log-heavy-skip '<json: {companyId, name, title, category, heavyDocumentSkipReason, announcementId, date}>'
runwi mark-processed "<companyId>" "<announcementId>" "heavy-doc-skip"
```

Same four categories as `watchlist-insights` (`results`,
`concall_transcript`, `investor_presentation`, `annual_report`) — full
rationale in that skill's Step 2, not repeated here.

**Otherwise, run `announcement-insights`' Steps 1-4** exactly as documented
(`read-pdf-with-meta` → `get-company-notes` → `insight-template` → judge →
`add-note` → `mark-processed`), with the thesis rules in Step 4 below layered
on top. Depth: `deep` for the four `HIGH_CONVICTION_CATEGORIES`, `standard`
otherwise.

Routine items that survived the noise filter but are genuinely uninteresting
on read: just `runwi mark-processed "<companyId>" "<announcementId>"` and move
on. No insight, no heavy-skip log. Count these — they are the `routine` stat.

### Standing judgment rules that override "looks routine"

**Read `references/routing-rules.md` before marking anything routine.** Three
rules there override the obvious read, each traceable to a specific run that got
it wrong:

- **`shareholding_change` (SAST)** — cross-check the day's `dealsDigest`
  snapshot for a priced rupee value before defaulting to routine; and an
  intra-promoter transfer netting to ~₹0 can still matter for governance.
- **`ocrFailed: true` is a hard stop** — never fold an unread scanned PDF into a
  routine `mark-processed`. A run once marked four such SAST filings routine, one
  of which was a ₹979cr pledge-revoke.
- **A small rupee figure does not make a `general` item low-signal** — judge by
  "did the company's state change," not the absolute amount.

Also: `highConviction: true` means "look harder," not "conclude significant."

## Step 5 — Info-classify the strongest items (top 5)

Once Step 4 has produced this run's full `add-note` payload set, select up to 5
and run `announcement-info-classifier`'s Steps 3-4 on each, so the digest
carries not just "what happened" but "how much of this is actually new."

**Selection: by signal score, descending, up to 5.** Rank by the deterministic
`signalScore` (see Step 6), take the top 5. If fewer than 5 non-routine items
exist, classify however many qualify — don't pad, don't skip the step because
the count is under 5. Zero non-routine items means zero classifications: a
normal quiet window, not an error.

**Reuse this run's own Step 4 read — don't call `announcement-insights` again.**
Each selected item already has its base read (`insight`, `headline`,
`category`, `thesisChain`), which satisfies the classifier's Step 2 in full. Go
straight to its Step 1 (companyId, already known) and Step 3 (build the
"already known" baseline: last 4 concalls, latest PPT, full announcement
history via `scanAnnouncements` with `companyFilters: [{companyId}]` and
`searchMode: "full"`, notes DB + thesis file via `buildCompanyContext`), then
its Step 4 (bucket every claim NEW / KNOWN / FOLLOW-UP, write the
signal-strength verdict).

**Its Step 3e same-day/adjacent-filing exclusion rule matters more here than
usual.** A slot window is exactly where a board-outcome filing and its
companion press release both land in the same `inWindow` set, and treating one
as "prior knowledge" for the other is the precise mistake that rule exists to
prevent — it would classify a genuinely new event as KNOWN because the company
announced it twice in ninety minutes.

Attach the result as `infoClassification` on that item's insight object (same
`{claims[], verdict, baselineCoverage}` shape), and fold it into the SAME
`add-note` payload Step 4 already writes — do NOT call the classifier's own
Step 5 `add-note` separately. One note per announcement with a richer payload,
not two competing note records for the same filing. Keep
`usecase: "announcement-insights:<depth>"` as Step 4 set it; do not switch to
`announcement-info-classifier:standard`, which is for standalone invocations
and would break this run's note dedup/cache scoping.

This step costs real time and tokens per item (a baseline build touches 4
concalls, a PPT and a full history scan) — which is exactly why it is capped at
5 rather than run across the digest. A heavy-doc-skipped item can never be
selected, since it never entered the payload set this draws from.

## Step 6 — Signal strength: 5 levels, and the score is on the card

Cards are grouped and ranked by a deterministic **0-100 signal score** mapped to
**five tiers (S1 Critical, S2 High, S3 Moderate, S4 Low, S5 Marginal)**, and the
score is rendered on every card as a chip (`S2 High · 75/100`). Computed by
`computeSignalScore`/`signalTierFor` in `lib/thesisCardEmail.js`. Nothing to
pass — it derives from fields already on the note payload.

**You still judge `significance` as `high`/`medium`/`low`/`routine`, exactly as
before** — the extra resolution is derived, not asked for. Asking a model for
five labels adds a judgment call it isn't well-calibrated to make consistently
across runs, and would orphan every note already written by the four skills that
share this note cache. The resolution comes instead from evidence already
computed: category conviction, how hard the EPS number is, how much of the filing
is genuinely NEW, and — on the day recap only — what the market did.

Bands are non-overlapping, so a tier never surprises relative to its label: a
`medium` note can top its band but can never present as a top-tier signal on
evidence weights alone. `high` → 60-100 (S1/S2), `medium` → 35-59 (S3/S4),
`low` → 15-34 (S4/S5), `routine` → 0-14 (S5).

**What this means for you in practice:** the strongest lever you have on where a
card lands is not the significance label but the _quality of the evidence you
attach_ — a hard, dated rupee figure (`epsImpact.confidence: high`) moves a card
materially up its band, and a vague qualitative read pins it at the floor. That
is intentional: it rewards doing the arithmetic in 4b rather than gesturing at
it.

## Step 7 — Send the slot digest

```bash
run send-digest <insights-array.json> \
  --slot post-close \
  --cutoff-human "<windowStartIstHuman from Step 1>" \
  --stats-file <stats.json> \
  --knowledge-gaps <gaps.json>      # omit if no gaps were hit
```

Build `<insights-array.json>` from every `add-note` payload's `note` object
across this run (one entry per processed, non-heavy, non-routine announcement,
plus `infoClassification` on the Step 5 top-5).

**`send-digest` also merges cached notes since the resolved cutoff** — every
`announcement-insights:*` note across ALL companies whose `createdAt` is at or
after the cutoff, deduped by `announcementId` (or companyId + insight text for
pre-`announcementId` notes). With a committed cursor that cutoff IS this slot's
window start, which is what keeps consecutive slot emails free of repetition
while still including anything another skill (e.g. `watchlist-insights` covering
the same company) processed inside this window. Only notes with insight text are
pulled; routine/noise-filtered items never had a note, so noise can't be
resurrected.

`--slot` labels the subject and header (`[Post-close] Announcement Signals — …`)
so several digests a day are distinguishable in an inbox; the subject also
carries the S1/S2 count when nonzero. Email goes via the shared `sendHtmlEmail`
helper (`@stock/cloud-utils`) — secrets via `loadEnv()`, never hand-rolled SMTP.

### `--stats-file` — the full funnel

The footer renders one icon tile per funnel stage plus a per-tier strip, so a
window's whole routing outcome is graspable at a glance. Assemble it yourself
across Steps 1-4 (only the orchestrating run sees every stage; the script's
commands are separate process invocations with no shared state):

```json
{
  "total": 41, // inWindow.length from Step 1
  "noiseDropped": 9, // filter-noise dropped.length — the keyword filter
  "alreadyProcessed": 4, // categorise items with alreadyProcessed:true
  "heavyDocSkipped": 5, // log-heavy-skip calls
  "routine": 7, // mark-processed calls with NO preceding add-note
  "ocrFailed": 1, // read-pdf-with-meta returned ocrFailed:true
  "insights": 6, // add-note calls
  "highConviction": 1, // of those, high_conviction true
  "infoClassified": 5, // Step 5 classifications run
  "knowledgeGaps": 1 // entries in the knowledge-gaps file
}
```

Every key is optional — **omit a key entirely rather than passing `0`** when you
genuinely didn't track that stage; the footer only draws tiles for keys present.
`total` should reconcile against the rest (`noiseDropped + alreadyProcessed +
heavyDocSkipped + routine + insights` ≈ `total`); if it doesn't, say so in the
run report rather than quietly shipping numbers that don't add up.

The **per-tier counts (S1-S5) are computed by the renderer from the cards it
actually draws**, not passed in — a hand-counted footer drifting from the
rendered body is exactly the kind of quiet inconsistency that makes a reader
stop trusting the numbers. The `ocrFailed` tile additionally renders a
highlighted warning strip when non-zero, since that count means "these were
never actually read."

If `email` is off, skip this step — Step 4's `add-note` calls already persisted
everything.

## Step 8 — Commit the cursor, then push

```bash
run commit-window       # ONLY after Step 7 (or Step 4, if email is off) completed cleanly
yarn data:push
```

`commit-window` advances `cache/post-close-scan-insights-cursor.json` to Step
1's recorded windowEnd so the NEXT slot starts exactly where this one stopped.
**Skip it if anything in Steps 1-7 errored or was left incomplete** — see the
commit rules under "One cursor, many slots" for why the asymmetry matters.

`yarn data:push` is MANDATORY even on partial failure (unlike `commit-window`,
which is conditional) — idempotent push of everything under `data/` to Google
Drive (`StockMarket/data/v2`). Push-only; nothing under `data/` is ever deleted.
The run is not complete until it has run
(`skills/_shared/conventions.md` §6).

## Step 9 — Day recap with settled market data

```bash
run resend-with-market-data [--date YYYY-MM-DD]
```

Runs once at ~23:45 IST. Does NOT re-fetch announcements or re-run any PDF
analysis — it reloads the day's already-persisted notes
(`db.find('notes', {date, type:'announcement'})`) and enriches each card with a
market line: **1D return · Mcap · Delivery % · Delivery Value ₹Cr · Deliv/Mcap %
· Vol/7D-Avg**, then re-ranks by signal score with the market-reaction component
now live.

`Mcap` and `Deliv/Mcap %` were added 2026-09-04 for the same reason
`gainers-signal` added them to its own metric line: **an absolute delivery
figure is not comparable across a universe spanning ₹300cr to ₹70,000cr.** ₹40cr
of delivery is conviction in a ₹500cr company and rounding error in a ₹40,000cr
one. Both axes are always shown together — delivery percentage alone misleads at
both ends of the range (the discussion in `gainers-signal`'s SKILL.md is the
same argument). Coloured on the same `DV_MCAP_NOTABLE`/`DV_MCAP_STRIKING` bands
(amber ≥1%, red ≥2.5%) the scan emails use, so a reader who has learned what red
means doesn't have to re-learn it per email type. A missing input yields `null`,
never `0` — a company that couldn't be measured must not sort as though it was
measured and found nothing.

**This is the one email that deliberately spans the whole day** rather than a
single slot. The slot digests each cover their own non-overlapping window, so
nothing else gives a consolidated view; here the repetition is earned, because
the set is re-ranked by a genuinely new dimension — what the market did — rather
than sent twice in the same order.

Volume ratio is (that date's volume) ÷ (average daily volume of the 7 trading
days strictly before it), via `gainersScanner.js`'s `fetchPrices` rather than a
second OHLCV implementation (§17). Because `fetchPrices` always returns the
latest candles, a `--date` far in the past may legitimately resolve to `null` —
that's correct behaviour, not a failure.

## Step 10 — Validate against the next market day, and learn from it

This is the half of the workflow that makes it a research process rather than a
prose generator. Every thesis written during a trading day is checked against
what the stock actually did in the **next** session.

```bash
IV=$(find /sessions -path '*packages/jobs-runtime/insightValidator.js' -not -path '*/node_modules/*' | head -1)
node "$IV" run                              # normal: runs all three validation sources
node "$IV" validate-post-close 2026-09-03   # on-demand for one source date
```

**It runs inside `insight-validation`, not here.** That skill already validates
two sources (watchlist notes at D, `gainers-signal` HIGH picks at D+2); this is
a third source on the same machinery. A separate validator would mean a second
NSE bhavcopy parser, a second delivery-backed classifier and a second ledger,
all drifting apart while claiming to measure the same thing
(`skills/_shared/conventions.md` §17). `validate-post-close`'s summary section
is folded into the same nightly validation email.

**Why D+1.** These announcements are filed mostly after the 15:30 close, so the
source day's own price action happened before the filing existed and cannot
reflect it — validating at D would measure noise and call it a result. The next
session is the first market in which the thesis is falsifiable at all. (D+2,
which `gainers-signal` uses, is right for a momentum signal that needs room to
run; for "did the market agree this filing mattered," the first session is the
cleanest read, before unrelated news accumulates.)

**Three axes, deliberately scored separately** — collapsing them into one
pass/fail hides which part of the process was wrong, which is the only reason to
run this at all:

1. **Direction** — did the stock move the way `epsImpact.direction` implied? A
   `positive` read followed by a fall is a miss no matter how well argued.
2. **Structure** — was the move delivery-backed (`structuralSignal`'s
   STRONG/MODERATE) or a thin blip (WEAK/NOISE)? A correct direction on a NOISE
   move is not a validated thesis; it is a coin flip that landed.
3. **Calibration** — was the SIZE of the reaction consistent with the tier
   assigned? Expected absolute D+1 moves: S1 ≥4%, S2 ≥2.5%, S3 ≥1.5%, S4 ≥0.75%.

A thesis counts as `validated` only when direction AND structure agree.

**The finding to hunt for is `under_rated`:** a tier-4/5 note whose stock moved
≥3% on delivery-backed volume. An over-rated S1 is mildly interesting; an
under-rated S4 names a class of announcement the scoring is _systematically_
discounting, which is a fixable defect in `computeSignalScore` rather than a
one-off judgment error. Weight your attention accordingly.

**Ledger and proposals.** Records persist to the validation collection
(`type: postclose-followup`) with the full DTO envelope. Once a category or tier
has ≥8 samples, `postCloseProposals` emits **proposals only, never
auto-applied** — same discipline as the existing validator:

- `direction_miscall` (≤35% hit rate over ≥8 samples) — the category's EPS
  direction reasoning may be inverted. A fundraise read as dilutive when it is
  actually deleveraging-accretive produces exactly this signature, which is the
  concrete reason Step 4b exists.
- `candidate_noise_keyword` (≤20% delivery-backed, <1% average move) — the
  market consistently doesn't react; candidate for
  `announcementNoiseFilter.js`, saving a PDF read and a model call per instance.
  Confirm no individual sample was material before proposing it.
- `tier_over_scored` / `tier_under_scored` — fix the band weights in
  `computeSignalScore`, not per-note judgment. A systematic miscalibration is a
  code change; treating it as a judgment error means re-making it every night.

Read these each run and act on the ones with enough samples behind them. A
proposal repeated across weeks with a growing sample count is the signal; a
single day's ledger is noise, and treating it as instruction is how a working
prompt gets tuned into a broken one.

## Rules

- **Files-touched manifest** (`skills/_shared/conventions.md` §9 /
  `docs/DATA_RULES.md` §7): end every run listing every collection touched
  (record counts), every `cache/`/`runs/` file, and the `data:push` `↑ <file>`
  lines.
- **One PDF at a time; no title-only insights.** Every meaningful, non-heavy,
  non-routine announcement gets its PDF read and a quantified insight. If a
  window returns an unusually large `inWindow` set, say so in the run report
  rather than silently truncating which announcements get read — an unreported
  truncation makes the digest's absences meaningless.
- **Report the scan source.** If `scanSource` is not `live`, that goes in the
  run report prominently.
- **Every note carries `usecase: "announcement-insights:<depth>"`** — same
  scoping rule as `announcement-insights`, so a note written here and one
  written by `watchlist-insights` for the SAME announcement share one cache
  entry rather than producing two possibly-contradictory insights.
- **All outputs go under `data/`** (the shared `db.js`/`StorageService`
  machinery routes there) — never write data files to the repo root, and always
  finish with Step 8's `data:push`.
- **Reconcile the funnel.** `noiseDropped + alreadyProcessed + heavyDocSkipped +
routine + insights` should approximately equal `total`. If it doesn't, say so
  rather than shipping numbers that don't add up.
- **Token-optimization suggestion** (standing requirement,
  `skills/_shared/conventions.md` §11): end every run with one concrete,
  evidence-based suggestion for the next — which categories consistently need
  zero attention and could move to noise keywords, which PDF fetches were cache
  hits vs. fresh, whether a slot's window is returning too many or too few
  candidates. Ground it in this run's actual counts, not in general advice.
