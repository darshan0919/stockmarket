---
name: post-close-scan-insights
description: Full-day corporate-filing signal engine for the "Signals - DND" saved Stockscans announcement scan — runs in several slots across the trading day (mid-session, late session, post-close, evening, night sweep), each covering its own non-overlapping window off a shared resumable cursor so nothing is re-read and no email repeats itself. Fetches the scan's announcements, tags (never drops) title-only noise hints, reads every non-heavy-document PDF — strength/materiality is decided from that read, never from the title alone — writes a quantified thesis note per filing with an explicit J-curve / PAT-vs-EPS read, runs the strongest items through announcement-info-classifier for a NEW/KNOWN/FOLLOW-UP verdict, scores everything on a deterministic 5-level signal scale (S1-S5, 0-100), and emails a Thesis Card digest per slot plus a market-validated day recap. Closes the loop the next trading day by validating each thesis against actual delivery-backed price action and feeding what it learns back into the prompt. Invoke with --slot for a scheduled run, or with --window-hours for an explicit catch-up over a specific past window.
---

# Post-Close Scan Insights

An **orchestrator**, same shape as `watchlist-insights`, over a different universe and a different rhythm:

1. **Hunts signals all day, not once at night:** 48% of Indian filings arrive in the 3.5 hours after the 15:30 close, and 21% during the trading session itself. A single nightly run misses timely alpha. This engine runs across non-overlapping slot windows throughout the day.
2. **Learns via D+1 market validation:** Every thesis written is falsifiable and validated the next trading session against actual delivery-backed price action (`insight-validation`), populating a hit/miss ledger to tune scoring weights.

### Specialist Skill Boundaries (Principle 17)

This skill orchestrates routing, composition, delivery, and validation:

- PDF extraction and note templates belong to [`announcement-insights`](../announcement-insights/SKILL.md).
- Claim novelty (NEW/KNOWN/FOLLOW-UP) belongs to [`announcement-info-classifier`](../announcement-info-classifier/SKILL.md).
- Multi-quarter cost-base inspection belongs to [`rerating-catalysts`](../rerating-catalysts/SKILL.md).
- Investing frameworks belong to [`ask-soic`](../../tooling/ask-soic/SKILL.md).
- Full earnings depth belongs to `quarterly-result-analysis` and `concall-analysis`.

Script-first: `packages/jobs-runtime/postCloseScanInsights.js` owns deterministic logic (scan pagination, noise filtering, duplicate grouping, signal scoring, digest rendering, and market data enrichment). Shells out to `packages/jobs-runtime/watchlistInsights.js` for shared notes DB commands.

---

## Scan Universe & Parameters

**Source of truth:** The saved Stockscans announcement-scan named `Signals - DND`, resolved live at runtime via `GET /api/user/announcement-scans`. If `scanSource` is not `live` (i.e. `cache` or `fallback`), report it prominently in the run summary.

| Param              | Default        | Meaning                                                                        |
| ------------------ | -------------- | ------------------------------------------------------------------------------ |
| `--slot <name>`    | `adhoc`        | Scheduled slot: `mid-session`, `late-session`, `post-close`, `night`, `adhoc`. |
| `--window-hours n` | cursor-derived | Explicit catch-up override. Bypasses both the floor and cursor.                |
| `email`            | on             | Run `send-digest` at end (off = just persist notes to DB).                     |

### Slot Schedule (Shared Cursor)

All slots share **ONE** resumable cursor (`cache/post-close-scan-insights-cursor.json` via `lib/windowCursor.js`). `--slot` is a display label only. Consecutive runs tile the day without gaps or overlaps. See `references/slot-schedule.md` for historical timing heatmaps.

| Slot           | IST   | Coverage                                    | Day Share |
| -------------- | ----- | ------------------------------------------- | --------: |
| `mid-session`  | 13:00 | Overnight + morning session                 |      ~12% |
| `late-session` | 15:45 | Midday + pre-close ramp                     |      ~11% |
| `post-close`   | 19:15 | **The 15:30–19:00 peak (load-bearing run)** |      ~48% |
| `night`        | 21:45 | Evening + 21:30 filing spike                |      ~19% |
| `day-recap`    | 23:45 | Full day re-ranked by settled market data   |         — |
| `validation`   | 20:00 | D+1 price action vs prior day's theses      |         — |

---

## Setup

```bash
JOB=$(find /sessions -path '*packages/jobs-runtime/postCloseScanInsights.js' -not -path '*/node_modules/*' 2>/dev/null | head -1)
WI_JOB=$(find /sessions -path '*packages/jobs-runtime/watchlistInsights.js' -not -path '*/node_modules/*' 2>/dev/null | head -1)
run(){ node "$JOB" "$@"; }
runwi(){ node "$WI_JOB" "$@"; }
```

Both scripts automatically resolve environment secrets via `loadEnv()`.

---

## Execution Workflow

```
┌────────────────────────────────────────────────────────┐
│ Step 1: Resolve Universe & Fetch Window (fetch-scan)   │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ Step 2: Drop Curated Noise & Group Companions          │
│ • filter-noise: drops curated noise keywords           │
│ • categorise: tags same-day companions (groupDuplicates)│
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ Step 3: Route Items & Concurrent PDF Prefetching       │
│ • prefetch-pdfs: warms Tier-1 cache concurrently       │
│ • Heavy docs: check docExtracts (Filing Extract)       │
│ • Routing overrides: SAST dealsDigest check, OCR check │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ Step 4: Write Thesis Note (J-Curve, PAT Bridge & SOIC) │
│ • 4a J-Curve inflection (operating leverage)           │
│ • 4b Deterministic accretion: yarn pat-bridge          │
│ • 4c Knowledge base check: ask-soic                    │
│ • 4d Multi-filing causal synthesis                     │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ Step 5: Info-Classification (NEW / KNOWN / FOLLOW-UP)  │
│ • Top 15 items clearing S3 (score >= 35)               │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ Step 6 & 6b: Signal Scoring (S1-S5) & Order Enrichment │
│ • S1-S5 deterministic 0-100 score                      │
│ • enrich-orders: book-to-bill & unexecuted backlog     │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ Step 7 & 8: Send Slot Digest, Commit Cursor & Push     │
│ • send-digest (syncs Watchlist TTL & Mcap/PE metrics)  │
│ • commit-window (conditional) -> yarn data:push        │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ Step 9 & 10: Night Recap & D+1 Market Validation       │
│ • 23:45 IST: resend-with-market-data (settled volume)  │
│ • Next day: insight-validation (direction/structure)   │
└────────────────────────────────────────────────────────┘
```

---

## Step 1 — Resolve Universe & Fetch Window

```bash
run resolve-scan                                # Inspect resolved scan filters
run fetch-scan --slot post-close                # Normal scheduled run
run fetch-scan --slot adhoc --window-hours 34   # Explicit catch-up
```

Paginates the scan until crossing the cutoff. Returns `{cutoffUtc, windowStartIstHuman, scanSource, totalFetched, inWindow}`. Save `inWindow` for Step 2. Pass `windowStartIstHuman` directly to `send-digest --cutoff-human`.

---

## Step 2 — Tag Noise, then Categorise

```bash
run filter-noise <fetch-scan-output.json>     # -> {kept, dropped: []}
run categorise <filter-noise-output.json>     # -> [{companyId, category, isDuplicateLead, duplicateOf, ...}]
```

1. **Curated Pre-Filter Drops Immediately:** `filter-noise` drops announcements matching `announcement-noise-keywords.json` (AGM notices, postal ballots, analyst meet intimations, routine dividend/ESOP mechanics). These are excluded before PDF reading.
2. **Same-Day Companion Grouping:** `categorise` groups same-day companion filings (`same companyId + calendar date + title similarity`). Earliest item gets `isDuplicateLead: true`; followers get `isDuplicateLead: false` and cite `duplicateOf: <lead_ssUrl>`, bypassing PDF reads.
3. **Significance & Taxonomy Overrides:** Items carry `significance` (VERY_HIGH / HIGH / NORMAL). Everything on the EPS-accretion/J-curve path is `VERY_HIGH`. Route ambiguous items to [`announcement-taxonomy`](../announcement-taxonomy/SKILL.md).
4. See `references/changelog-and-incidents.md` §1–§2 for historical background.

---

## Step 3 — Route Each Item

Warm the Tier-1 `cache/pdf-text/` cache concurrently before the sequential item loop:

```bash
runwi prefetch-pdfs <pdf-urls.json> --concurrency 8
```

For each item from Step 2:

- **`isDuplicateLead: false`:** Route to lead's insight without an independent PDF read:
  ```bash
  runwi mark-processed "<companyId>" "<announcementId>" "duplicate-of-existing-note"
  ```
- **`alreadyProcessed: true`:** Skip immediately (already recorded in notes DB).
- **`heavyDocument: true`:** Check `packages/jobs-runtime/lib/docExtracts`:
  - _Extract exists:_ Write a signal-grade note with page-anchored quotes (`heavy_doc_signal`) and set `followUp: "<specialist-skill>"`.
  - _No extract:_ Skip and log:
    ```bash
    runwi log-heavy-skip '<json: {companyId, name, title, category, announcementId, date}>'
    runwi mark-processed "<companyId>" "<announcementId>" "heavy-doc-skip"
    ```
- **Routine Items:** If genuine routine non-event after read:
  ```bash
  runwi mark-processed "<companyId>" "<announcementId>"
  ```
  Append `{companyId, name, title, category, date, announcementId, reason}` to `routine-items.json`.

### Standing Judgment Overrides (`references/routing-rules.md`)

- **`shareholding_change` (SAST):** Cross-check `data/runs/digest_<YYYYMMDD>.json` for priced value. Unpriced intra-promoter transfers into family trusts still require governance review.
- **`ocrFailed: true` is a HARD STOP:** Never mark scanned/empty PDFs routine. Flag for follow-up.
- **State Changes:** New JV, capacity location, or regulatory approval is material even if rupee amount is small.

---

## Step 4 — Write the Thesis (J-Curve, PAT Bridge & Knowledge Base)

For every non-routine announcement, synthesize a quantified thesis note following `references/thesis-rules.md`:

1. **4a — Hunt the J-Curve Inflection (Operating Leverage):** Identify when earnings path bends (capex commissioning, debt retirement crossing a threshold, mix shift, fixed-cost breakeven). Call `rerating-catalysts --mode brief` to verify if sunk costs are already in the base. Record `jCurve: {isCandidate, shape, elbowEvidence, whatWouldConfirm}`.
2. **4b — Deterministic PAT-to-EPS Accretion Bridge (`yarn pat-bridge`):** Never perform floating-point dilution arithmetic in prompt text. Extract factual inputs and run the deterministic analyzer:
   ```bash
   yarn pat-bridge '{"raiseAmount":800,"debtRepaid":600,"interestRate":0.11,"taxRate":0.25,"currentPat":300,"currentShares":20,"issuePrice":310}'
   ```
   Attach the resulting `res.bridge` directly as `patBridge` on the note payload.
3. **4c — Domain Grounding & Knowledge Gaps (`ask-soic`):** Query `ask-soic` for deal structures and regulatory mechanisms. Log uncovered topics to `--knowledge-gaps <gaps.json>`.
4. **4d — Multi-Filing Synthesis:** If multiple filings club for one company, synthesize a combined causal headline and thesis chain.

Persist note:

```bash
runwi add-note '<json: {companyId, note: {headline, insight, category, significance, thesisChain, epsImpact, jCurve, patBridge, sourceSkill: "post-close-scan-insights", usecase: "announcement-insights:<depth>"}}>'
runwi mark-processed "<companyId>" "<announcementId>"
```

---

## Step 5 — Info-Classify Strongest Items (Top 15)

Select non-routine items clearing the S3 boundary (`signalScore >= 35`), descending by score (capped at 15):

1. Reuse Step 4's extraction (`headline`, `thesisChain`, `epsImpact`).
2. Cross-reference `buildBaselines.js` card (`claimIndex`) or last 4 concalls + PPT + announcement history.
3. Classify each claim: `NEW` / `KNOWN` / `FOLLOW-UP`.
4. Attach `infoClassification: {claims[], verdict, baselineCoverage}` directly to the item's insight object.

---

## Step 6 & 6b — Signal Scoring & Order Enrichment

- **5-Level Deterministic Scoring (S1–S5, 0–100):** Computed by `computeSignalScore` in `lib/thesisCardEmail.js` based on `significance`, `epsImpact.confidence`, category conviction, and attached `extractEvidence` (`amountPctOfMcap`, `claimNovelty`).
- **Order Book Cards (Step 6b):** Run dry enrichment:
  ```bash
  run enrich-orders <insights-array.json>
  ```
  Resolves company-wide order backlog, book-to-bill ratio, and execution horizons per `docs/ORDER_METRICS.md`.

---

## Step 7 — Send the Slot Digest

```bash
run send-digest <insights-array.json> \
  --slot post-close \
  --cutoff-human "<windowStartIstHuman from Step 1>" \
  --stats-file <stats.json> \
  --routine-items <routine-items.json> \
  --knowledge-gaps <gaps.json>
```

- **Routine List:** Renders an un-scored "Also reviewed — no material signal" section.
- **Notes DB Merge:** Merges cached notes since the cutoff across all companies.
- **Watchlist Sync & Metrics:** Automatically adds S1/S2 companies (>60/100) to the "Announcement Signals" watchlist for 7 days TTL, and enriches cards with batch-fetched **Mcap** and **P/E**.
- **Funnel Reconciliation (`--stats-file`):** Verify `total ≈ noiseDropped + alreadyProcessed + duplicateCollapsed + heavyDocSkipped + routine + insights`.

---

## Step 8 — Commit Cursor & Data Push

```bash
run commit-window       # ONLY if Steps 1-7 completed cleanly
yarn data:push          # MANDATORY even on partial failure
```

`commit-window` advances `cache/post-close-scan-insights-cursor.json`. `yarn data:push` idempotently syncs `data/` to Google Drive.

---

## Step 9 — Day Recap with Settled Market Data

Runs once at ~23:45 IST:

```bash
run resend-with-market-data [--date YYYY-MM-DD]
```

Reloads the day's persisted notes and re-ranks cards with settled post-market data: **1D return · Mcap · Delivery % · Delivery Value ₹Cr · Deliv/Mcap % · Vol/7D-Avg**.

---

## Step 10 — D+1 Market Validation & Feedback Loop

Runs inside `insight-validation` at next trading day 20:00 IST:

```bash
node "$IV" validate-post-close <date>
```

Validates each thesis on 3 axes:

1. **Direction:** Did price move in the predicted `epsImpact.direction`?
2. **Structure:** Was the move delivery-backed (`STRONG`/`MODERATE`) or thin `NOISE`?
3. **Calibration:** Size of reaction matching tier (S1 ≥4%, S2 ≥2.5%, S3 ≥1.5%, S4 ≥0.75%).

Persists to `postclose-followup`. Once a pattern has ≥8 samples, review `postCloseProposals` (`direction_miscall`, `candidate_noise_keyword`, `tier_over_scored`/`under_scored`) to tune scoring parameters.

---

## Rules & Quality Checklist

- [x] **Files-Touched Manifest:** End run listing all touched DB stores, cache files, and `data:push` records.
- [x] **No Title-Only Insights:** Every surviving non-heavy document gets its PDF opened and read.
- [x] **Attribution:** All notes set `sourceSkill: "post-close-scan-insights"` and `usecase: "announcement-insights:<depth>"`.
- [x] **Funnel Reconciliation:** Ensure all stats sum to `total`.
- [x] **Token-Optimization Suggestion:** Conclude with concrete, evidence-based recommendations for candidate noise keywords or cache hits.
