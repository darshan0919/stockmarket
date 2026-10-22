# Quarterly Result History Pack

Status: IMPLEMENTED 2026-10-22 (grill-skill review of `quarterly-result-extractor` →
`quarterly-result-analysis`). Changes are unstaged for review.

## Goal

`quarterly-result-analysis` (QRA) must never generate historic context at runtime. Everything
about the past is prepared by `quarterly-result-extractor` (QRE), ideally before the result, and
QRA reasons only about the delta: this quarter's documents against the prepared history.

## Evidence that drove the design (DB + code, 2026-10-22)

| Finding                                                                                                                                                                 | Evidence                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| QRA `--prepare` is cheap; history was rebuilt inside the reasoning step                                                                                                 | `stock-api/bin/quarterly-result-analysis.js`, `resultAnalysisContext.js`                                  |
| Walk the Talk fell back at runtime to fetching the prior transcript and extracting guidance                                                                             | old `references/inflection_walk_the_talk.md` §1; 7 of 19 analysed companies had no `forward-guidance` DTO |
| Narrative shift needs 2-3 prior calls; QRE read only 1 prior transcript, on result day                                                                                  | `basket_framework.md` 3B, old `fetch_result_documents.js`                                                 |
| One-off recurrence (4Q) and the Conservative tone check (4-8Q) were never precomputed                                                                                   | `basket_framework.md` 1B, `tone_taxonomy.md`                                                              |
| Prior verdict chain never fired                                                                                                                                         | 0 companies with more than one `quarterly-result` DTO                                                     |
| `fetch_result_documents.js` ignored `--date`; `manifest.quarter` came from an unsorted transcript lookup; `save_result_documents.js` stamped the run date, not `--date` | fixed (P0)                                                                                                |
| All 23 QRE records were old-schema (no `headlineFinancials`)                                                                                                            | QRA now flags `recordStale`                                                                               |
| `pead-predictor/scripts/gather_inputs.js` already gathered most pre-result history                                                                                      | lifted into `lib/resultHistory/inputs.js`, shared                                                         |

## Decisions (criticality checkpoint, Darshan)

- **Mission-Critical (frontier + verified quotes), all four:** prior guidance ledger,
  narrative/tone baseline, one-off recurrence history, known-catalyst baseline.
- Pack scope: **shared pre-result context** (QRA, pead-predictor, growth-predictor).
- Trigger: **daily job + on-demand**.
- Post-result with no pack: **auto-build the pack, then the delta**.
- Not doing (for now): speed-up measurement, a prior-checklist scorecard section.

## Architecture

### Concall digest — reasoning done once per call, ever

A past call never changes, so its frontier reading — guidance rows (forward-guidance item
schema), tone label + quote, topic inventory with keywords, one-off excuses, C-A-T-A-L-Y-S-T
catalysts — is saved once as a `concall-digest` report (`date` = call quarter end, `modelUsed`
set). `save_call_digest.js` refuses to save unless every quote is verbatim in the transcript
(verifyExtract L1). Every later pack reuses it; QRA's own run digests the current call
(`role: current`) so this quarter's reading becomes next quarter's history.

### History pack — script assembly

`quarterly-result-history` report, one per company + target quarter (`date` = target quarter
end, so re-runs upsert). Contents: `priorGuidance` + `walkTheTalkSkeleton`, `narrative`,
`oneOffRecurrence`, `knownCatalysts`, `priorVerdicts` (incl. open Q+1 and last checklist),
`concallNotesGuidance` (Stockscans cross-check), 12Q `financials`, `filings` since the prior
quarter end, `priceAction` (pre mode only), `priorAnalyses`, `digestCoverage`, `coversThrough`.

### Modes (`lib/resultHistory/period.js`)

Decided from the company's Stockscans document list: `post` when the target quarter's Result is
filed, else `pre` for the quarter after the newest filed Result. `--quarter` / `--date` override.
Stockscans "Days From Result" `>= 0` = upcoming (live-confirmed, documented in
`docs/stockscans-api-schemas.md`).

- `pre`: Step 0 only — A `pending-digests` → B digest + `save-digest` → C `build-pack`.
- `post`: ensure the pack (Step 0), then Steps 1-4 as a delta: `--skip-prior`, `possiblyDropped`
  seeded by `possibly-dropped`, `--history-pack <id>` on save.

### QRA

`--prepare` loads the pack and emits `historyContext`, `currentCallDigest`, `historyPackMissing`,
`recordStale`; `prepareInflectionContext` takes the pack's `priorGuidance` (which adds verified
digest guidance for quarters with no forward-guidance DTO). The runtime prior-transcript fallback
is gone; references read history from `historyContext` (History Rule in SKILL.md Phase 1).

## Files

| Piece          | Path                                                                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared lib     | `packages/jobs-runtime/lib/resultHistory/{period,inputs,callDigest,historyPack,runtime}.js`                                                                                             |
| QRE scripts    | `skills/equity-research/quarterly-result-extractor/scripts/{prepare_call_digests,save_call_digest,build_history_pack,possibly_dropped,fetch_result_documents,save_result_documents}.js` |
| Digest rules   | `skills/equity-research/quarterly-result-extractor/references/call_digest.md`                                                                                                           |
| QRA            | `stock-api/bin/quarterly-result-analysis.js`, `stock-api/src/analyzers/resultInflection.js`, SKILL.md + references                                                                      |
| pead-predictor | `gather_inputs.js` imports the lifted helpers and reads `historyPack`                                                                                                                   |
| Universe + job | `packages/jobs-runtime/resultsHistoryPackUniverse.js` (`yarn results-history-pack-universe`), `jobs/Scheduled/results-history-pack-daily/`                                              |
| Tests          | `packages/jobs-runtime/test/resultHistory.test.js`, `stock-api/test/resultInflection.test.js`                                                                                           |

## Model tiering

| Task                                                       | Tier                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| Concall digest (Step 0 B)                                  | Frontier, once per transcript; quotes script-verified |
| Pack assembly, financials, filings, price set-up, universe | Script                                                |
| Current-call recall excerpts (QRE Step 3)                  | Cheap tier (unchanged)                                |
| QRA interpretation                                         | Frontier (unchanged)                                  |

Cheap-tier sessions (the 01:00 extraction job, the daily analysis job) never write digests; they
run Step 0 A/C and report pending quarters.

## What could be wrong

- **Stale pack**: filings between the build and the result — the daily job rebuilds C each day
  inside the 0-3 day window, and post mode reports `coversThrough`.
- **Restatements**: the pack's financials are context; the result filing's own comparatives
  (XBRL/PDF, Step 1.6) remain the source for QoQ/YoY.
- **Digest errors propagate for 4 quarters**: L1 quote verification + Stockscans concall-notes
  tables as cross-check; unverified digests are never used.
- **First-season cost**: up to 4 digests per company the first time (≈36 upcoming results/day
  in season at mcap ≥ 500 Cr); `--limit` caps a run, the overlapping window picks up the rest.
- **Topic-keyword diff** is a seed: absent keywords can mean rephrasing, so `possiblyDropped`
  still needs the excerpt pass's confirmation.
