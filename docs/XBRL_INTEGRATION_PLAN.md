# XBRL Integration Plan (NSE + BSE) — REVISION 2 (decisions and BSE findings applied)

Status: **plan only — no code written.** Drafted 2026-09-30. Owner: Darshan.
Related: `docs/PREPROCESSING_PIPELINE_PLAN.md`, `docs/nse-api-schemas.md`,
`docs/bse-api-schemas.md`, `skills/_shared/conventions.md`.

## 1. Goal and non-negotiable rules

Make structured exchange XBRL the **primary** source for every filing type that
has it, wire it into the skills that read filings, and keep the existing PDF
path as an **always-available fallback**.

1. **XBRL first, PDF fallback per period and per statement.** If XBRL is missing
   for _any_ required period (current, prior quarter, prior year, YTD) or fails
   validation, that period falls back to the existing PDF handling. Never fail
   the run because XBRL is absent.
2. **Both exchanges.** NSE and BSE are both fetched, merged per filing, and
   disagreements are logged.
3. **Script-first, no LLM API keys.** Fetch, parse, normalise, reconcile are
   scripts. The only model work is narrative text (one-offs, auditor text)
   done by the agent inside the skill.
4. **Every gap is logged, not swallowed.** Missing filing, missing field, unit
   or sign anomaly, exchange disagreement, parse error — all go to a
   machine-readable issue log with a severity, and are summarised in a report.
5. **Repo rules apply:** one client per provider (new methods on `NseClient` /
   `BseClient`, no raw HTTP elsewhere); JSDoc typedefs; endpoint docs written
   with the code in `docs/nse-api-schemas.md` and `docs/bse-api-schemas.md`;
   persistence only through `packages/jobs-runtime/lib/db.js`; tests in
   `__tests__/`; `yarn` facade only; changes left unstaged; concurrency-safe
   design (keyed state and explicit parameters, no ambient "active company").
6. **Platform-reuse check** (repo rule): confirm before building that Stockscans
   Result Scans / Company Reports do not already expose the same fields. Known
   answer so far: they do not expose raw XBRL line items or footnotes. Re-verify
   in Phase 0.

## 2. Verified facts this plan rests on (live probes, 2026-09-29/30)

| Fact                                                                                                                                                                                                                                                   | How verified                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| NSE Integrated Filing (Financials) rows carry `xbrl`, `ixbrl`, `broadcast_Date`, `qe_Date`, `consolidated`, `type_Sub` (Original/Revision)                                                                                                             | live call, HNDFDS/Vipul/Transworld               |
| Quarterly XBRL holds **only the current period context**; annual/half-year files add the year and balance sheet/cash flow                                                                                                                              | 9 XBRL files inspected                           |
| Values are raw INR with precision (no Lakh/Crore ambiguity); signs preserved                                                                                                                                                                           | HNDFDS Q1 XBRL vs PDF, 8 lines matched           |
| XBRL lags the results PDF: median ~31 min, p75 ~98 min, p90 ~3.3 h, max ~22 h (n=94, Q1 FY27)                                                                                                                                                          | scripted sample                                  |
| PIT (insider) filings expose `xmlFileName` + `ixbrl`; SAST Reg 29 has its own structured JSON endpoint (`/corporate-sast-reg29`, 384 rows/week) but the disclosure is PDF                                                                              | live calls                                       |
| Also on NSE: shareholding (`/corporate-share-holdings-master`), BRSR (`/corporate-bussiness-sustainabilitiy`, has `xbrlFile`), Integrated Filing Governance (same endpoint as financials, `type=Integrated Filing- Governance`)                        | live calls                                       |
| `/corporates-voting-results` is 404; `/corporate-governance` demands a `recId`; announcements feed `hasXbrl` is true for every row and gives no XBRL link                                                                                              | live calls                                       |
| Stockscans `scanMetadata()` returns 473 industries; `runScan()` returns a table keyed by `companyId`                                                                                                                                                   | live call                                        |
| `screener-api/src/core/utils/xbrlParser.js` has no mapping for changes in inventories, exceptional items or segments, and a typo key (`TradePay ables`)                                                                                                | code read                                        |
| BSE: `BseClient` has announcements/SAST/insider/bulk-deal methods but **no XBRL method yet**                                                                                                                                                           | code read                                        |
| BSE XBRL-filings page uses `GetCorXbrlDetails_ng/w` (params `Flag`, `scripcode`, `fromdate`, `todate`); ~70 categories (PIT, shareholding, voting results, governance, BRSR, credit ratings, Reg-30 events). Flag 22 "Financial Results" returns empty | Chrome network capture + `bseGetJson`            |
| BSE results XBRL comes from `Corp_FinanceResult_ng_new/w` (params `SCRIP_CD`, `FlagDur`, `HFQ`, `segment`); rows carry `XMLName`, `Consol_XMLName`, `quarter_code`, `DT_TM`; history seen back to FY2017-18 for scrip 540797                           | Chrome capture + `bseGetJson`                    |
| BSE files download from `https://www.bseindia.com/XBRLFILES/<XMLName>`; plain curl needs a browser User-Agent and `Referer: https://www.bseindia.com/`                                                                                                 | curl                                             |
| BSE packaging is mixed: new files are iXBRL `.html` with `in-capmkt` names, **single-quoted attributes, `scale='6'` (values shown in millions, must be multiplied) and a `sign='-'` attribute**; older files are plain `.xml` with `in-bse-fin` names  | 3 files inspected (42 facts in the iXBRL sample) |
| BSE iXBRL uses several contexts per element (e.g. `OneExpenses1D/2D/3D` for itemised other expenses), so the parser must not assume one fact per element                                                                                               | file inspection                                  |

**Correction to draft 1:** order wins, credit ratings, board outcomes and other
Reg-30 events are _not_ PDF-only on BSE; BSE lists XBRL for them. §3 is updated.

**Still unverified (Phase 0):** whether NSE exposes Reg-30 XBRL; NSE shareholding
XBRL link; NSE voting-results endpoint; MCA annual-statement XBRL access; bank,
NBFC and insurance taxonomies; BSE Flag 7 (annual reports) payload; BSE-vs-NSE
value agreement on the same filing (only one BSE file compared so far).

## 2a. Phase 0 results (2026-09-30)

| Item                   | Result                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NSE voting results     | `/corporate-voting-results` (singular; my earlier "404" used the wrong path). Row `metadata.vrXbrlFilename` → `in-bse-voting` XML; per-agenda rows in `agendas[]`                                                                                                                                                                                                                  |
| NSE shareholding XBRL  | `/corporate-share-holdings-master` rows carry `xbrl` (`in-bse-shp` XML, ~385 KB) plus `recordId`, revision fields; 16 rows for HNDFDS                                                                                                                                                                                                                                              |
| NSE BRSR XBRL          | `xbrlFile` on `/corporate-bussiness-sustainabilitiy` (`in-capmkt`, ~680 KB, 1,120 facts)                                                                                                                                                                                                                                                                                           |
| NSE governance         | Integrated Filing-Governance rows have both `xbrl` and `ixbrl`                                                                                                                                                                                                                                                                                                                     |
| NSE Reg-30 event XBRL  | **Exposed (corrected 2026-09-30)** via `/XBRL-announcements` (`index=equities\|sme`) for director/KMP/SMP/auditor/RTA changes and resignations. The `/corporate-announcements` feed still shows `hasXbrl: true` with only a PDF link, which is what misled the first probe. All other event kinds use BSE `GetCorXbrlDetails_ng/w`, else PDF fallback                              |
| Result-file families   | Family is in the NSE URL: `INTEGRATED_FILING_INDAS`, `_BANKING`, `_LI` (life insurance), `_NBFC_INDAS`; BSE mirrors with `Integrated_Finance_Ind_As` / `_NBFC`. All `in-capmkt` but different element sets (bank 93 facts, life insurer 244, NBFC 71, Ind-AS 75–97). General-insurance family name not yet seen                                                                    |
| **BSE vs NSE values**  | Hindustan Foods Q1 FY27 (scrip 519126): standalone 69/69 and consolidated 43/43 facts identical (tolerance 0.01%). with the Phase 1 parser BSE has 69 numeric facts vs NSE 70; the only NSE-only fact is `OtherComprehensiveIncome` (likely nil in the BSE rendering). Logged as a MISSING_FIELD check                                                                             |
| BSE scrip ≠ NSE symbol | Needs a symbol→scrip map (my first compare used the wrong scrip: 540797 is Shalby, 541336 is IndoStar). Source: our company master / BSE search                                                                                                                                                                                                                                    |
| MCA annual XBRL        | **Not verified.** Web search suggests MCA21 public documents sit behind login/fee/CAPTCHA with no public API; I could not open the page to confirm. Automating that would mean bypassing CAPTCHA/login, which I will not do. Proposal: cover annual/half-year statements via the exchange-filed annual results XBRL (already in scope) and treat MCA as manual-only. Needs your OK |

## 3. Filing-type catalogue (what "exhaustive" means)

| Filing type                                                      | NSE source                                | BSE source                                  | Format                             | Feeds                                                         |
| ---------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------- | ---------------------------------- | ------------------------------------------------------------- |
| Financial results (Integrated)                                   | `/integrated-filing-results` (Financials) | `Corp_FinanceResult_ng_new/w`               | XBRL + PDF                         | quarterly-result-extractor → quarterly-result-analysis        |
| Financial results (legacy / history)                             | `/corporates-financial-results`           | same endpoint, history to FY2017-18         | XBRL / iXBRL                       | prior-period comparatives (QoQ, YoY)                          |
| Governance (Integrated)                                          | `/integrated-filing-results` (Governance) | `GetCorXbrlDetails_ng/w` (governance flags) | XBRL                               | management_change, governance flags                           |
| Shareholding pattern                                             | `/corporate-share-holdings-master`        | `GetCorXbrlDetails_ng/w`                    | JSON + XBRL                        | announcement-insights `shareholding_change`, watchlist skills |
| Insider trading (PIT)                                            | `/corporates-pit-gg`                      | `InsiderTrade15/w` and XBRL category        | XBRL                               | dealsdigest, announcement-insights                            |
| SAST Reg 29/31/10                                                | `/corporate-sast-reg29`                   | `AnnSubCategoryGetData/w`                   | JSON + PDF                         | announcement-insights, dealsdigest                            |
| BRSR                                                             | `/corporate-bussiness-sustainabilitiy`    | `GetCorXbrlDetails_ng/w`                    | XBRL                               | annual-report-analysis, governance                            |
| Voting results                                                   | endpoint TBD (Phase 0)                    | `GetCorXbrlDetails_ng/w`                    | XBRL                               | governance                                                    |
| Reg-30 events (order wins, credit ratings, board outcomes, etc.) | `/XBRL-announcements` (NSE, 3 kinds)      | `GetCorXbrlDetails_ng/w` categories         | XBRL (NSE, then BSE); PDF fallback | announcement-insights, rating and order skills                |
| Annual financial statements                                      | MCA portal (access TBD, Phase 0)          | n/a                                         | XBRL                               | annual-report-analysis                                        |
| Decks, transcripts, annual-report narrative                      | announcements feed                        | announcements                               | PDF only                           | unchanged; PDF/OCR track (see §12)                            |

**Fallback rule (applies to every row and both exchanges):** resolver order is
NSE XBRL → BSE XBRL → PDF, decided per period and per statement. If a BSE
endpoint fails, returns empty or changes shape, the script records the issue
(`ENDPOINT_CHANGE` or `MISSING_FILING`) and falls back to the existing PDF
handling automatically. BSE never blocks a run.

"All filing types" therefore means every type above marked XBRL or structured.
The PDF-only types are explicitly listed so nothing is silently assumed covered.

## 4. Architecture

```
NseClient / BseClient (new methods, typed, documented)
        │  raw XBRL XML + filing metadata
        ▼
xbrl module (new, packages/jobs-runtime/lib/xbrl/)
  fetch → parse (generic, element+context based) → keep ALL facts → normalise
        │
        ├── filing store: data/cache/xbrl/<sha>.json via db.js   (raw facts + provenance)
        ├── period assembler: current + QoQ + YoY (+ YTD/FY), standalone vs consolidated
        ├── validators: sum checks, unit/sign checks, NSE-vs-BSE reconcile
        └── issue log: data/xbrl-issues (JSONL via db.js) + generated report
        │
        ▼
Adapters → emit EXACTLY the shapes existing consumers already take
  • lineData/context  → stock-api/src/analyzers/incomeStatementSignals.js
  • BS / CF objects   → balanceSheetSignals.js, cashflowSignals.js
  • headline period snapshots → compute_headline_financials.js
        │
        ▼
Resolver (per period, per statement): XBRL ok? use it : fall back to PDF path
  every value tagged source = xbrl-nse | xbrl-bse | pdf
```

Key decisions:

- **Generic parser, not a hand-maintained map.** Keep every fact (element,
  context, unit, decimals, value) so no field is dropped; a curated mapping
  layer sits on top. Unmapped elements are reported, never discarded — this
  is what makes support "exhaustive" and what the existing parser lacks.
- **Adapters reuse existing consumers.** The signal analyzers, headline
  snapshot and DTOs do not change; only their input source does. That limits
  regression risk and keeps the PDF path a drop-in fallback.
- **Provenance everywhere.** Each period carries `source`, filing IDs, broadcast
  time and revision. `quarterly-result-analysis` shows it and downgrades
  confidence when any period came from PDF.
- **Standalone vs consolidated:** prefer consolidated when both exist and log
  the choice; never mix bases across periods (a mixed-basis YoY is an issue).
- **Revisions:** latest revision wins, prior versions kept in the store.
- **Exchange merge:** same filing on NSE and BSE is matched on
  (company, period end, basis); values must agree within rounding, otherwise an
  `EXCHANGE_DISAGREE` issue is raised and NSE is used unless it fails validation.

## 5. Prior-period handling (quarterly-result-analysis requirement)

Quarterly XBRL carries only the current period, so for a target quarter Q the
assembler fetches the XBRL filings for **Q-1 (QoQ), Q-4 (YoY)** and, when
present, the YTD/full-year filing, then builds the same three-column input the
PDF path produces.

- Sources by age: Integrated Filing endpoint for recent quarters (8 by default,
  up to 12); the legacy results endpoint for older ones — **risk R1** below.
- If any prior period is missing or fails validation, only **that period** falls
  back to the PDF comparative columns; the others stay XBRL.
- Restatement guard: when the PDF is read anyway (narrative step), a cheap
  script compares the PDF's comparative column to the XBRL-derived prior
  period and logs `RESTATED_COMPARATIVE` on mismatch.

## 6. Narrative from the PDF (one-offs, auditor text, notes)

XBRL gives numbers, not explanations. Still read from the result PDF:

1. Script locates the pages holding the notes to results and the limited-review /
   audit report (`pdftotext -layout` page ranges; heading heuristics).
2. Agent extracts only: exceptional / one-off explanations, auditor
   qualifications and emphasis-of-matter text, segment commentary when XBRL has
   none — verbatim quote plus page for each item.
3. Existing quote verification (`verifyExtract` pattern) checks every quote
   against the page text.
4. Text is simpler than tables, so this is a small, cheap-agent job.

## 7. Skill integration map

| Skill / job                                                                                                                                                                       | Change                                                                                                                   | Phase |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----- |
| `quarterly-result-extractor`                                                                                                                                                      | Steps 1.5–2.6 become XBRL-first via adapters; PDF scripts stay as fallback; manifest records source per statement/period | 2     |
| `quarterly-result-analysis`                                                                                                                                                       | Reads provenance; shows data source and any fallback in the report; `--statement` modes use the same inputs              | 2     |
| `document-preprocessor` (`result` profile)                                                                                                                                        | Numbers from XBRL; agent only does narrative; XBRL becomes calibration ground truth for the gate                         | 3     |
| `announcement-insights`                                                                                                                                                           | Structured facts for PIT, SAST, shareholding, governance categories injected before the PDF read                         | 3     |
| `pead-surprise-ranker`, `pre-pead-scanner`, `consecutive-filings-diff`, `peer-comparison`, `forensic-accounting`, `watchlist-insights`, `post-close-scan-insights`, `dealsdigest` | audit first: list every place a result/PDF number is parsed, then switch to the shared XBRL module                       | 4     |
| `annual-report-analysis`                                                                                                                                                          | BRSR XBRL fields; annual RPT amounts where present                                                                       | 4     |

## 8. Testing and validation plan

**Sample design (revised per your feedback).** Source is our own DB, not
Stockscans: `data/companies.json` (sector, industry) joined with the last 30 days
of `events-2026.json` and `reports.json` (daily-gainers, announcement-scans,
rerating and similar), so the sample is the companies we actually read.

- **Stage 1:** 2 companies per sector, from two different industries, ranked by
  appearances since 2026-08-30. Already computed: 104 companies over 64 sectors
  (`sample_stage1.json`). 24 sectors lack two distinct frequent industries and are
  filled from the DB with less-frequent names in different industries.
- **Stage 2:** 3–4 companies per taxonomy family (manufacturing/services, banks,
  NBFC/HFC, insurance, power/utilities, real estate, IT, pharma, small-cap tail).
- Stockscans `scanMetadata()`/`runScan()` stays only as a cross-check of DB
  industry labels (some DB labels look inconsistent, e.g. RAYMOND).
- Batched, cached, resumable, about 1 request per second.

**Per company checks (last 9 quarters, both exchanges):**

1. Every expected filing exists on NSE and on BSE; list every missing one.
2. Every mapped field present and non-null; list every missing field and every
   unmapped element.
3. Unit, sign and scale checks; sum checks (revenue + other income = total income,
   expenses sum, PBT − tax = PAT, BS balances, cash flow reconciles to cash).
4. NSE-vs-BSE agreement within rounding.
5. XBRL-vs-PDF agreement on a stratified sample using the existing PDF parser
   (also validates the fallback path).
6. XBRL-vs-Screener quarterly numbers on the full set (cheap independent check).
7. Prior-period assembly: QoQ and YoY inputs complete, same basis, restatement
   flags.
8. Fallback tests: force-remove XBRL for one period and confirm the PDF path
   produces the same DTO shape; unit tests plus fixtures in `__tests__/`.
9. End-to-end: run `quarterly-result-extractor` → `quarterly-result-analysis`
   on a sample from each bucket and diff against the PDF-only output.

**Acceptance gates (proposed):** ≥99% numeric agreement with PDF on the sample,
zero sign flips, every failure logged, no silent drops. Thresholds are yours to
change.

## 9. Issue log and reporting

Every anomaly is a record: `{company, period, filingType, exchange, category,
severity, field?, detail, detectedAt}`. Categories: `MISSING_FILING`,
`MISSING_FIELD`, `UNMAPPED_ELEMENT`, `UNIT`, `SIGN`, `SUM_CHECK`,
`EXCHANGE_DISAGREE`, `RESTATED_COMPARATIVE`, `REVISION`, `PARSE_ERROR`,
`ENDPOINT_CHANGE`, `LATENCY`, `FALLBACK_USED`. Severity: **major** (blocks or
corrupts a number), **minor** (cosmetic or recoverable), **info**.

Deliverables: the JSONL log via `db.js`, plus a generated report per test run
listing every issue grouped by severity, industry and filing type — including a
"missing filings" table and a "missing fields" table. Nothing is left out for
brevity.

## 10. Phases

- **Phase 0 (DONE) — spikes (DONE 2026-09-30, see §2a).** Was: add a
  `BseClient` XBRL method, NSE shareholding XBRL link, NSE voting-results and
  Reg-30 XBRL, MCA annual-statement access, NSE legacy history depth, BSE-vs-NSE value comparison; a bank, an NBFC and an insurer sample;
  platform-reuse re-check. Output: updated schema docs and a go/no-go per filing
  type.
- **Phase 1 (DONE) — core module:** clients, generic parser, store, assembler,
  validators, issue log, unit tests. Fix `xbrlParser.js` gaps by replacing it
  with the shared module (leaving the old API surface working).
- **Phase 2 (DONE) — results:** adapters, resolver with fallback, integrate
  `quarterly-result-extractor` and `quarterly-result-analysis`, narrative step.
- **Phase 3 (DONE, with gaps) — announcements and preprocessing:** PIT, shareholding,
  voting, governance via `packages/jobs-runtime/xbrlFilings.js` (NSE then BSE then PDF)
  wired into `announcement-insights` Step 1.5; `result` XBRL pre-fill in
  `document-preprocessor`. Gaps: SAST (Reg 29) (Reg-30 event XBRL is now DONE, see follow-up below; original note: BSE flags 24, 14,
  31-33 ...) are not wired yet; BSE fallback is unit-tested with fakes only, not live.
- **Phase 4 (DONE, with gaps) — remaining skills and BRSR:** BRSR parser (`xbrlFilings.js brsr`, NSE then BSE); signal skills' sourcing rule switched to XBRL first; annual-report-analysis wired to BRSR/governance/result XBRL; manifest updated. Gaps: MCA annual XBRL is manual-only (decided), Reg-30 event XBRL (done 2026-09-30), banks/insurers (done), legacy `screener-api` `xbrlParser.js` only got a typo fix (its map still lacks inventory changes, exceptional items, segments).
- **Phase 5 (DONE; report in `docs/XBRL_VALIDATION_REPORT.md`) — large-scale validation run** across the industry sample and the
  full issue report. (Smaller validation runs happen inside every phase.)

Each phase ends with `yarn quality` and a diff left unstaged.

## 11. Risks and open questions

- **R1 — history depth (largely resolved).** BSE serves results XBRL back to
  FY2017-18 (one scrip checked), so YoY and QoQ comparatives can come from BSE
  even where NSE's legacy index is stale. Depth is per company and must be
  measured across the sample; gaps fall back to PDF.
- **R2 — BSE packaging.** Mixed iXBRL/XML, `in-capmkt` vs `in-bse-fin`, `scale`
  and `sign` attributes, multiple contexts per element, browser UA + Referer
  needed. Parser must handle all; unrecognised files fall back to PDF.
- **R7 — company DB quality.** 53 `companies.json.corrupt.*` backups exist and
  some sector/industry labels look wrong; sampling reads the live file and logs
  label mismatches.
- **R3 — bank/NBFC/insurance taxonomies** differ; mapping effort could be
  larger than for manufacturing.
- **R4 — companies file wrong or late XBRL;** validators and the fallback exist
  for this.
- **R5 — rate limits** on NSE/BSE; mitigated by caching and batching.
- **R6 — SME and BSE-only listings** may have different coverage.

Decisions needed from you:

1. Standalone vs consolidated default (proposal: consolidated, log the choice). - **Decided: go ahead (consolidated default).**
2. Sample size for the large run (proposal: 1 per industry, then 5–10 for the
   taxonomy-family buckets). - **Decided: 2 per sector (different industries), then 3–4 per taxonomy family; drawn from our DB.**
3. Acceptance thresholds in §8. - **Decided: as proposed.**
4. Whether v1 includes BRSR and voting results or defers them. - **Decided: include everything.**
5. Whether MCA annual-statement XBRL stays out of scope. - **Decided: include everything (MCA annual XBRL in scope).**

## 12. Parked task (do later, as requested): PDF OCR / local-model research

Keep for after XBRL lands. Starting material from 2026-09-30 research: layered
routing (LiteParse / Docling for text-layer PDFs, Docling VLM pipeline with
Granite-Docling and PaddleOCR-VL-1.6 / GLM-OCR / dots.ocr for scans and tables,
small local model for schema filling with LangExtract-style source grounding);
Mac speed is the binding constraint (about 37–53 s/page reported on an M5 Pro);
XBRL becomes free ground truth for scoring extractors on results and PIT;
remaining PDF-only types are SAST, order wins, ratings, decks, transcripts and
annual reports. Note the tension with the "no model calls from scripts" rule:
needs an explicit decision before any local-model step is built.

- **Follow-up (DONE, 2026-09-30):** bank, life and general-insurance adapters; BSE legacy `.xml` mapping; stored
  `bseScripCode` (`lib/xbrl/scrip.js`, `scripts/xbrl/backfill_bse_scrip.js`); MCA annual XBRL stays manual-only
  (annual figures come from exchange-filed annual-results XBRL). See `docs/XBRL_VALIDATION_REPORT.md` section 7.

**Follow-up (2026-09-30, DONE):** Reg-30 event XBRL (`lib/xbrl/events.js`, `eventsFetch.js`, CLI `xbrlFilings.js events`,
20 kinds, NSE-first for 3 kinds then BSE); `bseScripCode` backfill applied and hooked into `companyMasterSync`; NSE SME
index fallback; full-database validation (see `XBRL_VALIDATION_REPORT.md` sections 8-9). Open: ~10 filer-side exchange
disagreements, BSE flags 4/9/11/16-21/37-39 unmapped, BSE event XBRL has no NSE cross-check, and a full re-run after the
section-9 fixes has not been done.
