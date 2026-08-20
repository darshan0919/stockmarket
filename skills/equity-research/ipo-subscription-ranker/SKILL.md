---
name: ipo-subscription-ranker
description: Daily IPO subscription-quality ranker. Scans IPOPlatform's Closed IPOs + Live Subscription Status pages for IPOs listing the next trading day, merges QIB/sHNI/bHNI/NII/RII/Total subscription figures, computes a deterministic subscription quality score and rank, runs the full drhp-ipo-analysis DRHP/RHP deep-dive on the top 3, and emails a digest (full ranked table + top-3 rationale + DRHP verdicts). Use for "IPO subscription digest", "which IPOs listing tomorrow are worth a look", "rank today's IPOs by subscription quality", or when the daily-ipo-subscription-analysis-stockmarket scheduled task runs.
---

# IPO Subscription Ranker

Ranks the IPOs listing tomorrow by the _quality_ of their subscription (not just the
headline multiple), and fast-tracks the top 3 into a full `drhp-ipo-analysis`
subscription-decision read — so the daily email answers both "which of tomorrow's
listings had real institutional conviction" and "should I actually apply/hold."

## Conventions

Follow [`_shared/conventions.md`](../_shared/conventions.md) in full. This skill is a
worked example of §17 (Extraction First, Analysis Second): **all fetching, parsing,
merging, and scoring is a companion script — no HTML parsing or arithmetic happens in
this skill's own reasoning.** The only things an LLM does in this workflow are: (a)
the `drhp-ipo-analysis` pass on the top 3, and (b) writing the short ranking
narrative that goes in the email. Everything else, every run, comes from the script.

## Architecture (script-first, per `skills/tooling/cowork-task-architect/SKILL.md`)

| Step | What                                                        | Who                             |
| ---- | ----------------------------------------------------------- | ------------------------------- |
| 1    | Scrape + filter + merge + score + persist `ipos` collection | Script (Extraction)             |
| 2    | Full DRHP/RHP analysis for the top 3                        | `drhp-ipo-analysis` skill (LLM) |
| 3    | Ranking narrative (1-3 sentences + per-IPO rationale)       | This skill (LLM, judgment)      |
| 4    | Render HTML + send email                                    | Script (deterministic render)   |

## Workflow

### Phase 1 — Run the scanner script

```bash
node packages/jobs-runtime/ipoSubscriptionScanner.js \
  --out data/runs/ipo_subscription_<DATE>.json
```

(Fallback: `https://raw.githubusercontent.com/darshan0919/stockmarket/main/packages/jobs-runtime/ipoSubscriptionScanner.js`)

This does everything deterministic in one pass (see the script's own header for the
full breakdown):

1. Fetches `https://www.ipoplatform.com/ipo/closed` and
   `https://www.ipoplatform.com/ipo/subscription-status`.
2. Filters to IPOs whose Listing Date is tomorrow (IST) — that's the day's universe.
3. Merges Total/QIB/sHNI/bHNI/NII/RII/Employee/Shareholder subscription figures onto
   each universe IPO (joined by IPOPlatform's numeric id).
4. Fetches each universe IPO's detail page once to recover a "Read RHP"/"Read DRHP"
   link if IPOPlatform has one published, AND (2026-08-11) the `retailSharesOffered`
   figure from that same page's "Share Allocation" block
   (`parseRetailSharesOffered()`) — used to compute `retailFloatCr` below.
5. Computes TWO scores per IPO — `listingScore`/`listingTier` (predicts listing-day
   gain) and `cagrScore`/`cagrTier`/`cagrConfidence` (predicts longer-run daily-CAGR
   performance) — per
   [`references/ipo_ranking_framework.md`](references/ipo_ranking_framework.md)'s
   "Dual-score system" section. **Do not recompute or second-guess either score by
   reasoning about the raw multiples yourself; the formulas are the source of
   truth.** `rank`/`ranked[]` order is by `listingScore`.
6. **Retail-float filter (2026-08-11 ask).** Computes `retailFloatCr = retailSharesOffered
× issuePrice / 1e7` per IPO and flags `retailFloatFiltered: true` for anything below
   `RETAIL_FLOAT_FILTER_CR` (₹50cr — the constant in `ipoSubscriptionScanner.js`, change
   it there, not here, if the threshold is ever revised). "Retail float" here means the
   ₹ value of shares reserved for Individual/Retail Investors specifically — NOT the
   total issue size and NOT post-listing free float; see that constant's neighboring
   comment for the full definition and why it can't be back-derived from the Closed-IPOs/
   Subscription-Status tables alone. `top3[]` selection (`combinedScore = listingScore ×
0.7 + cagrScore × 0.3`, 2026-08-09) is computed ONLY over IPOs where
   `retailFloatFiltered` is false — a filtered IPO never enters `top3[]` regardless of how
   high its score is, and therefore never reaches Phase 2's `drhp-ipo-analysis` pass
   either. Filtered IPOs still appear in `ranked[]` (the full table) so the daily
   universe never silently shrinks — only the top3/DRHP research spend does. If the
   detail-page scrape didn't yield a retail-shares figure, the IPO is flagged
   `retailFloatUnknown: true` and is **NOT** filtered (fail open, not closed — an
   unmeasured float must never be treated as "confirmed small"); call this out in the
   Phase 3 narrative if it happens rather than letting it pass silently.
7. Persists one record per IPO to the `ipos` collection (`db.upsertMany('ipos', ...)`,
   id = `ipo_<ipoPlatformId>`, including `retailFloatCr`/`retailFloatFiltered`/
   `retailFloatUnknown`) and prints the ranked DTO (`ranked[]`, `top3[]`,
   `retailFloatExcludedCount`) to stdout / the `--out` file.

If the universe is empty (`universeSize: 0` — no IPOs list tomorrow), skip straight to
Phase 4 with a "nothing listing tomorrow" email — do not fabricate a top-3 section.
Same if every IPO in the universe gets retail-float-filtered (`top3.length === 0` but
`universeSize > 0`) — the email's own logic already renders "all N IPOs excluded on
retail-float grounds" for that case (`ipoDigestEmail.js`), don't invent a top-3
narrative to fill the gap.

**`drhpLink` is best-effort, verify before trusting it.** IPOPlatform's "Read RHP"
anchor sometimes resolves to a grey-market-premium tracker page instead of the actual
prospectus PDF (observed live during this skill's build — see git history). Before
handing a `drhpLink` to `drhp-ipo-analysis` in Phase 2, sanity-check that it actually
looks like a document link (ends `.pdf`/`.zip`, or is a company investor-relations
page that plausibly hosts one). If it doesn't, fall back to `WebSearch` or the
`detailUrl`/`reviewUrl` (IPOPlatform's own review page usually links the official NSE
Emerge / BSE SME / SEBI filing) to locate the real RHP.

### Phase 2 — `drhp-ipo-analysis` on the top 3

For each of `top3[]` (fewer if the universe has fewer than 3 IPOs, OR if fewer than 3
survive the Phase 1 retail-float filter — never pad with a 4th-ranked/filtered-out IPO
to force a top 3, and never run this phase for an IPO with `retailFloatFiltered: true`
even if you personally think its fundamentals look interesting — that judgment call
was already made deterministically in Phase 1, not here), run the
[`drhp-ipo-analysis`](../drhp-ipo-analysis/SKILL.md) skill with the verified RHP/DRHP
link (or detail page URL as a last resort — that skill can resolve official filing
links from a company/exchange page). This produces the full 10(+8)-section subscription-
decision PDF per that skill's own workflow — do not re-implement any part of it here.

Capture, from each analysis run: the `subscription_view` verdict, the rendered PDF
path (`data/drhp-ipo-analysis/<Company>_Output.pdf` — treat this as authoritative per
that skill's rules), and the `reports/<id>.json` id, for use in Phase 3/4.

### Phase 3 — Ranking narrative (the only original judgment in this skill)

Read the full `ranked[]` list from Phase 1's output. Using
[`references/ipo_ranking_framework.md`](references/ipo_ranking_framework.md) as the
interpretive lens (why QIB > HNI > RII, what a mismatched category profile implies),
write:

- `rankingSummary` — 1-3 sentences on today's batch as a whole (e.g. broad-based
  strength vs one outlier vs a thin/weak day). If the universe has 1 IPO, say that
  plainly rather than manufacturing a comparison. If `retailFloatExcludedCount > 0`,
  mention it here too (e.g. "the only other IPO listing tomorrow, X, was excluded from
  Top 3 on retail-float grounds (₹Ycr, below the ₹50cr threshold)") — the email's
  full-table already flags this visually, but the summary line is where a reader who
  only skims the top gets the same context.
- Per top-3 IPO: `rationale` (why it ranks where it does — reference the specific
  category imbalance/strength, not just "high score"), `subscriptionView` (the
  `drhp-ipo-analysis` verdict from Phase 2 if it ran, else the scanner's
  `subscriptionQualityTier`), `drhpReportUrl` (the LOCAL repo-relative path to the
  Phase 2 PDF, e.g. `data/drhp-ipo-analysis/<Company>_Output.pdf` — NOT a Drive URL;
  `ipoDigestEmail.js` resolves that itself in Phase 5, which is why Phase 4's push
  must happen first).

Assemble this into the narrative JSON shape documented in `ipoDigestEmail.js`'s
header — **`{"rankingSummary": "...", "byIpoId": {"<ipoId>": {"rationale": "...",
"subscriptionView": "...", "drhpReportUrl": "..."}}}`, a `byIpoId` object keyed by
each IPO's numeric `ipoId` string, NOT a flat `top3`/`ranked` array.** This is an
easy shape to get wrong because it looks like it should mirror the scanner DTO's own
`top3[]` array — it must not. `ipoDigestEmail.js` reads `narrative.byIpoId[ipoId]`
directly for each top-3 card's rationale, subscription view, and DRHP PDF link; if
this is a flat array instead, every one of those goes silently missing from the
email (fixed 2026-08-11 with a `normalizeNarrative()` recovery-with-warning
fallback in that file, but don't rely on the fallback — write it in the correct
shape the first time). Write this to
`data/runs/ipo_subscription_narrative_<DATE>.json` (a run artifact — regenerable
from this run's reasoning, not a `notes`/`reports` record on its own).

If a top-3 IPO's company can be resolved to a companyId (it will not yet have an
NSE/BSE symbol before actually listing — this is normal, not an error), additionally
write a short note via `db.appendNotes([...])` (`type: "ipo-subscription-rank"`,
`companyId`, `creator: "ipo-subscription-ranker"`, `modelUsed: "<the exact model
string running this>"`) so it surfaces in `buildCompanyContext` once the stock is
trading and picked up by other skills (thesis engine, gainers classifier, etc.).
Don't block the run if no companyId is resolvable yet — this is best-effort, not a
required step.

### Phase 4 — Push to Drive BEFORE sending the email

```bash
yarn data:push
```

(Fallback if `yarn` is unavailable: `node packages/jobs-runtime/scripts/data.js push`
— same idempotent Drive push, just invoked directly.)

**This must run before Phase 5, not just after.** `ipoDigestEmail.js` links to the
Phase 2 `drhp-ipo-analysis` PDF via `db.resolveDriveUrl()`, which reads the file's
`driveId` out of `_meta/sync-state.json` — a value that only exists once this push has
uploaded the PDF. Writing the email before this push means `resolveDriveUrl()` finds
nothing and the email correctly (but unhelpfully) shows "pending Drive sync" instead
of a working link. `data:push` is idempotent (`docs/DATA_RULES.md` §5) so running it
here and again in Phase 6 is safe and cheap — it only uploads files that changed.

### Phase 5 — Render + send the email

```bash
node packages/jobs-runtime/ipoDigestEmail.js \
  --dto data/runs/ipo_subscription_<DATE>.json \
  --narrative data/runs/ipo_subscription_narrative_<DATE>.json
```

(Fallback: `https://raw.githubusercontent.com/darshan0919/stockmarket/main/packages/jobs-runtime/ipoDigestEmail.js`)

Pure render + `sendHtmlEmail` — no content decisions happen here (per
`skills/_shared/pdf-design-guide.md`'s data-layer/UI-layer boundary, applied to this
email the same way it applies to PDFs). The email always contains the full ranked
table (every IPO in the universe, not just the top 3, each row linking to its
IPOPlatform review page) plus a top-3 section with the Phase 3 narrative and the
Phase 2 DRHP/RHP analysis PDF's Drive link (resolved from the local path written in
Phase 3's `drhpReportUrl`, per Phase 4 above — never emails a bare local `data/...`
path, which is meaningless to the recipient). If Phase 3's narrative file doesn't
exist (e.g. an early/partial run), the script still sends — with the data table and
no prose, never blocked on the LLM step.

### Phase 6 — Final `data:push` + files-touched manifest

Per `docs/DATA_RULES.md` §5/§7, end every run with:

```bash
yarn data:push
```

This second push (idempotent, see Phase 4) picks up whatever Phase 3/5 wrote since
the first push (the narrative JSON, the sent-email record if any). Then report every
file this run touched — read it from `db.touchedFiles()` (printed by the scanner
script) and the `data:push` `↑ <file>` output, not from memory:

- `ipos.json` — record count from the scanner's `persistStats`.
- `notes.json` — only if Phase 3 wrote a note (companyId resolvable).
- Any `reports.json` + `reports/<id>.json` + `assets/`/`drhp-ipo-analysis/*.pdf`
  entries from each Phase 2 `drhp-ipo-analysis` run (that skill reports its own
  touched files — surface them here too, don't drop them).
- `data/runs/ipo_subscription_<DATE>.json` and `..._narrative_<DATE>.json`.

## Data layer

Per `docs/DATA_RULES.md` §1/§2/§3 — this skill introduces one new collection:

- **`ipos.json`** (new collection, justified in
  `docs/SKILL_DATA_AUDIT.md`'s "State & ledgers" section) — one record per IPO,
  `id = ipo_<ipoPlatformId>`, `type: "ipo-subscription"`, re-upserted daily until the
  IPO drops out of the "closed" universe. Not company-scoped (no `LINK_KIND`/
  `rebuildLinks` entry) since a pre-listing IPO usually has no companyId yet.
- The top-3 `drhp-ipo-analysis` runs use that skill's own `reports.json` +
  `reports/<id>.json` path — this skill does not duplicate that storage.
- `data/runs/` — the scanner DTO and the narrative JSON (regenerable re-runs of the
  same day's scan would reproduce the DTO; the narrative is this run's specific
  authored judgment, kept for audit/debugging, not treated as a source of truth the
  way `notes.json`/`reports.json` are).

## Token-optimization suggestion

The scanner and email-render scripts do 100% of the fetching/parsing/scoring/
formatting — the only tokens this skill ever spends are Phase 2 (`drhp-ipo-analysis`,
already its own skill's cost, only for ≤3 companies/day) and Phase 3's few sentences
of narrative. On a day with 0-1 IPOs in the universe, Phase 2 doesn't run at all and
Phase 3 is a single sentence — there's little further to cut. If the universe
regularly exceeds 3 IPOs/day, consider routing Phase 3's narrative (a short,
low-judgment classification-style task) to a cheaper model (Haiku/Gemini) rather than
the flagship model this skill otherwise runs on — Phase 2's DRHP reads should stay on
the flagship model given how much judgment that skill's red-flag/valuation work
requires.

## File tree

```
ipo-subscription-ranker/
├── SKILL.md                                  (this file)
└── references/
    ├── ipo_ranking_framework.md              (score-weight rationale + citations;
    │                                            keep in lockstep with
    │                                            packages/jobs-runtime/lib/
    │                                            ipoScoring.js's SCORE_WEIGHTS*)
    └── ipo_data_sources.md                   (source-reconciliation: why
                                                 IPOPlatform is the data source
                                                 here — validated against
                                                 Chittorgarh's published
                                                 methodology — vs why NSE is
                                                 used instead for weight-finding
                                                 history and as a fallback;
                                                 read this before changing which
                                                 site any IPO subscription code
                                                 fetches from)
```

**Data source (2026-08-09 decision, see `references/ipo_data_sources.md` for the full
investigation)**: this skill relies **completely on IPOPlatform** (the live "closed IPOs" +
"subscription-status" pages) — validated byte-for-byte against Chittorgarh.com's published
methodology (same underlying data pipeline; both correctly exclude Anchor and Market Maker
allocations from the NII/HNI/Total denominators). NSE's own per-IPO API is a fallback only,
used if IPOPlatform's data is missing/incomplete for a given IPO — never the default path,
since NSE's cookie/rate-limit sensitivity doesn't suit a daily bulk scan the way it's fine
for the occasional single-IPO or historical-backfill fetch. Every email/report this skill
produces MUST carry the source disclaimer already wired into `ipoDigestEmail.js`'s footer —
don't strip it out if you're touching the renderer.

Companion scripts (in `packages/jobs-runtime/`, not under this skill directory — same
convention as every other jobs-runtime-backed skill in this repo):

- `ipoSubscriptionScanner.js` — Phase 1 (scrape, filter, merge, score, persist).
- `ipoDigestEmail.js` — Phase 4 (render, send).
- `lib/ipoScoring.js` — the shared scoring formulas (`computeDualScores` — what the
  scanner actually calls; `computeSubscriptionScore`, `tierFor`, `SCORE_WEIGHTS`
  (legacy single-weight-set), `SCORE_WEIGHTS_LISTING`, `SCORE_WEIGHTS_CAGR`),
  imported by the scanner above and by `ipoBacktest.js`/`ipoWeightFinder.js` (ad-hoc,
  not part of the daily run).
- `ipoBacktest.js` — backtests the formula against actual listing-gain/current-
  performance outcomes over any trailing window — default mode does a full
  QIB/HNI/RII-granular backtest but is only valid back to ~2025-09-24 (IPOPlatform
  data-availability ceiling, not our bug); `--index-only` trades the category
  breakdown for full-history reach using the index API's own Total Subscription
  field.
- `ipoHistoryCache.js` — builds/refreshes `data/cache/ipo-history.json`, the full
  historical IPO dataset (index + granular detail where available), so
  `ipoWeightFinder.js` never has to re-hit the live site. Re-run periodically
  (`--refresh-detail`) as new IPOs list.
- `ipoWeightFinder.js` — runs the data-driven weight-suggestion algorithm against
  the ENTIRE cache in one pass, producing the two weight sets above plus an
  issue-size/market-cap noise-filter evaluation. See
  [`references/ipo_ranking_framework.md`](references/ipo_ranking_framework.md)'s
  "Dual-score system" and "Backtesting the formula" sections for the full
  methodology, findings, and caveats.
