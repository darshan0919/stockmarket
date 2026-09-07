# Filing Reuse Architecture — extract once, judge many times

Design plan for maximizing reuse of already-fetched/extracted filing content
across independently-invoked skills, without letting one skill's judgment
leak into another skill's cache. Written 2026-09-06, following the
`document-preprocessor` pipeline (`docs/PREPROCESSING_PIPELINE_PLAN.md`) and
its second/third calibration rounds.

Status: **PROPOSAL — not yet implemented.** This extends the existing
Filing Extract store rather than replacing it; Section 10 of
`PREPROCESSING_PIPELINE_PLAN.md` already ships the hard part (verified
extraction). This plan is about who's allowed to _read_ it, and drawing the
line on what else is safe to share.

---

## 1. The problem, stated precisely

Two different reuse failures exist today, and they need different fixes:

**Failure A — the shared store exists but most skills don't call it.**
`docExtracts.js` stores verified, page-anchored Filing Extracts
(`related_party_transactions`, `contingent_liabilities`, `auditor`,
`remuneration`, `guidance`, etc. — see
`skills/equity-research/document-preprocessor/references/profiles.md`). Only
three places in the repo read or write it: the producer skill itself,
`post-close-scan-insights`, and `rerating-catalysts` — and even
`rerating-catalysts` only checks it in `--mode brief`, never in `full` mode.
Everything else — `annual-report-analysis`, `forensic-accounting`,
`concall-analysis`, `equity-research-deepdive`, `consecutive-filings-diff`,
`growth-triggers-1pager`, `drhp-ipo-analysis` — does its own PDF fetch and its
own `pdftotext`/`grep` pass, every time it's invoked, even when another skill
(or a prior run of the same skill) already paid that cost minutes or days
earlier. Six of those SKILL.md files additionally point at
`stock-api/python/fetchers/fetch_documents.py`, which **does not exist on
disk** (confirmed — no `stock-api/python/` directory at all;
`stock-documents-fetcher/SKILL.md` itself flags this as corrected
2026-08-02, but the six downstream skills were never updated to match). That's
not just wasted tokens — it's an agent hitting a dead path, discovering the
real one by trial, and burning a retry on every invocation.

**Failure B — no state tracks what a skill has already reasoned about.**
`rerating-catalysts --mode full` (the default, unqualified invocation) has no
state file, no "seen" ledger, no DB write recording which filings it read for
a given company on the last run. Invoke it twice on the same ticker with no
new filings in between, and it re-fetches and re-reads everything from
scratch both times. The `--mode brief` sub-flow (added 2026-09-03) already
solves this correctly — `brief_cache.js`'s `briefs/<companyId>.json` is
reused whenever `newFilingsSince()` finds nothing new since `builtAt`, and its
`filings/<hash>.json` per-document catalyst signature is a genuine read-once,
reuse-forever cache — but that mechanism is scoped to one skill's one code
path and isn't available to anyone else.

Both failures have the same fix shape: a shared, versioned, fact-only store
underneath, with every skill required to check it before touching a raw
document. That's what `docExtracts.js` already is — it just isn't finished
being adopted, and it doesn't yet capture everything that's safely shareable.

## 2. What's actually safe to share (the "blind reuse" trap)

Your instinct — don't cache blindly — maps to a well-established split in
both data engineering and production LLM/RAG systems: **extraction is
cacheable, inference is not.** ([Microsoft ISE: "Separating Deterministic
Extraction from AI Inference"](https://devblogs.microsoft.com/ise/separating-deterministic-extraction-from-ai-inference/))
The test: is this output a pure function of _(document)_ alone, reproducible
byte-for-byte by two different readers? Or is it a function of
_(document, one skill's rubric)_, where the "correct" answer depends on which
skill is asking?

Concretely, from tracing four consuming skills against the same source
documents:

| Shared substrate (cache under `docExtracts`, one entry, many readers)                                                                                              | Skill-specific derivation (never cached centrally)                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RPT table: party, relationship, nature, amount, page — same rupee figures, same names, needed byte-identical by `annual-report-analysis` AND `forensic-accounting` | Whether that RPT is "reasonable" (annual-report-analysis's call) vs. matches the Manpasand/Gensol fraud pattern (forensic-accounting's call) — same input, two non-transferable verdicts |
| Auditor opinion, qualifications, KAMs, verbatim — needed by both skills above                                                                                      | Governance rating (GOOD/AVERAGE/CONCERNING) vs. Green/Yellow/Red forensic verdict                                                                                                        |
| Transcript guidance statements, quoted verbatim with speaker + page                                                                                                | "Is management's tone shifting" (concall-analysis) vs. "did they deliver" (management-credibility-tracker) — one fact, two independent judgments                                         |
| Contingent liabilities, remuneration, misc expenses, capex commercialisation                                                                                       | Piotroski F-Score, DuPont decomposition (forensic-accounting derives these from raw financials, but the score itself is forensic-accounting's construct, not a fact of the filing)       |

The dividing line in practice, stated as a rule rather than a list: **if two
skills reading the identical extract would produce the identical value with
zero judgment applied, it belongs in the shared store. If producing the value
requires a threshold, a comparison, a "is this concerning" framing, or a
skill's own named methodology (Piotroski, walk-the-talk scoring, SOTP), it
stays inside that skill and is never written back to `docExtracts`.**

This is the same boundary feature stores draw between versioned, shared _raw/
engineered features_ and model-specific _derived scores_ that stay out of the
shared store — same logic, applied to documents instead of tabular ML
([IBM: What is a Feature Store](https://www.ibm.com/think/topics/feature-store)).
It's also the same shape as CQRS's single-write/many-read-model split
([Azure Architecture Center: CQRS](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs)):
the Filing Extract store is the write side (one normalized fact model, built
once), and each skill is an independent read-side projection that never
writes its interpretation back into the shared model.

One nuance worth calling out because it's not obvious: **the SAME semantic
fact can need different granularity for different skills**, and that doesn't
break the shared-substrate rule as long as the shared version is the more
granular one and the coarser view is a skill-side derivation. Example:
`management-credibility-tracker` wants "guidance delivered Y/N" per quarter,
but the shared `transcript.guidance[]` extract already carries the raw
statement, quarter, and quote — the ledger just filters/joins across quarters,
it doesn't need its own re-extraction. If a skill ever needs to store BACK a
derived per-quarter judgment for its own future runs (which
management-credibility-tracker legitimately does — it needs its own
walk-the-talk history), that goes in that skill's OWN namespaced state
(already the pattern: `brief_cache.js`'s `briefs/<companyId>.json` under
`data/cache/rerating-catalysts/`, not under `data/cache/doc-extracts/`).

## 3. Architecture: three tiers, matching the medallion/CQRS pattern

```
Tier 0 - Raw bytes           data/cache/pdf-text{,-full}/<hash>.json
                              (already exists - pdfText.js, watchlistInsights.js)
                              Content-addressed by sourceUrl hash. Text only,
                              no interpretation. Already dedups PDF-to-text work.

Tier 1 - Filing Extract      data/cache/doc-extracts/<profile>/<hash>.json
(shared substrate,           (already exists - docExtracts.js, this pipeline)
 CQRS write side)            Verbatim facts + page citations, per document,
                              per profile. Keyed (sourceUrl, extractorVersion).
                              THE thing every skill should check before
                              reading a PDF itself.

Tier 2 - Company Baseline    data/cache/company-baselines/<companyId>.json
Card (rollup of Tier 1,      (already exists - buildBaselines.js)
 still fact-only)            Multi-document facts joined per company:
                              guidanceLedger, commitments, claimIndex,
                              kpiHistory. Still zero judgment - a company-level
                              view of Tier 1, not an opinion about the company.

Tier 3 - Skill-specific      data/cache/<skill-name>/...
derived state (CQRS          (rerating-catalysts already does this -
 read side, NEVER shared)    brief_cache.js's briefs/<companyId>.json)
                              Each skill's own judgment, own schema, own TTL.
                              Never read by another skill. Never written to
                              docExtracts or company-baselines.
```

Tiers 0-2 already exist and are correctly designed (fact-only, verified,
versioned). The gap is Tier 3 not existing for most skills, and most skills
not reading Tiers 1-2 before doing their own Tier-0-equivalent work.

## 4. What to build

### 4.1 A shared "check before you fetch" helper, not a policy everyone has to remember

The failure mode isn't that skills don't know the rule — it's that following
it manually, every time, in a SKILL.md's prose, is exactly the kind of thing
that erodes over a long or repeated invocation (we just watched this happen
_inside_ the extraction skill itself during the annual_report calibration
runs — schema drift after ~9 documents in one session). The fix is the same
principle applied one level up: make reuse the path of least resistance, not
an instruction to remember.

Add one script, `packages/jobs-runtime/lib/resolveFilingContent.js`, that
every document-touching skill calls FIRST:

```
resolveFilingContent({ sourceUrl, profile, companyId })
  -> { source: 'extract-cache', data, extractedAt }         // Tier 1 hit
  -> { source: 'baseline-cache', data, builtAt }             // Tier 2 hit (company-level ask)
  -> { source: 'miss', reason: 'not-yet-extracted' }          // caller must fetch+read itself,
                                                              // OR enqueue via preprocessQueue
                                                              // if this is a scheduled context
```

This does not do extraction — it's a thin, deterministic lookup (script-first,
no model call). A skill that gets `source: 'miss'` falls back to its current
fetch-and-read behavior unchanged, so this is purely additive and never
blocks on the pre-processing job having already run. The win compounds
automatically as `document-preprocessor`'s coverage widens (more profiles,
more of the daily universe pre-extracted ahead of time) — skills don't need
to change again as that coverage grows, they already asked.

### 4.2 Extend `docExtracts.js` schemas to close the two gaps found

From tracing `forensic-accounting`, `annual-report-analysis`, and
`management-credibility-tracker` against the current `annual_report` and
`transcript` profiles:

- **Auditor tenure/rotation history is missing.** The current `auditor` field
  captures only the current year's opinion — `forensic-accounting`'s
  Manpasand-pattern check (sudden auditor change) still requires reading 2-3
  consecutive ARs itself. Add `auditor.firm`, `auditor.appointedDate` (as
  printed, not computed) to the existing schema so 3 years of cached extracts
  can be diffed by a script instead of re-read.
- **`management-credibility-tracker` doesn't consume the `transcript`
  profile's `guidance[]` at all** — it re-derives guidance via
  `concall-analysis` every time, duplicating work `docExtracts` already
  verified and stored. This is a wiring gap, not a schema gap: point it at
  the shared extract first, fall back to `concall-analysis` only for
  quarters not yet in the store.
- **No capex-guided-vs-actual pairing.** `capex_commercialisation[]` records
  what's printed in one document; reconciling "PPT said Q3FY26, AR shows
  actual commissioning date" is currently redone by hand per skill.
  This one is a Tier-2 (Company Baseline Card) concern, not Tier 1 — it's a
  join across two documents, which `buildBaselines.js` already does for
  `commitments[]`/`claimIndex`. Extend that join to include a
  guided-vs-actual capex timeline field.

### 4.3 Fix the six skills pointing at a nonexistent fetcher

Independent of the reuse work, but cheap and high-value: `forensic-accounting`,
`concall-analysis`, `consecutive-filings-diff`, `equity-research-deepdive`,
`equity-research-extraction`, and `growth-triggers-1pager`'s SKILL.md files
all still show `python3 stock-api/python/fetchers/fetch_documents.py`
examples. `stock-documents-fetcher/SKILL.md` already documents the real path
(`fetchDocuments`/`fetchAnnouncements` via `require()`, idempotent
`manifest.json` with `cached: true` skip-if-exists — this is Tier-0-level
download dedup, already correct, just undocumented in the six callers).
Update those six files to call the real functions and, while there, insert
the `resolveFilingContent()` check ahead of any fetch, so this fix and the
reuse fix land together.

### 4.4 Give `rerating-catalysts --mode full` the same cache `--mode brief` already has

`brief_cache.js` is the one genuinely complete "read once, reuse forever"
precedent in the repo (`filings/<hash>.json`, cross-company, cross-run). The
`full` mode's own document set (7-day announcements, last-4 transcripts,
last-4 results, last-2 PPTs) should route through `resolveFilingContent()`
per document before falling back to its own fetch — same mechanism as 4.1,
applied to close the specific gap the user named directly ("running
`/rerating-catalysts` twice shouldn't reprocess documents it already saw").

### 4.5 Versioning: never silently serve a stale extract to a smarter question

Every `docExtracts` record already carries `schemaVersion`
(`docExtracts.js`, `SCHEMA_VERSION`) and `extractedAt`. The missing piece for
safe reuse across skill _evolution_ (not just across skills at a point in
time): when `profiles.md`'s schema for a profile changes (as it just did,
twice, during the annual_report calibration rounds), old extracts under the
previous shape must not be silently read as if they matched the new one.
`resolveFilingContent()` should reject (treat as `miss`) any record whose
`schemaVersion` is older than the profile's current declared version, the
same way `docExtracts.isInvalidated()` now works for the manually-invalidated
batches from the last two calibration runs — but automatic, keyed off a
version bump, not a one-off manual flag. This is exactly the
content-addressed-plus-transform-version key that LlamaIndex's
`IngestionPipeline` uses to decide "reuse vs. recompute" per transform
([LlamaIndex Ingestion Pipeline docs](https://docs.llamaindex.ai/en/stable/examples/ingestion/document_management_pipeline/)) —
recompute only the transform whose version changed, reuse everything else
untouched, rather than invalidating a whole document's cache for one field's
schema fix.

## 5. What NOT to build (the blind-reuse traps to avoid)

- **Do not cache skill outputs keyed by document alone.** A cache entry keyed
  `(sourceUrl) -> forensic-accounting's verdict` would silently serve that
  verdict to any other skill that happens to ask about the same document,
  smuggling forensic-accounting's rubric into, say, `annual-report-analysis`'s
  answer. Every Tier-3 cache is namespaced per skill
  (`data/cache/<skill-name>/...`), never shared, matching what
  `brief_cache.js` already does correctly.
- **Do not build a semantic/embedding cache for the judgment layer.** Semantic
  caching (GPTCache-style, matching by query similarity) is the right tool
  for the Tier-1 fact layer where two literally-identical extraction requests
  should hit the same entry — it is the wrong tool for skill judgments, where
  two skills' questions about the same document are _supposed_ to be
  different and must never collide.
- **Do not centralize Tier-3 state into `company-baselines`.** Baseline Cards
  stay fact-only (Tier 2). A skill's own credibility ledger, thesis version
  history, or catalyst signature is that skill's business, not a fact anyone
  else should read.
- **Do not force every skill to move to `docExtracts` in one pass.** Ship
  `resolveFilingContent()` as a pure addition (Section 4.1) — skills adopt it
  incrementally, each adoption independently shrinks its own token spend on
  repeat runs, and a skill that hasn't adopted it yet keeps working exactly
  as it does today.

## 6. Rollout order

1. `resolveFilingContent()` helper (Section 4.1) — pure addition, no skill
   changes required yet, ships the schema-version staleness check
   (Section 4.5) from day one.
2. Wire `rerating-catalysts --mode full` through it (Section 4.4) — closes
   the exact gap named in this request, and is the skill most likely to be
   re-invoked repeatedly on the same names.
3. Fix the six dead-fetcher references (Section 4.3) — cheap, unblocks real
   token savings the moment those skills next run, low risk since it's a
   like-for-like path correction.
4. Extend `annual_report` schema for auditor tenure (Section 4.2) — do this
   AFTER the current annual_report calibration passes; changing the schema
   again mid-calibration would restart the clock on an already-difficult gate.
5. Wire `management-credibility-tracker` to read `transcript.guidance[]`
   before falling back to `concall-analysis` (Section 4.2) — independent of
   the others, can land any time.
6. Capex guided-vs-actual join in `buildBaselines.js` (Section 4.2) — lowest
   priority; nice-to-have reconciliation, not a duplication fix.

## 7. What could be wrong with this plan

- **Extraction schema churn could still force reprocessing even with
  versioning done right.** Just watched this happen live: the annual_report
  schema changed twice in three days chasing calibration failures. Every
  schema bump invalidates every extract under the old version, which is
  correct behavior (Section 4.5) but means the "extract once" promise only
  holds once the schema has actually stabilized — expect this pipeline to
  spend a few more weeks paying re-extraction cost before the version churn
  settles down, especially for `ppt` and the not-yet-calibrated
  `result`/`transcript` profiles.
- **The fact/judgment line isn't always crisp.** "Auditor tenure" is a fact;
  "sudden auditor change is a fraud signal" is forensic-accounting's
  judgment — clean. But something like "guidance changed vs last quarter"
  sits closer to the boundary: is "changed" a fact (a diff) or already an
  interpretation? Current design treats `transcript.guidance[]` as facts per
  quarter and leaves the diffing to whichever skill wants it — worth watching
  whether that boundary holds up as more skills adopt Tier 1, or whether a
  "diff" utility itself needs to become a shared, still-judgment-free Tier
  1.5 primitive.
- **`resolveFilingContent()` adds a dependency every document-touching skill
  must load correctly** — if it has a bug (as the calibration scorer just
  did, twice), every skill using it inherits that bug simultaneously, versus
  today's independent-implementation risk being spread across skills. This
  argues for the helper being small, heavily tested, and changed rarely once
  shipped, not for skipping it.
- **This plan doesn't fix skills that need judgment `docExtracts` isn't
  designed to hold** (e.g., `equity-research-deepdive`'s broader synthesis) —
  those skills will still do their own reading for anything past the raw-fact
  layer; the win is bounded to the overlapping-raw-fact portion of their
  work, not their whole runtime.

## Sources consulted

- [Separating Deterministic Extraction from AI Inference — Microsoft ISE Developer Blog](https://devblogs.microsoft.com/ise/separating-deterministic-extraction-from-ai-inference/)
- [What is the medallion lakehouse architecture? — Microsoft Learn](https://learn.microsoft.com/en-us/azure/databricks/lakehouse/medallion)
- [CQRS Pattern — Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs)
- [Materialized View pattern — Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view)
- [Ingestion Pipeline + Document Management — LlamaIndex Docs](https://docs.llamaindex.ai/en/stable/examples/ingestion/document_management_pipeline/)
- [What Is a Feature Store? — IBM](https://www.ibm.com/think/topics/feature-store)
- [LLM Caching Strategies: Prompt Caching, Semantic Caching, and When to Use Each — NeuralTrust](https://neuraltrust.ai/blog/llm-caching-strategies)
