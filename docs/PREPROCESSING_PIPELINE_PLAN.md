# Daily Pre-Processing Pipeline — widening the net on the three daily scans

Design + implementation plan for a document pre-processing layer feeding
`post-close-scan-insights`, `gainers-signal`, and `volume-rocketing`.

Status: **P0-P3 IMPLEMENTED 2026-09-04** — see §10 for what shipped, what it
measured, and the two things that are deliberately NOT done. Written 2026-09-04, revised same day after
Darshan's review (see §0.5 — the revision materially changed the design).

Related: [`MODEL_COST_ORCHESTRATION.md`](MODEL_COST_ORCHESTRATION.md) (2026-07-17)
is the routing design this executes — **with one correction, see §0.5.**
Author aid, not investment advice.

---

## 0. What I found, and what Darshan corrected

### 0.1 The three skills, and where the model time goes

| Skill                      | Runs/day                     | Deterministic (script)                                                                   | Model work per run                                                                                                        |
| -------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `post-close-scan-insights` | 5 slots + recap + validation | scan resolve, pagination, noise filter, taxonomy, signal score, email, market enrichment | **one PDF read + one written insight per non-routine announcement**; ≤5 info-classifications; heavy docs skipped entirely |
| `gainers-signal`           | 1 (08:00)                    | scanner, classifier, delivery, tiering, streaks, clusters, email render                  | **top-20 trigger research** (~30-PDF cap); **10 EPS briefs**; WHY ladder; info-classifier on ACT tier                     |
| `volume-rocketing`         | 1 (08:00, after gainers)     | same scripts, different universe fetcher                                                 | identical, on ~12–20 deduped names                                                                                        |

Measured: **20–56 announcement notes/day** (`data/notes.json`, 2094 total; 97 on
2026-08-12), **0–9 PDFs per research seed**, **1–7 heavy-doc skips/day**
(`data/cache/heavy-doc-skips_*.json`) in the current quiet period.

**The caps are the constraint, and they exist because per-item cost is high:**

- heavy documents (`results`, `concall_transcript`, `investor_presentation`,
  `annual_report`) are **skipped wholesale** — `log-heavy-skip`, never read.
  These are precisely the documents that carry the thesis.
- info-classification is capped at **5/day** because its baseline build touches
  _4 concalls + 1 PPT + up to ~400 announcements_ **per item**.
- trigger research capped at **20 companies**, EPS briefs at **10**.

### 0.2 Three assets already in the repo, unused or under-used

1. **`packages/jobs-runtime/lib/stockscansContext.js` had zero callers** (wired up
   in P0, §10). Wraps
   Stockscans' own AI-synthesized `growthCatalysts` / `businessOverview` /
   `concallNotes` with a 7-day disk cache under
   `data/cache/stockscans-context/`. Stockscans already paid the synthesis cost;
   we get pre-digested research for an HTTP GET. **Nothing calls it.**
   (`StockscansClient.js` L450/L465/L482.)
2. **Antigravity already runs this repo's skills and jobs.**
   `skills/tooling/antigravity-scheduled-tasks-sync` + `yarn antigravity:sync`
   push `jobs/Scheduled/` and all 77+ skills into `~/.gemini/config/sidecars/`
   and `~/.gemini/config/skills/`. **A pre-processing skill + job needs no new
   runner** — it inherits this one, executed by whichever agent is cheapest.
3. **`docs/MODEL_COST_ORCHESTRATION.md`** already routed extraction away from
   flagship reasoning. Its §4 mechanism (`lib/gemini.js`, a stored-key API
   client) is **superseded — see §0.5.**

### 0.3 The structural observation

All three skills do **document → understanding** work at signal time, on a
deadline, for a universe known only that morning. But document understanding is:

- **company-scoped and slow-changing** — a filed concall never changes;
- **identical across all three skills** — all three want "what did this company
  already tell the market";
- **not judgment** — "management guided 18-20% revenue growth for FY27, page 14"
  is transcription.

The scans only decide _which_ companies matter today. **Pre-processing moves
every document-shaped cost off the daily critical path onto a document-arrival
trigger.**

### 0.4 The scale target (Darshan, 2026-09-04)

Not 5 → 15. **The target is on the order of 1000 companies.** That is not a
bigger version of the same design — it changes what the design has to be. See
§1.3 and §5.

### 0.5 Correction to my first draft — no API keys, ever

My first draft proposed `packages/jobs-runtime/lib/gemini.js`, a stored-key
Gemini API client, and an amendment to `guidance-document-extractor`'s Step 2 to
permit it. **Darshan rejected both, and he is right.** The corrected principle:

> Pre-processing is a **skill run by a job**, exactly like every other workflow
> in this repo. The only difference from `post-close-scan-insights` is that it is
> written so it needs no heavy reasoning model — so it can be scheduled onto a
> cheap agent (Gemini via Antigravity, a Haiku-tier Cowork task, whatever is
> cheapest at the time). **The pipeline never calls an LLM provider API with a
> stored key.** "Cheap model" describes the _job_, not a specific vendor.

Consequences, and they are all improvements:

- **`guidance-document-extractor` Step 2 and `conventions.md` need NO amendment.**
  The existing rule was correct; my draft was wrong. The stance is now proven
  general rather than a one-skill quirk.
- **No `lib/gemini.js`. `GEMINI_API_KEY` is not used by anything built here.**
  (`screener-api`'s existing `geminiClient.js` is untouched and out of scope.)
- **Vendor-portable.** If Gemini's quota, pricing or quality changes, the
  pre-processing job is re-pointed at a different cheap agent by changing which
  runner executes the sidecar. Nothing in the repo changes.
- **`MODEL_COST_ORCHESTRATION.md` §4 is superseded on mechanism** (its routing
  _logic_ stands). That doc needs a one-paragraph note pointing here, or a future
  session will build the API client it describes.

**Open item for Darshan (§8):** the profiles below are written to need no deep
reasoning. If calibration (§2 L3) shows a profile genuinely does — most likely
`annual_report`, possibly `transcript` guidance extraction — I will say so
rather than quietly downgrade quality, per his instruction.

---

## 1. Architecture

```
        (document arrives — announcement, result, transcript, ppt, AR)
                              │
             ┌────────────────▼─────────────────┐
             │  QUEUE  data/runs/preprocess/    │  script: what needs extracting
             └────────────────┬─────────────────┘
                              │  drained in batches by a cheap agent
             ┌────────────────▼─────────────────┐
             │  A. FILING EXTRACT (per doc)     │  verbatim, schema-bound, page-anchored
             │  data/cache/doc-extracts/        │  immutable — a filed doc never changes
             └────────────────┬─────────────────┘
                              │  rolled up on new-doc arrival (script + cheap agent)
             ┌────────────────▼─────────────────┐
             │  B. BASELINE CARD (per company)  │  "what the market already knows"
             │  data/company-baselines/         │  versioned, rebuilt only on change
             └────────────────┬─────────────────┘
                              │
             ┌────────────────▼─────────────────┐
             │  C. SELECTION (script, no model) │  ← the 1000-scale piece, see §1.3
             └────────────────┬─────────────────┘
                              │  top N by deterministic score
     ┌────────────────────────┼────────────────────────┐
     ▼                        ▼                        ▼
post-close-scan        gainers-signal          volume-rocketing
       (flagship model: judgment only, never reads a source PDF it needn't)
```

The filesystem/DB is the bus — the same handoff the existing
scanner → classifier → composer contract already uses. No new infrastructure.

### Product A — Filing Extract (immutable, per document)

One JSON per source document, keyed by `ssUrl` (or PDF-URL hash), written once,
never recomputed. Path `data/cache/doc-extracts/<profile>/<hash>.json`.

| Profile         | Source                | Extracts                                                                                                                                               |
| --------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `announcement`  | any announcement PDF  | the fields the `announcement-insights` category templates ask for: amounts, counterparty, dates, share counts, thresholds + ≤5 verbatim quotes w/ page |
| `result`        | Financial Results     | full P&L incl. changes-in-inventories, other-income break-up, tax reconciliation; segment table; QoQ/YoY; one-offs                                     |
| `transcript`    | concall Transcript    | guidance items (metric / value / timeframe / verbatim quote / page), segment numbers, capex, order book, dodged questions                              |
| `ppt`           | Investor Presentation | capacity & capex pipeline with dates, order book, stated targets, KPI table                                                                            |
| `annual_report` | Annual Report         | RPT table, contingent liabilities, auditor notes, remuneration, capex commercialisation, misc-expense lines                                            |

**Five rules, identical across profiles** — these are what make the job
cheap-agent-safe:

1. Output is JSON matching the schema. No prose, no markdown.
2. Extract **only what is literally written**. No inference, no outside
   knowledge, no valuation math.
3. `null` for anything absent, and name the field in `missing[]`.
4. **Every fact carries a verbatim quote + page number.** Non-negotiable — §2 L1
   depends on it entirely.
5. Unreadable/scanned → `{"error":"unreadable"}` and nothing else. Never a
   partial guess. Routes to the existing `ocrFailed` hard-stop path.

**No selection adjectives in any profile prompt.** "Extract the guidance items"
is transcription; "extract the _material_ guidance items" is judgment wearing a
schema. Recall-first; the flagship model discards.

### Product B — Company Baseline Card (versioned, per company)

The piece that uncaps `announcement-info-classifier`. Today its Step 3 rebuilds,
**per announcement**, 4 concalls + latest PPT + ~400 announcements + notes/thesis.
The card is that baseline built once per company, refreshed only when a new heavy
document lands:

```jsonc
{
  "companyId": "NSE:XYZ", "version": 7, "builtAt": "2026-09-04T01:38:00+05:30",
  "sourceDocs": [{ "type": "transcript", "date": "202606", "ssUrl": "…", "extractHash": "…" }],

  "guidanceLedger": [   // powers the WHY ladder rung 4 + management-credibility
    { "metric": "revenue growth", "guided": "18-20%", "timeframe": "FY27",
      "saidOn": "2026-05-14", "source": "Q4FY26 concall p.12", "quote": "…", "status": "open" }],
  "commitments": [ { "what": "Unit-3 commissioning", "when": "H2FY27", "source": "Q1FY27 PPT slide 9" } ],
  "claimIndex": [       // ← the KNOWN/NEW lookup table
    { "fingerprint": "acquisition|Ravi Metals|majority stake",
      "firstSeen": "2026-04-02", "sources": ["ann:abc123"] }],
  "kpiHistory": { "orderBookCr": [...], "capacity": [...], "ebitdaMarginPct": [...] },
  "businessOverview": "…",   // Stockscans, verbatim, free
  "growthCatalysts": "…",    // Stockscans, verbatim, free
  "baselineCoverage": { "concalls": 4, "ppt": true, "annHistoryDays": 730, "thin": false }
}
```

`claimIndex` is load-bearing: "is this already known?" becomes a **dated lookup
against a pre-built index** instead of six document fetches. Fingerprints are
built **by script** from the extracts' structured fields (category + counterparty

- amount bucket) — deterministic, not a model call. Step 3e's same-day exclusion
  is trivially enforced because every entry carries `firstSeen`.

### 1.3 The 1000-scale piece: selection is a script, not a model

At Darshan's target the binding constraint moves. Extraction scales — it is
batched, cheap, idempotent and off the critical path. **Flagship attention does
not.** A flagship model cannot write 1000 notes a night, and an email carrying
1000 cards is not a signal, it is a second market to analyse.

So the architecture is explicitly:

> **Extract wide (1000+). Rank deterministically. Reason narrow (~50), but chosen
> from 1000 instead of from 40.**

The ranking layer is a **script with no model in it** — which is the correct
place for it under conventions §17, and the only thing that scales. It already
half-exists: `computeSignalScore`/`signalTierFor` in `lib/thesisCardEmail.js`
and `gainersClassifier`'s conviction scoring. What structured extracts add is
_better inputs to the same deterministic scorer_: today the score is computed
from category + a model's significance label; with extracts it can be computed
from the actual rupee figure, the actual guidance delta, the actual order-book
change, and whether `claimIndex` says the claim is new.

**This is the real quality win, and it is bigger than the token win.** Today's
top-20 is the top 20 of ~50 names a scan surfaced. Tomorrow's top-50 is the top
50 of 1000 names, ranked on extracted facts rather than on which scan happened to
fire. Coverage stops being "what we had budget to look at" and becomes "what
actually scored highest", which is also what makes the digest's _absences_
meaningful for the first time.

---

## 2. Verification — how this stays trustworthy at 1000×

Four layers. Note that L1 and L2 are scripts, so their cost does not grow with
the model bill — **verification gets cheaper per document as scale rises**, which
is what makes 1000 safe when 40 was not.

**L1 — Deterministic quote anchoring (script; catches fabrication outright).**
Every extracted fact carries a verbatim quote, and the source PDF text is already
cached (`data/cache/pdf-text/`, Tier-1, keyed on URL). So a script asserts **every
quote is a substring of the source text** (normalised whitespace). A quote that
isn't in the document is a fabrication, caught by `String.includes`, not by a
model. Failures quarantine to `doc-extracts/_rejected/` and that document falls
back to today's flagship path. **This is the single most important control here**
— it is what makes a cheap agent's output admissible.

**L2 — Deterministic bound checks (script).** Percentages 0–100; dates parse and
aren't in the future; `revenue − expenses ≈ pbt` within tolerance; segment
revenues sum ≤ total; `amount_inr_cr` order-of-magnitude sane vs market cap.
Failures set `confidence: low`, which the consuming skill must treat as a lead,
never a fact.

**L3 — Calibration gate (one-time per profile, before it ships).**
`yarn preprocess:calibrate --profile result --n 15` runs 15 real documents
through the cheap agent and diffs against a flagship read of the same documents.
**A profile does not go live until numeric fields agree ≥98% and no field
mis-signs a direction.** Re-run quarterly and after any prompt-version bump.
Expected first failure: table extraction from _scanned_ PDFs (§7).

**L4 — Standing instruction to consuming skills.** A skill may quote an extract's
numbers, but anything that becomes a **stored thesis, a signal, or an applied
proposal must cite the extract's `quote` + `page`**; and where `confidence` is
`low`, or `missing[]` covers the field in question, the skill says so rather than
papering over it. `epsImpact.confidence` may never be `high` off a
`confidence: low` extract.

**Kill switch / graceful degrade.** Per-profile enable flags. Every consuming
skill treats a cache miss or disabled profile as **"do it the way you do today."**
The pre-processor is a fast path, never a hard dependency: if it silently stopped,
the three skills would get slower and narrower — never wrong.

**Provenance envelope** on every artifact: `runnerModel`, `promptVersion`,
`sourceUrl`, `extractedAt`, `confidence`, `verification: {L1, L2}`. Timestamps
come from `db.js`'s `ensureEnvelope` — do **not** invent a second write-timestamp
field (conventions §22).

---

## 3. What changes in the three skills

Only these. Everything else in the three SKILL.md files stays as-is.

### `post-close-scan-insights`

| Step            | Today                                  | After                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3 heavy docs    | `log-heavy-skip` — never read          | **Signal-grade read from the extract** (beat/miss, guidance moved, capex added, order book changed) + tag the company for the specialist skill. **Not** a full thesis note — `quarterly-result-analysis` / `concall-analysis` / `annual-report-analysis` own depth, and two skills publishing different reads of one Result PDF is exactly what conventions §17 forbids. _(Darshan's call, 2026-09-04.)_ |
| 3 normal items  | `read-pdf-with-meta` → judge           | Read the `announcement` extract; PDF text only on miss or `confidence: low`                                                                                                                                                                                                                                                                                                                              |
| 5 info-classify | capped at 5, baseline rebuilt per item | Baseline = the card → **uncap**, driven by the §1.3 deterministic rank rather than a fixed number                                                                                                                                                                                                                                                                                                        |
| 6 signal score  | category + significance label          | Same scorer, **better inputs** — extracted rupee figures, guidance deltas, `claimIndex` novelty                                                                                                                                                                                                                                                                                                          |
| 7–10            | unchanged                              | unchanged                                                                                                                                                                                                                                                                                                                                                                                                |

### `gainers-signal` / `volume-rocketing` (via `_shared/scan-signal-pipeline.md`)

| Step                  | Today                     | After                                                                                                                          |
| --------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 4 trigger research    | 20 companies, ~30-PDF cap | Extracts pre-exist → raise materially; cap becomes a safety valve, not the design                                              |
| 5 rung 2 `classified` | ACT tier only             | Card makes it cheap → all names with an unexplained delivery-backed move                                                       |
| 5 rung 3 `catalyst`   | needs the Step-6 brief    | Also reads the card's `growthCatalysts` (Stockscans, free) → answers beyond the top 10                                         |
| 5 rung 4 `concall`    | transcript read           | Card's `guidanceLedger` answers with a dated, quoted number, no document read                                                  |
| 6 EPS briefs          | 10/skill/day              | `rerating-catalysts --mode brief` reads extracts instead of re-reading filings → raise; keep `brief_cache`, its shape is right |

`why_coverage_pct` should rise as a side effect, and its _basis mix_ should shift
from `sector`/`none` toward `filing`/`classified` — the headline quality metric
for this whole project (§6).

### One deliberate non-change

The `usecase` / `sourceSkill` note-cache contract (conventions §21) is untouched.
Extracts are a separate layer keyed on the **document**, not the note.

---

## 4. Implementation

### P0 — Free wins, zero model — SHIPPED 2026-09-04, see §10

| #   | Change                                                                                                                   | Why                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1 | Wire `stockscansContext.fetchStockscansContext()` into `buildCompanyContext()` (opt-in field) and into WHY-ladder rung 3 | Zero-token pre-digested research that exists and nothing calls                                                                                                      |
| 0.2 | Backfill `data/cache/stockscans-context/` across the standing universe — one GET per company per 7 days                  | Warms the cache before anything else exists                                                                                                                         |
| 0.3 | Add a note to `MODEL_COST_ORCHESTRATION.md` §4: mechanism superseded, see this doc                                       | Otherwise a future session builds the stored-key API client it describes                                                                                            |
| 0.4 | Verify `rerating_targets` actually lands in the research seeds                                                           | `gainersClassifier.js` L1001 writes it, but `data/runs/gainers_research_seed_2026090{1,2,3}.json` have no such key — **Step 6 may be running on empty input today** |

0.4 is a bug-shaped finding, not part of this design — but Step 6 is a cap we're
about to raise, so confirm it runs at all first.

### P1 — The pre-processing skill + job (~1–1.5 days)

**`skills/equity-research/document-preprocessor/SKILL.md`** — a new skill, written
to the §1 Product-A rules. Structure mirrors `guidance-document-extractor`, which
is the closest existing precedent (bulk fetch by script, extraction by whichever
agent runs the skill, persistence by script). Ships one profile at a time, each
behind its L3 calibration gate: `announcement` → `result` → `transcript` → `ppt`
→ `annual_report`.

**`jobs/Scheduled/document-preprocessing/SKILL.md`** — the job wrapper, same shape
as `daily-gainers-signal-stockmarket`. Synced to Antigravity via
`yarn antigravity:sync`, so it runs on a cheap agent with no key anywhere.

Supporting scripts (all pure logic, all with `yarn` commands per AGENTS.md §5):

- **`packages/jobs-runtime/preprocessQueue.js`** — builds the work queue: resolve
  the standing universe, list documents filed since the cursor
  (`lib/windowCursor.js` per conventions §19 — do not hand-roll a cursor), emit
  batches of a configurable size with a claim/lease so parallel runs don't
  collide. Never stores raw PDFs (conventions §6).
- **`packages/jobs-runtime/lib/docExtracts.js`** — the store: `get/put/has/listPending`.
  Model it on `concallNotesStore.js`, which is the reference implementation.
- **`packages/jobs-runtime/verifyExtracts.js`** — L1 + L2, quarantine on failure.
- **`packages/jobs-runtime/preprocessCalibrate.js`** — the L3 harness.

### P2 — Baseline cards (~1 day)

**`packages/jobs-runtime/buildBaselines.js`** — rolls extracts into Product B;
rebuilds a company only when its newest source doc post-dates `card.builtAt`.
`claimIndex` fingerprinting is script-side. Then update
`announcement-info-classifier` Step 3 to read the card first, falling back to
today's six-source build on a miss.

### P3 — Selection layer + consumption edits (~1 day)

Extend the deterministic scorer (§1.3) to read extract fields, then make the §3
SKILL.md edits through `skill-manager`. Every edit keeps the graceful-degrade
path intact.

---

## 5. Scheduling at scale

### The universe problem, and why it dissolves

You cannot pre-process "today's gainers" — that list doesn't exist until the scan
runs. **Don't try.** Pre-process by **document arrival across a standing
universe**, and accept speculative work:

> **Standing universe** = `Signals - DND` scan universe ∪ Near Highs ∪ Radar ∪
> anything seen in any scan or note in 30 days. Today a few hundred names;
> designed to go to 1000+ without a shape change.

Extraction is cheap enough to be speculative; judgment is not. A document
extracted and never used costs one cheap-agent batch slot. A document _not_
extracted costs a flagship slot — or, today, a `log-heavy-skip`.

### Batch, don't iterate

At 1000 scale the failure mode is one agent turn per document. The queue emits
**fixed-size batches (start at 20 documents/turn) with a per-run document budget**,
so a run has bounded cost and a predictable finish. Runs are idempotent (keyed on
document identity) and resumable (cursor committed only on a clean run), so more
throughput = more scheduled runs, not longer ones. Nothing needs redesigning to
go from 200 to 1000; the queue just drains slower or the cadence rises.

### Timetable (IST)

| Time                              | Job                                    | Feeds                                           |
| --------------------------------- | -------------------------------------- | ----------------------------------------------- |
| every 30 min, 09:00–23:30         | `document-preprocessing` (queue drain) | all slots, as filings land                      |
| 12:30 / 15:20 / **18:40** / 21:15 | guaranteed pre-slot passes             | 13:00, 15:45, **19:15**, 21:45 post-close slots |
| 01:30                             | `preprocess:baselines`                 | next morning's classification + WHY ladder      |
| 07:15                             | overnight backlog drain                | 08:00 gainers → volume-rocketing                |
| Sun 03:00                         | `preprocess:backfill`                  | gap-fill + 7-day Stockscans context refresh     |

**18:40 is the load-bearing pass** — 48% of a day's filings land in the window the
19:15 `post-close` slot covers. A missed sweep there costs a night's coverage;
every other row is redundancy.

Results season (late Jan / Apr / Jul / Oct) will need the 30-minute cadence at 15,
and a larger per-run budget.

---

## 6. Measuring whether this worked

Capture the "today" column **before writing any code** — otherwise "this made
things better" is unfalsifiable, which is the exact criticism
`post-close-scan-insights` Step 10 makes of a thesis engine with no validation
loop.

| Metric                                      | Today (measured 2026-09-04)                                                                                                     | Target                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| companies with a document-backed read / day | 20 (gainers) + 12–20 (VR)                                                                                                       | 3–5×, then toward the universe                            |
| info-classifications / day                  | ≤5 (hard cap)                                                                                                                   | rank-driven, uncapped                                     |
| **heavy docs read vs skipped**              | **0 read / 438 skipped over 21 days** (mean 20.9/day; peak 47 on 2026-08-12). Split: results 205, PPT 125, transcript 86, AR 20 | ≥80% signal-grade read                                    |
| announcement notes written / day            | 12–56 (last 10 sessions)                                                                                                        | unchanged — attention is the scarce input, not note count |
| `linkage` mix on trigger research           | **65% `unexplained`** (318 of 487), 101 explained, 38 mismatched, 30 null                                                       | `unexplained` share falls as rung 3a answers              |
| `why_coverage_pct`                          | **0%** — see defect 1 below                                                                                                     | >70%                                                      |
| extract cache hit rate at slot time         | n/a                                                                                                                             | >90%                                                      |
| **L1 quote-anchor rejection rate**          | n/a                                                                                                                             | **<1% — rising means prompt regression, watch weekly**    |
| D+1/D+2 `validated` rate                    | **no recent data** — see defect 2 below                                                                                         | must not fall                                             |

### Two feedback-loop defects the baseline exposed

Both were found while trying to measure "today", and both matter because P3's
whole claim is that widening the net does not degrade quality — a claim only
these loops can test.

**1. The resolved WHY was never persisted (fixed 2026-09-04).**
`scanSignalEmail.js` has always _reported_ `why_coverage_pct`, computed from the
content overlay — a `/tmp` file discarded after the run. The overlay was also the
only place the resolved WHY ever lived: the shared pipeline's Step 4 asks the
orchestrating agent to store `why` on its `gainers-trigger-research` DTO, and
across **487 persisted DTOs it is null in every one**, while `linkage` — written
by the same step, in the same payload — is present on 94%. So the metric was
recomputed and discarded every run, and `insight-validation`'s documented D+2
scoring of the ladder's accuracy had nothing to read.

Asking the prompt more firmly would not fix that; a script writing it down does.
The renderer already holds every resolved WHY, so it now also writes
`data/runs/<prefix>_why_<date>.json` (companyId, tier, linkage, normalised `why`).
A run artifact derived from the renderer's own inputs — deliberately NOT a write
into the research DTO, which is not the email layer's record to mutate
(conventions §3/§5).

**2. The validation ledger has not run since 2026-07-30.**
`data/validation.json` holds 55 `gainers-followup` records across exactly two
dates (2026-07-17, 2026-07-30), all `validated: false`. The D+2 loop —
`insight-validation`'s core job, and the quality guard this entire plan leans on —
has been dark for five weeks. **Not fixed here**, and it is the single most
important thing to restore before P3 raises any cap: without it, "widening the net
didn't cost quality" is an assertion rather than a measurement. Whether the job is
failing, unscheduled, or writing elsewhere needs its own investigation.

That last row matters most — but see defect 2: the ledger it depends on is
currently dark. Restoring it is a precondition for P3, not a nice-to-have.

---

## 7. What could be wrong with this analysis

- **A cheap agent may not be cheap enough at 1000.** The whole plan assumes
  extraction cost per document is low enough to be speculative. At 1000 companies
  with results season document volumes, even a cheap agent's session count is not
  free. The per-run budget in §5 bounds it, but the honest position is: this needs
  measuring at ~200 before committing to 1000.
- **Off-season sample.** Every volume figure here comes from a quiet fortnight.
  Results season is materially heavier in both directions.
- **Scanned filings.** SAST disclosures and wet-ink board resolutions are where
  OCR already fails (the 2026-08-24 incident, where 4 filings were marked routine
  unread, one a ₹979cr pledge-revoke). Those must keep routing to the `ocrFailed`
  hard stop. L1 catches a _fabricated_ quote but not a _misread digit inside a
  real one_ — that is the residual risk, and it is why L2's arithmetic
  reconciliation exists.
- **Extraction drifting into judgment.** The moment a profile prompt contains a
  selection adjective ("material", "key", "significant"), that field has crossed
  to the flagship side of the line. Review prompt diffs for this specifically.
- **A stale baseline card is worse than none.** A card missing a concall
  classifies a genuinely NEW claim as KNOWN and suppresses a real signal — the
  expensive direction of error. Hence `baselineCoverage.thin`, and a hard rule:
  refuse to serve a card whose newest source doc is older than the company's
  newest filed transcript.
- **Ranking inherits the scorer's blind spots.** §1.3 makes a deterministic score
  the gatekeeper for 1000 names instead of 40 — so any systematic
  miscalibration it has now gets amplified proportionally. The
  `under_rated` finding in post-close Step 10 (a tier-4/5 note whose stock moved
  ≥3% on delivery-backed volume) is the existing detector for exactly this, and
  it should be watched closely for the first month after any cap rise.
- **Four caches now describe the same documents** — `pdf-text`, `doc-extracts`,
  `brief_cache`, `stockscans-context`, plus the notes cache. Conventions §17(a)
  exists for this. Keep extracts keyed on the **document**, never on the scan or
  the day, so two skills reading one filing cannot land on two different numbers.
- **This is a design, not a benchmark.** Nothing here is validated against real
  cheap-agent output. §2 L3 is not ceremony; it is the gate that decides whether
  each profile ships at all.

---

## 8. Open items for Darshan

1. **If a profile turns out to need real reasoning, I will say so** rather than
   ship a degraded extraction. Most likely candidates: `annual_report`, and
   guidance extraction inside `transcript`. Decision point is each profile's L3
   calibration result.
2. **Prove the economics at ~200 before committing to 1000** (§7 first bullet).
3. **The selection layer (§1.3) is the piece that actually determines what
   Darshan reads each morning.** It is a script, so it is auditable and
   changeable — but it deserves a deliberate review of its weights once extracts
   are feeding it, rather than inheriting today's weights by default.

---

## 9. Rollout order

1. **P0** — wire `stockscansContext`, backfill it, note the superseded §4, check
   `rerating_targets`. _No model, no risk, immediate WHY-ladder improvement._
2. **Capture the §6 baseline row.**
3. **P1** — pre-processing skill + job + queue + verification, `announcement`
   profile only, behind its calibration gate.
4. Turn the heavy-doc skip into a **signal-grade read** for `result` and
   `transcript` — the single biggest widening of the net.
5. **P2** — baseline cards; uncap the info-classifier.
6. **P3** — selection layer; raise the scan-pipeline caps; measure §6 again;
   watch the D+1 `validated` rate and the `under_rated` detector.

**Steps 1-6 are done (§10, §11).** What remains is operational, not
architectural: run the calibration gate per heavy profile, restore the validation
ledger, and let the Stockscans backfill finish.

---

## 10. P0 as built (2026-09-04) — and what it measured

### Shipped

| File                                                 | Change                                                                                                                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/jobs-runtime/lib/stockscansContext.js`     | added `readCached()` (sync, cache-only), `plainText()` (strips `{{bid:N}}` / `{+…+}` / `[N]` report markup), per-source retry with backoff, and the transport-vs-empty caching fix below |
| `packages/jobs-runtime/lib/companyContext.js`        | opt-in `{ stockscans: true }` attaches the bundle; own `stockscansMaxChars` budget; `stockscans:<id>` in `availableIds`                                                                  |
| `packages/jobs-runtime/warmStockscansContext.js`     | NEW — resolves the standing universe from local data and fills the cache                                                                                                                 |
| `jobs/Scheduled/stockscans-context-warm/SKILL.md`    | NEW — the job wrapper (zero model)                                                                                                                                                       |
| `package.json`, `packages/jobs-runtime/package.json` | `yarn stockscans:warm`                                                                                                                                                                   |
| `_shared/scan-signal-pipeline.md`                    | WHY-ladder rung 3 split into 3a (free Stockscans catalysts, any name) / 3b (the top-10 brief); rung 4 checks cached concall notes first                                                  |
| `announcement-info-classifier/SKILL.md`              | Step 3a: free `buildCompanyContext(id, {stockscans:true})` move before the fetch loop                                                                                                    |
| `docs/MODEL_COST_ORCHESTRATION.md`                   | §4 marked superseded on mechanism (§0.5)                                                                                                                                                 |

Everything is left unstaged for review. `eslint` and `prettier` clean.

### The bug this found — and why it mattered

`fetchStockscansContext` cached **every** bundle it produced, including ones where
the fetches had _failed_. Stockscans rate-limits these endpoints (HTTP 429), and
before the fix a rate-limited company was written to cache as
"no research available" with a fresh timestamp — **authoritative-looking emptiness,
served confidently for 7 days.** That is precisely the "a stale baseline card is
worse than none" failure in §7, and it was live in the module from the day it was
written; it had simply never fired because nothing called it.

Fixed by classifying each source failure as `empty` (HTTP 200 with a null report —
a real, cacheable fact: this company isn't covered) or `transport` (429/5xx/timeout
— tells us nothing), and **never caching a bundle with any transport failure.** The
warm job additionally has a circuit breaker: 8 consecutive transport failures stops
the run, since nothing useful is being written past that point.

136 already-poisoned cache entries from the pre-fix runs were invalidated
(timestamp set to epoch, so they read as a miss and get refetched — the Cowork
mount forbids `unlink`, and invalidation is the better move anyway).

### What it measured

- **Standing universe: 1,421 companies** over a 30-day window (615 from scan raw
  files, 648 from events, 158 from notes). That independently lands on Darshan's
  ~1000 scale target, which is a useful confirmation that §1.3's
  extract-wide/rank-deterministically/reason-narrow shape is the right one.
- **Coverage, on the NSE names the daily skills actually ask about:**
  ~92% business overview, ~92% growth catalysts, ~75% concall notes.
  So WHY-ladder rung 3a will answer for roughly nine names in ten — good enough to
  change the rung's character from "top-10 only" to "everyone".
- **An earlier sample said 13% growth-catalyst coverage.** That was two compounding
  artifacts: the universe was sorted alphabetically, so a `--limit`ed run only ever
  saw BSE microcaps starting with A; and the run was being throttled. Both are
  fixed — the universe is now ordered by likelihood of being needed tomorrow
  (newest scan appearances first), and coverage is computed over cached bundles
  only. _A metric that looked plausible and was wrong by 7× is the argument for
  §2's calibration gate, not against it._
- **Rate limits are the real operational constraint, not cost.** A 400-company run
  got 47 in before tripping; an 80-company run tripped too. Filling ~1,400
  companies is therefore many small runs (~40) across the day, not one nightly
  sweep — fine, since the TTL is 7 days and the universe turns over slowly.

### Not finished

The backfill is **incomplete: 97 companies servable of 1,421** at the time of
writing, because testing exhausted the endpoints' longer-window quota. This is not
a defect — the job is resumable by construction and the scheduled runs will fill it
in over the next few days. Consuming skills degrade to their current behaviour on a
miss, so nothing is broken in the meantime; rung 3a simply answers less often until
the cache is warm.

### Closed: the `rerating_targets` question (§4 item 0.4)

**Not a bug.** `rerating_targets` was added to `gainersClassifier.js` in commit
`8cbeb32` at 2026-09-04 05:14 IST; the newest seed on disk was written 2026-09-03
20:09, i.e. before the code existed. It should appear on the next scheduled run —
worth a glance at tomorrow's seed to confirm, but nothing to fix.

## 11. P1-P3 as built (2026-09-04)

### Shipped

| File                                                                                                                | What                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/docExtracts.js`                                                                                                | NEW — the extract store. Keyed by `sha256(sourceUrl)[0:32]`, **the same hash `watchlistInsights.js` uses for its PDF-text cache**, so an extract and its source text are findable from each other without being told where either lives. Refuses to store an unverified extract. `PREPROCESS_PROFILES` gates which profiles are live |
| `lib/verifyExtract.js`                                                                                              | NEW — L1 quote anchoring + L2 bound checks                                                                                                                                                                                                                                                                                           |
| `preprocessQueue.js`                                                                                                | NEW — universe → window → noise → profile → dedupe → priority-ordered batches, on its own cursor                                                                                                                                                                                                                                     |
| `preprocessPersist.js`                                                                                              | NEW — the only supported write path; verifies then stores                                                                                                                                                                                                                                                                            |
| `preprocessCalibrate.js`                                                                                            | NEW — the L3 gate (`plan` / `score`), threshold ≥98% numeric agreement, zero sign flips, prints a verdict                                                                                                                                                                                                                            |
| `buildBaselines.js`                                                                                                 | NEW — rolls extracts into per-company cards (`guidanceLedger`, `commitments`, `claimIndex`, `kpiHistory`)                                                                                                                                                                                                                            |
| `lib/thesisCardEmail.js`                                                                                            | `extractEvidenceScore()` — the selection layer (§1.3)                                                                                                                                                                                                                                                                                |
| `scanSignalEmail.js`                                                                                                | persists the WHY ledger (§6 defect 1)                                                                                                                                                                                                                                                                                                |
| `postCloseScanInsights.js`                                                                                          | `paginateScanToCutoff()` + `resolveScan()` exported for reuse                                                                                                                                                                                                                                                                        |
| `skills/equity-research/document-preprocessor/`                                                                     | NEW skill + `references/profiles.md` (5 schemas)                                                                                                                                                                                                                                                                                     |
| `jobs/Scheduled/document-preprocessing/`                                                                            | NEW job wrapper (cheap agent, no keys)                                                                                                                                                                                                                                                                                               |
| `post-close-scan-insights`, `_shared/scan-signal-pipeline.md`, `announcement-info-classifier`, `rerating-catalysts` | consumption edits                                                                                                                                                                                                                                                                                                                    |
| `skills/registry.json`                                                                                              | `document-preprocessor` registered                                                                                                                                                                                                                                                                                                   |

`yarn preprocess:queue|persist|calibrate`, `yarn baselines:build`,
`yarn stockscans:warm`. eslint + prettier clean; every module loads; all changes
unstaged for review.

### Verified end-to-end, on a real filing

A live SIS acquisition disclosure (2026-09-04) was queued, read via
`read-pdf-with-meta`, extracted to the `announcement` schema, verified and stored
at `confidence: high`; a baseline card was built from it carrying the claim
`acquisition|updater services limited|na` with `firstSeen: 2026-09-04`.

A deliberately fabricated control — same document, invented quote "acquired Adani
Enterprises for Rs. 4,200 crore" — was **rejected by L1 and quarantined**. That is
the control the whole design rests on, and it works on a real document, not just
in a unit test. (The control artifact is marked `__testArtifact` and excluded from
the rejection-rate metric; the mount forbids `unlink`.)

### What the live queue measured

Against the real `Signals - DND` scan over a 20-hour window: **450 fetched, 366
in window, 217 noise-dropped, 50 heavy documents, 147 announcement-profile
documents queued.**

### Two design decisions worth knowing about

**1. The noise filter is NOT applied to heavy documents.** The shared keyword
list contains "Annual Report" and "Investor Presentation" as title noise — which
in that same 20-hour window dropped **45 of 47 annual reports and all 3 investor
presentations**. Correct for the digest (it would skip them anyway); fatal here,
since those documents are the entire point. Applying it would have silently
guaranteed the heavy profiles never received a document while every counter still
looked healthy.

The resolution keeps the shared list unforked: those keywords do not assert "this
document is contentless", they assert "the digest does not want a card for this" —
a routing decision, not a fact about the filing. **Filter noise out of the cards;
never out of the corpus.**

**2. `RANK_SCORE_NOMINAL_MAX` stays at 65** even though the new evidence block can
add 36 points. The ratio clamps at 1.0, so an item with both a large
info-classification bonus and strong extract evidence tops out its band rather
than being paid twice for one strength. Raising the divisor would instead demote
every card written before the pipeline existed — silently re-ranking a year of
history against a yardstick it was never measured on. Verified: an item with no
`extractEvidence` scores exactly what it scored before.

### Caps raised

| Where                           | Was           | Now                                                                          |
| ------------------------------- | ------------- | ---------------------------------------------------------------------------- |
| post-close info-classifications | 5/night       | rank-driven, S3+ , **capped at 15 pending validation**                       |
| post-close heavy documents      | 0 read        | signal-grade read from extract; depth still deferred to the specialist skill |
| scan-pipeline trigger research  | 20 companies  | up to 30; the ~30-PDF ceiling now applies to _uncached_ reads only           |
| scan-pipeline WHY rung 2        | ACT tier only | ACT + WATCH with an unexplained move                                         |
| EPS briefs                      | 10            | 20, contingent on `briefExtractHits` showing the saving is real              |

### One gap found while checking completeness (fixed 2026-09-04)

`preprocess:backfill` appears in §5's timetable but had not been built, and the
hole behind it was worse than a missing convenience. While a profile is gated,
`next` counts its documents in `stats.profileDisabled` and the cursor then
advances past them. So on the day a heavy profile passed its calibration gate,
every Result / PPT / transcript / annual report filed while it was gated — ~50 a
day for however many weeks — would sit behind the cursor and never be extracted.
The queue would have looked healthy while holding no history at all for exactly
the document types this pipeline exists for.

Built as `yarn preprocess:backfill --days N [--profile p]`. It bypasses floor and
cursor (conventions §19's explicit-catch-up contract) and deliberately writes no
pending-window marker, so it can never move the incremental cursor — a backfill
reaching back 30 days that then committed would jump the cursor to now and drop
everything the next incremental run should have seen. **Backfill reads history; it
never speaks for the present.** Enabling a profile now requires it, stated in both
the skill's Step 5 and the job wrapper.

### Two fetch-layer fixes from the first live run (2026-09-04)

**1. The 8000-char truncation.** `cloud-utils/src/pdfText.js` capped EVERY PDF read
at 8,000 characters. Harmless while heavy documents were always skipped; fatal the
moment reading them became the point. Gemini's first shadow run produced 40 extracts
that all passed L1 at `confidence: high` and were nearly empty — an annual report of
951,309 characters returned its covering letter, so `contingent_liabilities` came
back 0/24 because that section was never in the input.

**L1 could not catch this, and the calibration gate would have certified it** — two
readers handed the same excerpt agree perfectly. That was a genuine blind spot in
the gate, not just a bug in a reader. Fixed with a `--full` read path writing to a
separate `pdf-text-full/` cache, a hard-reject `truncated_source` L1 status, and a
truncation check in `calibrate plan`. All 40 extracts invalidated.

**2. Unscoped scan walks.** The queue paginated the whole universe and filtered
client-side. Scoping server-side by the `announcementType` enum, per Darshan's
suggestion, on a live 7-day window:

|                  | pages                  | heavy documents found |
| ---------------- | ---------------------- | --------------------- |
| unscoped (`All`) | ~80 — hits `MAX_PAGES` | 47                    |
| scoped, 4 passes | 18                     | 188                   |

The recall gap is the real finding: the unscoped walk truncates the window silently
at the page cap, so it never reaches most of what was filed. `paginateScanToCutoff`
now returns `pagesFetched`/`hitPageCap` so that truncation is visible, and
`--profile` scopes the request.

Both fixes are the same failure shape — **silent truncation with no signal** — one
in the document reader, one in the scan walker.

### Deliberately NOT done

**Only the `announcement` profile is enabled.** `result`, `transcript`, `ppt` and
`annual_report` are written and wired but gated off in `docExtracts.isEnabled()`
until each passes its L3 calibration run on 15 real documents. This is the one
step that cannot be done ahead of time or on someone's behalf — it needs a
flagship read of real filings to compare against, and enabling a profile without
it would put unvalidated numbers into the corpus every consuming skill now trusts.
Until then, ~50 heavy documents a day continue to be skipped, and the run report
says so as `stats.profileDisabled`.

**The validation ledger is still dark** (§6 defect 2, last run 2026-07-30).
Restoring it is a precondition for raising the post-close cap past 15 — without
it, "the wider net didn't cost quality" is unmeasurable.

## Sources

- Repo, read 2026-09-04: `skills/equity-research/{post-close-scan-insights,gainers-signal,volume-rocketing,announcement-insights,announcement-info-classifier,guidance-document-extractor}/SKILL.md`;
  `skills/equity-research/_shared/scan-signal-pipeline.md`; `skills/_shared/conventions.md`;
  `skills/tooling/antigravity-scheduled-tasks-sync/SKILL.md`;
  `packages/jobs-runtime/lib/{stockscansContext,concallNotesStore,gainersClassifier,windowCursor,thesisCardEmail,db}.js`;
  `stock-api/src/clients/StockscansClient.js`; `docs/{MODEL_COST_ORCHESTRATION,stockscans-api-schemas}.md`.
- Volume evidence: `data/notes.json` (2094 notes; 20–56/day recent),
  `data/cache/heavy-doc-skips_2026*.json`, `data/runs/*_research_seed_2026090*.json`.
- Design decisions by Darshan, 2026-09-04: no LLM provider API keys anywhere in
  job/skill workflows (§0.5); signal-grade heavy-doc reads with depth deferred to
  the specialist skills (§3); scale target ~1000 companies (§0.4).
