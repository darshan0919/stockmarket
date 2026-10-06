# PDF / OCR extraction plan

Status: **DRAFT v2 for review, 2026-09-30 (adds the benchmark metric order and the dataset gate). Nothing built yet.** Follows `XBRL_INTEGRATION_PLAN.md`; PDF is the
per-period fallback behind XBRL (decided 2026-09-30) and the only source for everything XBRL does not carry.

## 1. Goal and non-goals

**Goal:** cut the tokens spent on low-effort reading of filings (text, tables, SAST trades, order book,
transcripts) by moving transcription to scripts and, where needed, a **locally hosted** open model, without
lowering accuracy. The agent stays for judgement only (classification, insight, synthesis).

**Non-goals:** no LLM provider API keys anywhere (standing rule); no change to the XBRL paths; no promotion of
any profile without passing the existing calibration gate.

## 2. What we already know (reused, with sources)

### 2.1 Where the PDF path is actually needed (measured this session)

| Need                                        | Evidence                                                                                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Result PDFs when XBRL is missing            | Full run, 4,211 NSE ids: 3,464 current-quarter XBRL OK; at least 38 active names have none (18 SME, 20 equities), up to 61 counting unverified ids. `XBRL_VALIDATION_REPORT.md` §8-9 |
| Result PDFs in the first hours after filing | XBRL lags the PDF announcement: p50 70 min, p90 294 min, max 1,418 min (n=40; one corrupt timestamp dropped). `$HOME/scratch/lag40.json`. Post-close scans run inside that window    |
| Documents XBRL never carries                | Transcripts, investor PPTs, annual reports, SAST (Reg 29), order announcements. BSE event flags 4, 9, 11, 16-21, 37-39 are unmapped; NSE resignation rows attach a ZIP of PDFs       |

**Implication:** results are only about 1.7% of companies per quarter, so the big token saving is NOT result PDFs.
It is the heavy non-XBRL documents. Results are still the right place to start because they are the one doc type
where we have free ground truth (2.2).

### 2.2 Free labelled data from the XBRL work

For every company with both a result PDF and XBRL for the same period, XBRL is a ground-truth label for the PDF.
That removes the "needs a flagship read" bottleneck in `CALIBRATION_RUNBOOK.md` for the `result` profile and lets
us score at hundreds of documents, not 15. `scripts/xbrl/compare_pdf.js` already does this for one company
(HNDFDS). Caveats: XBRL has filer errors (the 10 exchange-disagreement companies: IGIL 10x, FIVESTAR 100,000x,
RAJESHEXPO 182x), so exclude any company with a major `EXCHANGE_DISAGREE` or `SUM_CHECK` from the truth set.
Companies with XBRL are the cleaner filers, so accuracy measured there is an upper bound.

### 2.3 Verification pieces that transfer directly

- **Arithmetic identities** (`resultsAdapter.sumChecks`): revenue+other=total income, PBT-tax=PAT, assets=E+L,
  cash-flow chain. Apply to PDF-extracted numbers. The XBRL run showed they catch both mapping bugs and filer errors.
- **Power-of-ten detector** (`resultsResolver`, new): units/scale errors are real in filings. A PDF extractor must
  read and state the unit (Lakhs / Millions / Crores) before converting.
- **Wrong-entity and wrong-period guards.** XBRL showed a live search matched another company (NRL to GNRL, MCL to
  Radha Madhav) and filers upload files for the wrong period (SURAJEST, AARTIDRUGS, MMTC, PULZ). The PDF path needs
  the same document-identity check: company name, period end, standalone vs consolidated.
- **Issue log** categories (MISSING_FILING, FALLBACK_USED, EXCHANGE_DISAGREE, SUM_CHECK, PARSE_ERROR): reuse, do not invent.
- **Operational lessons:** exchange hosts throttle above ~30 parallel requests (used 24-28); background jobs die
  when a tool call ends, so run foreground chunks of at most ~170 s with `--resume`; connected-folder deletes are
  blocked, so overwrite files.

### 2.4 Existing PDF stack and its known failures

- `cloud-utils/src/pdfText.js`: text layer via `pdf-parse`, then `pdftoppm` + `tesseract` for scanned pages, with
  hard timeouts (25 s render, 20 s per page, 90 s overall) and explicit `truncated` / `ocrFailed` flags.
- `docExtracts` + `verifyExtract` (L1 quote-in-source check) + `preprocessCalibrate` gate (15 docs, at least 98%
  numeric agreement, zero sign flips) + `document-preprocessor` skill with 5 profiles (agent transcribes, script verifies).
- Known failures to design against (from project memory): the 8,000-char truncation that silently emptied heavy
  docs; `annual_report` fails calibration (RPT / remuneration returned empty when a cross-reference was found before
  the numeric table; unit mixing Lakhs/Millions/Crores; standalone vs consolidated); scanned SAST PDFs hit
  `ocrFailed` (2026-08-24: four filings marked routine unread, one a Rs 979 cr pledge revoke).

### 2.5 What the open-model landscape says (external, unverified on our documents)

Candidates named in current roundups: PaddleOCR-VL (0.9B, Apache 2.0), MinerU 2.5 (1.2B), GLM-OCR (0.9B, MIT),
dots.ocr / dots.mocr (3B), Chandra OCR 2, olmOCR-2 (7B), plus lightweight CPU-capable PP-OCR and EasyOCR with no
native table parsing ([Roboflow roundup](https://blog.roboflow.com/best-open-source-ocr-models/)). Scores there
are OmniDocBench / olmOCR-Bench on generic documents, not Indian filings.
The one hands-on comparison found: on a dense numeric table olmOCR-2 (7B) made **silent digit errors** (digit
substitution, "84-89" read as "84.89") while PaddleOCR-VL (1B) matched every value; speed was about 37-53 s per page on a 64 GB Apple M5 Pro, one 9-page document
([CodeCut](https://codecut.ai/olmocr2-vs-paddleocr-vl/)).
**Two consequences:** (a) a VLM must never be trusted on numbers without arithmetic and cross-source
verification; (b) at tens of seconds per page, whole annual reports (hundreds of pages) cannot go through a VLM,
so models must run only on the residual pages that cheaper tiers fail on.

### 2.6 What the owner's hardware implies (MacBook Air M4, 16 GB)

Facts from third-party guides (not our measurements; to be replaced by P2 results):

- About 9-12 GB of the 16 GB is usable for a model once macOS and apps are open; one guide plans for about 9 GB with a
  browser and editor running, and calls models above about 14B at Q4 "a gamble" ([ModelFit](https://modelfit.io/blog/best-llm-macbook-air-m4-16gb/)).
  Generation speed quoted: 15-22 tokens/s for 8-9B models (same source).
- The Air is fanless. One source reports throttling after roughly 5-10 minutes of sustained load, another after longer
  sessions, and stresses it depends on model, context, room temperature and chassis
  ([Ayodesk](https://ayodesk.com/blog/macbook-air-m4-thermal-throttling-during-sustained-local-llm/)). No figure here is measured on this machine.

Consequences for the design:

1. **Candidate size cap:** the 0.9B OCR/VLM models (PaddleOCR-VL, GLM-OCR) fit easily; 3B is comfortable; a 7B such as
   olmOCR-2 needs 4-bit quantization and leaves little headroom. Models above about 9B are out of scope for Tier 3.
2. **Fair `timeTaken`:** because throttling changes speed mid-run, candidates are run **interleaved** (round-robin over
   the same documents) with cool-down gaps, and every record stores wall-clock position in the run so drift is visible.
   Sequential "candidate A then candidate B" would penalise whichever runs second.
3. **Execution constraint (a real blocker for Tier 3 benchmarking only):** the agent's shell runs in a Linux VM
   (aarch64, about 3 GB RAM, no GPU / Metal access), not natively on the Mac, so **it cannot run Tier 3 models**. Dataset
   building, Tier 1 parsers, verification and scoring all run in the VM. For Tier 3 the agent writes the benchmark
   runner; the owner runs it natively on the Mac (one command) and the results JSONL lands in the repo for the agent to
   score. Until then Tier 3 is designed and tested only with mocks.
4. **Whole-document VLM is out** for annual reports (hundreds of pages at tens of seconds per page); residual pages only.

## 3. Architecture: cheapest tier that passes verification

| Tier | What                                                                                                         | Runs on                           | Used when                                     |
| ---- | ------------------------------------------------------------------------------------------------------------ | --------------------------------- | --------------------------------------------- |
| 0    | XBRL (done)                                                                                                  | script                            | always first; PDF is per-period fallback      |
| 1    | Text-layer parse: `pdftotext -layout` / pdfplumber tables, fixed-label parsers for SEBI Reg-33 result tables | script                            | PDF has a text layer (most filings)           |
| 2    | OCR with layout (Tesseract now; benchmark PaddleOCR / others)                                                | script                            | scanned pages only                            |
| 3    | Local VLM or LLM for residual tables and slides, constrained JSON                                            | local model on the user's machine | Tier 1/2 fail verification                    |
| 4    | Agent (Claude in a job)                                                                                      | agent                             | judgement only: classify, explain, synthesise |

**Router** (`extract_pdf`): classify each page (text / scanned / hybrid), run Tier 1, verify, escalate only failing
pages. Every output carries `{tier, page, unit, basis, verified: [L0..L3], issues}`.

**Verification ladder:** L0 document identity (company, period, basis) - L1 quote in source (exists) - L2
arithmetic identities - L3 cross-source vs XBRL when it arrives (PDF value is marked `provisional` and XBRL
supersedes it; disagreements are logged, never silently overwritten) - L4 calibration gate (exists).

## 3b. Benchmark contract (set by the owner, 2026-09-30)

Every candidate (tier, parser, OCR engine, local model, prompt) is scored on one corpus with this priority:

1. **`accuracy` (primary).** Per field: match after unit normalisation, within printed rounding (at most 0.5% or
   one unit of the last printed digit). Reported as field accuracy, cell accuracy for tables, and document-level
   "all headline fields right". **Sign flips and power-of-ten errors are counted separately and are a hard gate
   (must be zero).** Abstaining is reported as its own column (coverage) and is never scored as correct: a skipped
   field is better than a confident wrong one.
2. **`llmTokenUsage` (secondary).** Input and output tokens of every LLM call needed per document, recorded through the
   existing keyed `tokenUsageTracker` (job/skill name passed explicitly). Stored as two numbers:
   `agent` (billed Claude tokens) and `local` (tokens through a local model). Scripts-only tiers score 0 and 0.
3. **`timeTaken` (third).** Wall-clock per document (p50 / p95) and per page, with the hardware id recorded, since
   CPU-only and GPU numbers are not comparable.

**Ranking rule:** a candidate is _eligible_ only if it clears the accuracy gate (at least 98% numeric agreement,
zero sign flips) on the frozen test split. Among eligible candidates, lower `llmTokenUsage` wins; candidates within
noise of each other on that (under 5%) are ranked by `timeTaken`. Two accuracies closer than the bootstrap 95%
confidence interval count as a tie, not a win, otherwise a pure lexicographic order would pick a 0.1-point-better
model that costs 10x more on the second metric.
`llmTokenUsage` is ranked on billed `agent` tokens only (decided); `local` is recorded beside it, not ranked.

Each benchmark run writes one record `{runId, candidate, version, promptHash, hardwareId, docId, tier, accuracy
fields, sign/pow10 errors, abstained, llmTokenUsage{agent,local}, timeTaken{ms,pages}}` to a per-run JSONL (keyed by
`runId`, never a shared "current run" file), so concurrent runs cannot collide.

## 3c. Dataset gate: nothing is tested or trained until the corpus is downloaded and frozen

**Rule:** P1 onward is blocked until `yarn pdf-corpus:verify` passes every bar below. Building the corpus is P0.

**Stratification axes (each document carries all of them in its manifest row):**

| Axis              | Values / target                                                                                                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filing type       | results (Ind AS, bank, NBFC, general and life insurer, SME, half-yearly), transcript, investor PPT, annual report, SAST (Reg 29), order announcement, board outcome, credit rating, KMP / auditor change, other Reg-30 |
| Sector / industry | all 84 sectors and 405 industries present in the universe. At least 20 documents per sector for the 42 sectors that have 20+ companies, and every smaller sector represented                                           |
| Filing form       | text-layer, scanned, hybrid; deliberately **oversampled** for scanned (the known failure zone)                                                                                                                         |
| Size and era      | large / mid / small / micro by market cap; at least 8 quarters so format drift is in the data                                                                                                                          |
| Source            | NSE and BSE copies where both exist; consolidated and standalone                                                                                                                                                       |
| Truth available   | XBRL-backed (results) vs human-labelled gold set (everything else)                                                                                                                                                     |

**Proposed minimum sizes (to confirm; sized for a 98% gate to be statistically meaningful, about 200 documents per
cell that must be proven separately):**

| Set                                            | Documents                                                              | Label source                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Result PDFs, XBRL truth                        | 2,000+, all 6 families, at least 25 per sector where available         | XBRL (excluding any company with a major EXCHANGE_DISAGREE or SUM_CHECK) |
| Scanned / hybrid oversample                    | 300+ across results, SAST, orders                                      | gold set                                                                 |
| SAST / orders / board outcomes / ratings / KMP | 300 each                                                               | gold set                                                                 |
| Investor PPTs                                  | 300                                                                    | gold set                                                                 |
| Annual reports                                 | 150 (2-4 GB at 240K-987K chars each; size to be measured, not assumed) | gold set, field-level                                                    |
| Transcripts                                    | 200 (text layer; the task is extraction of claims, not OCR)            | gold set                                                                 |

**The real bottleneck is labels, not downloads.** Only results have free truth. For the rest, a gold set of
roughly 150-250 documents must be labelled. Proposed method to keep human time small: two independent extractions
(different tiers) and a person adjudicates only the fields where they disagree or an identity check fails.
Budget this before promising the non-result profiles.

**Splits:** by **company** (not by document) and frozen by period: train / dev / **test**, with a test split touched only for
final reporting. Splitting by document would leak the same company's layout into both sides and overstate accuracy.

**Storage and manifest:** `data/pdf-corpus/<type>/<exchange>/<symbol>_<period>_<sha8>.pdf` (git-ignored and excluded from
`data:push`/`pull`/`status` by `packages/jobs-runtime/lib/dataSyncPolicy.js`: study/testing/training material only), plus `manifest.jsonl` with `{docId, sha256, sourceUrl, exchange, type, sector, industry, sizeBucket,
period, basis, form, pages, bytes, truthRef, split, fetchedAt}`. Current headroom: 78 GB free in the connected folder
against 24 GB of existing data; expected corpus 15-25 GB, verify after a 100-document size probe (the two result PDFs seen
so far were 2.6 and 4.6 MB, too few to extrapolate).
**Acquisition:** NSE integrated-filing rows already carry the PDF link (`pdf_attach`) next to the XBRL link; BSE rows
for the other types; Stockscans announcements scoped by the 5-value `announcementType` enum. Throttle at most 24-28
concurrent requests, foreground chunks of at most 170 s with `--resume`, dedupe by sha256, record every failed
download as an issue (MISSING_FILING) instead of dropping it. **Sector source (decided 2026-09-30: use `data/cache/company-master.json`).** It is built by `companyMasterSync`
from Stockscans scans, Kite instruments and `companies.json`; 12,291 rows, 3,689 with sector and industry
(generated 2026-09-29). Checked against the 4,211-id validation universe: it matches 2,462 ids by `nseTicker`, gives a
sector for 1,919, and **agrees with our existing label on 1,893 of the 1,894 ids both label** (the one conflict is
MCL, the symbol the XBRL work already found ambiguous). So it is reliable, but it adds only 25 of the 1,195 ids
we had as sector `na`: both draw on the same Stockscans source.
**Result: 1,170 of 4,211 ids (28%) stay unlabelled**, mostly SME-platform and micro-cap names (for example TEJASSVI,
MITSHI, KAPILRAJ, PRATIKSH), and 1,749 universe ids are not in the master at all (renamed or stale symbols).
Plan: (a) sample them as an explicit `unclassified` stratum, since SME and micro-caps are exactly where filings are
poorest and must be in the corpus; (b) try NSE `quote-equity` `industryInfo` as a fill source for them. **Untested:**
a probe of that endpoint timed out twice on 2026-09-30, so nothing is assumed about its coverage;
(c) never guess a sector from the company name.

**Verify bars (`pdf-corpus:verify`):** every cell above at or over its minimum; zero duplicate sha256; every PDF opens
and has a page count; every XBRL-backed row has its truth file and passes the exclusion rule; split files are disjoint by company; manifest
row count equals files on disk. The test split is hashed and locked.

## 4. Phases, each with a measurable exit

| Phase                                                                 | Work                                                                                                                                                                                                                                                                                                         | Exit criterion                                                                                                                                                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0 Corpus + baseline (days, dominated by downloads and labelling)** | (a) Token spend per doc type from `tokenUsageTracker` to rank targets by real cost. (b) Build and verify the corpus of 3c, with manifest, splits and gold labels. (c) Classify text-layer vs scanned vs hybrid per doc type, time per page. (d) Score today's pipeline on the dev split with the 3b contract | `pdf-corpus:verify` passes; a table per doc type: tokens/day, % scanned, current accuracy / `llmTokenUsage` / `timeTaken`. **Decision gate: no testing or training before this, and confirm priorities** |
| **P1 Result-table parser**                                            | Tier 1 deterministic parser plus L0/L2 verification, scored against XBRL truth                                                                                                                                                                                                                               | At least 98% numeric agreement, zero sign flips, on at least 200 docs (stricter sample than the runbook's 15)                                                                                            |
| **P2 OCR benchmark**                                                  | Tesseract vs 2-3 candidates on the scanned subset, on the user's hardware; metric is field accuracy after verification, not generic CER                                                                                                                                                                      | Pick one; record pages/min and failure types                                                                                                                                                             |
| **P3 Local model for residual**                                       | Tier 3 on failing pages only; JSON schema; retry and escalate rules                                                                                                                                                                                                                                          | Residual accuracy at least 98% after L2/L3, or the tier is not enabled                                                                                                                                   |
| **P4 Integrate**                                                      | Router wired under `quarterly-result-extractor` fallback, `document-preprocessor` profiles, issue log, provisional-to-XBRL supersede                                                                                                                                                                         | Existing tests plus new ones; nothing served until the calibration gate passes per profile                                                                                                               |
| **P5 Scale and automate**                                             | Weekly eval job (resume, chunked), drift alarm on accuracy, token-saved report                                                                                                                                                                                                                               | Dashboard number: tokens saved per week, accuracy per tier                                                                                                                                               |

Order after results: scanned announcements (SAST, orders; highest stakes) - transcripts (clean text, low OCR need) -
PPTs (slides, charts) - annual reports (largest, currently failing calibration). P0 may reorder these by measured tokens.

## 5. What could be wrong with this plan

1. **Wrong target.** Results are about 1.7% of companies; if P0 shows most tokens go to ARs/PPTs/transcripts, the
   result parser is an eval harness more than a saving. Hence P0 first and a decision gate.
2. **Truth-set bias.** XBRL-available companies are cleaner filers and the PDFs we can score are the easy ones;
   accuracy there overstates accuracy on the 38+ no-XBRL names. Mitigation: hand-check a sample of no-XBRL PDFs.
3. **Silent numeric errors** are the dominant risk (see 2.5). A plausible wrong number is worse than a skip.
   Mitigation: L2 identities; anything that fails is `unverified`, never served.
4. **Hardware unknown.** This cloud workspace has 4 CPUs, 3 GB RAM, aarch64 and no GPU, so local VLMs cannot run
   here; they would run on the user's own machine, specs not yet known. Speeds in 2.5 are from one 64 GB Apple M5
   Pro, one document.
5. **"No API keys" rule vs a local model server.** A local inference endpoint called by a script is not a provider
   API key, but it is a script calling a model. Needs an explicit ruling.
6. **Benchmarks are generic** (OmniDocBench / olmOCR-Bench), from blog roundups; we rely only on our own corpus.
7. **Overfitting the benchmark.** Training or prompt-tuning on documents from companies that also appear in the
   test split would inflate accuracy. Mitigation: company-level splits, locked test set, one final report run.
   Also a corpus of mostly large, clean filers would hide failures on micro-caps and SME filings; the strata above
   force those in.
8. **Gold-set labels can be wrong too.** Two-extractor agreement plus adjudication reduces but does not remove this;
   sample 10% of adjudicated labels for a second human check.
9. **Small lag sample** (n=40, one corrupt timestamp). Re-measure in P0 before promising a "provisional window".
10. **Scope creep:** tables in ARs/PPTs are a harder problem than result tables; do not promise them from P1 results.

## 6. Decisions (answered by the owner, 2026-09-30)

| #   | Decision                                | Answer                                                     | Consequence                                                                                                                                  |
| --- | --------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Script may call a locally hosted model? | **Yes**                                                    | Tier 3 allowed, no provider key. The standing "no API keys" rule is unchanged; a local endpoint on the owner's machine is not a provider API |
| 2   | Hardware                                | **MacBook Air M4, 16 GB RAM** (rest to be worked out)      | See 2.6: models up to about 9B quantized, fanless so sustained runs throttle, and the agent's shell cannot run them                          |
| 3   | Order                                   | **Truth-first** (results with XBRL truth)                  | P0 builds the result-PDF corpus first                                                                                                        |
| 4   | `llmTokenUsage` basis                   | **Billed agent tokens only**                               | Local-model tokens are logged beside it but never ranked                                                                                     |
| 5   | Dataset minimums and about 15-25 GB     | **Approved**                                               | Downloads start under `data/pdf-corpus/`                                                                                                     |
| 6   | Gold-set labelling                      | **Agent-assisted; owner adjudicates disagreements only**   | As proposed in 3c                                                                                                                            |
| 7   | Sector source                           | **`company-master.json`**, explicit `unclassified` stratum | As in 3c                                                                                                                                     |

## 7. Scale and automate

Weekly resumable eval job (same pattern as `validate_results.js --resume`), a per-tier accuracy ledger, and a
cheap-model-eligible queue: page classification, unit detection and identity checks need no strong model.

## 8. P0 corpus status (2026-10-01): corpus built, gate passing, test split locked

Built with `docs/BULK_FILING_SCAN.md` (listing) -> `pdf-corpus:select-scan` -> `pdf-corpus:download` -> `pdf-corpus:truth` ->
`pdf-corpus:verify`. Order and what each script does: `scripts/pdf-corpus/README.md`. The corpus is study/testing/training
material only: `data:push`/`pull`/`status` skip `data/pdf-corpus/` (`packages/jobs-runtime/lib/dataSyncPolicy.js`).

- **Stored:** 5,903 unique PDFs, about 22 GB. Result 2,099 (1,103 companies, 81 sectors; 409 scanned or hybrid), PPT 300,
  Transcript 200, Annual Report 150, Board Outcome 300, M&A 300, Order 300, Fund Raising 300, KMP 300, Press Release 300,
  Credit Rating 300, Promoter Reg31 801, Insolvency 253. Every stratum minimum of 3c is met.
- **Truth:** 1,984 of the 2,099 Results are paired with XBRL values; 115 periods are not on XBRL (`not-found`, explicit).
- **Splits:** by company, train 820 / dev 178 / test 183 companies. Test split locked in `splits.lock.json` (994 documents);
  `verify` re-checks the lock on every run.
- **Quarantine:** 3 files (2 PDFs poppler cannot open, 1 orphan from an interrupted run) are listed in `quarantine.jsonl`
  and excluded from all counts, because the connected folder does not allow deletes. `download.js` now refuses unreadable PDFs.
- **Result size:** about 6.8 MB per PDF on average; the 15-25 GB estimate held.
- **Scan coverage:** the bulk listing is about 40% complete by unit (Orders and Credit Rating are complete; others cover the
  newest quarters). Enough for every minimum; finishing it only adds diversity (older quarters).
- **P3 build status (2026-10-03):** the router, Tier 3 providers and verifier exist and are tested (62 jest tests, mocks and a local
  mock HTTP server). Dev split, 157 docs, no model: `router-v5` serves 29.3% at 83.2% field accuracy (headline fields 90.8%),
  0 sign flips, 1 power-of-ten error; the whole-document baseline on the same docs served 43.3% at 63.6% with 94 power-of-ten
  errors, so the router trades coverage for correctness. Not eligible yet (needs 98%). Residual for Tier 3: 87 abstained docs
  (48 no table located, 39 unverified) and 24 docs served on the wrong basis. No real model has been run: Tier 3 numbers are
  unmeasured. Runbook, model tags and commands: `docs/LOCAL_MODEL_EXTRACTION.md`.
- **Baseline (`baseline-v0`, today's pipeline = pdftotext layout + OCR-if-empty + `extractIncomeStatement`, dev split, 274 Results):**
  strict field accuracy 6.5%; abstain rate 47%; on found docs 12.2% strict, 41% once units are fixed; 710 power-of-ten
  errors, 0 sign flips; scanned PDFs 0% (100% abstain); p50 40 ms, 0 agent tokens. Main failure: undetected units
  (`unknown`), and many "text" PDFs carry a corrupt embedded OCR layer, so the text/scanned/hybrid classifier is too lenient.
  Run with `node scripts/pdf-corpus/baseline.js --run-id <id>`; summary with `--summarize`.
- **Gold set (non-Result types):** 160 docs, 8 types x 20 (`gold.js select|packets|verify|queue|tiebreak|apply`), 740 fields.
  Pass A (haiku) and pass B (sonnet) labelled independently; every quote is script-checked against the document text. Pass A
  abstained far more, giving 417 disagreements; a third pass C (sonnet) auto-resolved 386 (source `auto-C`), and 16 more
  were settled by manual review against the text (`claude-reviewed`). **Defect found and fixed:** 13 docs (11 big annual
  reports, 2 scanned) had empty text in the packet step, and long annual-report packets cut off before the auditor's report.
  All 20 annual reports plus the 2 scanned docs were relabelled once (source `relabel-R`, pdftotext/tesseract text, quotes
  script-verified), so those 22 docs have a single labeler, not two. **5 fields remain for you:** `gold/adjudicate.md`.
  Caveats: pass C and B share a model family; `total_income` for several annual reports rests on weak unit evidence;
  the "Order" stratum includes regulatory penalty/tax/NCLT orders, which the contract-order schema does not fit.
  Production finding: `pdfToLayoutTextWithMeta(..., { maxChars: Infinity })` returned empty text for 11 annual reports of
  150-590 pages that `pdftotext -layout` reads in full; this needs a look in `cloud-utils/src/pdfText.js`.
- **Still open before P1:** your 5 adjudications, and the Tier 3 runner for your Mac (the VM has no GPU). The decision gate
  in §4 (priorities) applies.
