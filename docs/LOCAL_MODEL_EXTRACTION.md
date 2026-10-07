# Local-model PDF result extraction: how to run the Tier 3 benchmark

Companion to `docs/PDF_OCR_EXTRACTION_PLAN.md` (§3 router, §3b benchmark contract). This is the runbook for the one
step the agent VM cannot do: measure local models on the residual pages. The VM is aarch64, no GPU, about 3 GB RAM;
your M4 Air (16 GB) can run models up to roughly 9 GB (4-bit, about 7B to 14B parameters).

## What exists

| Piece                                                               | Path                                                                  |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Router: Tier 1 text pages, Tier 2 OCR, Tier 3 model, abstain        | `packages/jobs-runtime/lib/pdfExtract/router.js` (`extractResultPdf`) |
| Verification: L1 grounding, L2 identities, field sanity             | `.../verify.js`                                                       |
| Local providers (Ollama, OpenAI-compatible, mock), constrained JSON | `.../tier3.js`                                                        |
| Page ranking, rendering, OCR                                        | `.../pages.js`                                                        |
| Benchmark runner, scorer, report                                    | `scripts/pdf-corpus/{bench,score,report}.js`                          |
| Tests (62, run in `packages/jobs-runtime`: `npx jest pdfExtract`)   | `packages/jobs-runtime/test/pdfExtract*.test.js`                      |

Rules baked in: no provider API keys (a local endpoint on 127.0.0.1 is allowed, plan §6 decision 1); temperature 0;
every number a model returns must occur in the page text it was shown (L1) or it is dropped; a candidate is served only
if its unit is known and its income-statement identities hold with no contradicting identity; otherwise the router abstains.

## One-time setup (Mac)

1. `brew install ollama poppler tesseract` (poppler gives `pdftotext`/`pdftoppm`, tesseract is Tier 2), then `ollama serve`
   (or open the Ollama app). Vision models need Ollama 0.7.0 or newer.
2. Pull the candidates (sizes from the Ollama library pages, checked 2026-10-03):

   | Tag            | Size   | Kind                                             |
   | -------------- | ------ | ------------------------------------------------ |
   | `qwen2.5:3b`   | 1.9 GB | text, floor                                      |
   | `qwen2.5:7b`   | 4.7 GB | text, main candidate                             |
   | `qwen2.5:14b`  | 9.0 GB | text, ceiling (tight on 16 GB, close other apps) |
   | `qwen2.5vl:3b` | 3.2 GB | vision                                           |
   | `qwen2.5vl:7b` | 6.0 GB | vision, main candidate                           |

   OCR models (Tier 2 replacement for tesseract; page image in, text out; sizes from the Ollama library pages, 2026-10-03):

   | Tag            | Size   | Notes                                                                              |
   | -------------- | ------ | ---------------------------------------------------------------------------------- |
   | `glm-ocr`      | 2.2 GB | 0.9B; prompt `Table Recognition:`; ranked top on OmniDocBench in the cited roundup |
   | `deepseek-ocr` | 6.7 GB | needs Ollama 0.13.0+; sensitive to prompt formatting                               |
   | `qwen3-vl:8b`  | 6.1 GB | newer than qwen2.5vl; needs Ollama 0.12.7+; usable as OCR or as extraction model   |

   Minimum useful set: `ollama pull glm-ocr && ollama pull qwen2.5:7b && ollama pull qwen3-vl:8b`. Newer families may beat these; the
   harness takes any `ollama:<tag>`, so add them as candidates when you want them tested.

## Run

Plug in power, close heavy apps, then (all from the repo root):

```
node scripts/pdf-corpus/bench.js --run-id t3-v1 --split dev \
  --candidates "router;t3=ollama:qwen2.5:7b;full=ollama:qwen2.5:7b;t3=ollama:qwen2.5vl:7b/image;full=ollama:qwen2.5vl:7b/both" \
  --cooldown-every 10 --cooldown-sec 45 --hardware-id m4-air-16gb
node scripts/pdf-corpus/report.js --run-id t3-v1
```

- Resumable: re-run the same command and finished (doc, candidate) pairs are skipped. Output:
  `data/pdf-corpus/runs/t3-v1.jsonl` (git-ignored; local-only like the rest of the corpus).
- Start with `--limit 30` to check the setup (about 10 minutes), then drop it.
- Candidates: `router` (no model), `t3=` (model alone on the best pages, measures the model), `full=` (router escalating to
  the model only when Tiers 1-2 fail verification, measures the product path), `mock=parser` (harness self-test).
  Modes: `text` (default), `image`, `both`.
- Fair timing: documents are the outer loop and the candidate order rotates per document; cooldowns and `wallClockMs`
  expose thermal throttling; `hardwareId` is recorded. Do not compare runs from different hardware.
- Do NOT touch the test split until the dev numbers pick a winner (plan §3b): `--split test` once, at the end.
- Hand back: tell the agent the run id; it reads the JSONL and `report.js --json`. No file needs sending.

### OCR-model candidates (Tier 2 with a dedicated OCR model)

`ocr=<ocr model>[+<extraction model>[/<mode>]]` is the router with Tier 2 reading pages through the OCR model (output normalised
to parser rows, then the same parser, unit hints and verification). The optional second model is Tier 3 on pages still unserved.
If the OCR model returns nothing, tesseract runs instead, so a candidate never does worse than `router` by crashing.

```
node scripts/pdf-corpus/bench.js --run-id ocr-v1 --split dev \
  --candidates "router;ocr=ollama:glm-ocr;ocr=ollama:deepseek-ocr;ocr=ollama:glm-ocr+ollama:qwen3-vl:8b/image;full=ollama:qwen2.5:7b" \
  --cooldown-every 10 --cooldown-sec 45 --hardware-id m4-air-16gb
node scripts/pdf-corpus/report.js --run-id ocr-v1
```

What to read: does `ocr=glm-ocr` raise coverage above `router` with servedAcc held (it fixes the garbled-page set), and does adding the
second model add more on top. Plumbing is tested (mock OCR model, unreachable-endpoint fallback); no real OCR model has run yet, and
prompts come from the Ollama pages, not from tuning on our filings.

### Prompts

Defined in `packages/jobs-runtime/lib/pdfExtract/prompts.js`: one specification (task, column rule, 5 rules, unit and basis
definitions, all 12 field definitions, output contract, one worked example) rendered in two styles: `chat` (7B and up) and
`compact` (numbered checklist, for models of about 4B or less, chosen automatically from the tag). Both styles carry the whole
specification (a test asserts it), so no model is expected to infer what another was told. Force a style with a suffix:
`t3=ollama:qwen2.5:3b#chat`, `ocr=ollama:glm-ocr+ollama:qwen3-vl:8b/image#compact` (order: `<provider>[/<mode>][#<style>]`).
Each run record stores `promptStyle`. OCR models take the fixed task prompt their authors trained on, not instructions.
Change prompts between dev runs only, never inside one, and not after looking at the test split.

## First real model run: `smoke-2` (2026-10-04, M4 Air 16 GB, first 30 dev docs, so small-sample)

| Candidate                     | Coverage | servedAcc | headline | p50 / doc | Finding                                                                                                                            |
| ----------------------------- | -------- | --------- | -------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `router` (no model)           | 40%      | 86.1%     | 93.8%    | 1.4 s     | control                                                                                                                            |
| `t3=ollama:qwen2.5:7b`        | 36.7%    | 91.7%     | 97.7%    | 45.7 s    | accurate when it answers; 9 of 20 answers on the wrong basis label                                                                 |
| `full=ollama:qwen2.5:7b`      | 60%      | 86.1%     | 90.3%    | 19.9 s    | +6 docs over router; model only on residual pages                                                                                  |
| `ocr=ollama:glm-ocr`          | 40%      | 86.1%     | 93.8%    | 65.5 s    | no gain: HTTP 500 "token repetition" on the 8 scanned docs, otherwise tesseract fallback                                           |
| `t3=ollama:qwen3-vl:8b/image` | 0%       | n/a       | n/a      | 244 s     | 29/30 "no-json" at the old output cap (output hit 2048 incl. thinking); thinking mode suspected, `think:false` now set, not re-run |

Follow-ups made after this run: `think:false` for qwen3-family models; the model's reply head is recorded on failure; Tier 3 reads
consolidated-headed pages first and takes `basis` from the page heading instead of the model; `bench.js --docs id1,id2` and
`ocr_probe.js` (one page, raw model output) for tuning without a full run. Nothing here clears the 98% gate; n is 30 docs.

### OCR engine comparison (tesseract vs models, same pages)

`ocronly=<engine>` skips the text-layer parse and sends the same ranked pages (the first 3 for scans) through one OCR engine, then the
same parser and verification, so engines are compared on identical input. `<engine>` is `tesseract` (the current Tier 2) or any OCR
model. `ocr=tesseract` is the plain router (text layer first, tesseract as fallback).

```
node scripts/pdf-corpus/bench.js --run-id ocrcmp-1 --split dev --limit 30 \
  --candidates "ocronly=tesseract;ocronly=ollama:glm-ocr;ocronly=ollama:deepseek-ocr;ocronly=ollama:qwen3-vl:8b" \
  --cooldown-every 10 --cooldown-sec 45 --hardware-id m4-air-16gb
node scripts/pdf-corpus/report.js --run-id ocrcmp-1
```

Compare coverage and servedAcc (OCR quality through the whole path), and p50/p95 (cost). Tesseract is the bar to beat on both.

## Output tokens: no cap while testing, measured instead

Since 2026-10-04 no call has an output cap (Ollama `num_predict: -1`; the OpenAI-compatible provider omits `max_tokens`).
A cap hides how long a model really talks, so length is now a metric. Each run record's `llmTokenUsage` carries
`localOutput`, `localCalls`, `localCut` (calls that ended on a length limit), `localMaxOutput` and `localFailed`; `report.js` shows
`outP50`, `outP95`, `outMax`, `cut` and `failed`. The 180 s per-call timeout still stops a runaway generation (it counts as `failed`).
To test a cap on purpose: `bench.js --max-tokens 1024`. Caveat: a model that loops forever now costs 180 s per call instead of
finishing early, so use `--budget-sec` chunks and read the `failed` column.

## GLM-OCR on Ollama 0.34.x/0.35.x

glm-ocr does not end its page cleanly on Ollama 0.34.1+, and the repeat guard returns HTTP 500 "token repeat limit reached"
(ollama/ollama issue 18609). `--stop '<|user|>'` and `--cache-bust` did not help on 0.35.1 in `ocr_probe.js`. Options: downgrade to
0.34.0 (the last release before the report; untested here), or serve glm-ocr from llama.cpp/mlx and use `openai:glm-ocr@http://127.0.0.1:8080/v1`.
Check with one page first: `node scripts/pdf-corpus/ocr_probe.js <docId> <page> ollama:glm-ocr`.

## OCR engine comparison `ocrcmp-2` (2026-10-05, M4 Air, Ollama 0.34.0, first 30 dev docs, OCR forced, no token cap)

| engine       | served docs | strict acc                                          | notes                                                                        |
| ------------ | ----------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| tesseract    | 4/30        | 89.6%                                               | 3.5 s/doc median                                                             |
| glm-ocr      | 7/30        | 14% as run, about 81% after the unit fix (estimate) | works on 0.34.0; 158 s/doc median; 10 of 17 "found" docs had the wrong basis |
| deepseek-ocr | 2/30        | 87.5%                                               | about 7k output tokens/doc, 24 calls ended on a length limit, 6 failed       |
| qwen3-vl:8b  | 4/30        | 89.6%                                               | 365 s/doc median, 58 failed calls (timeouts); not practical as an OCR step   |

Bug found by this run and fixed: when a page's unit line is missing from the OCR text, the router labelled the page's hinted unit (lakh) but
left values unconverted, so glm-ocr output was off by 100x (58 power-of-ten errors). `applyUnitHint` now converts to crore. Numbers above
for glm-ocr need a rerun to confirm. Also open: glm-ocr "Table Recognition" drops page headings, so the basis (consolidated/standalone) is often
wrong; a hybrid of tesseract text (heading, unit) plus glm-ocr table is the next idea. Nothing clears the 98% gate yet; 30 docs is small.

## Tesseract tuning `tess-1` (2026-10-05, VM, 30 dev docs, OCR forced)

Decision 2026-10-05: tesseract only (the model OCR engines are too slow on the owner's Mac). Candidate syntax:
`ocronly=tesseract:dpi=300,psm=6,prep=clean` (prep = none | gray | clean; clean needs ImageMagick: `brew install imagemagick`).

| variant                                              | served (of 30) | strict acc on served | pow10 | wrong basis | median ms |
| ---------------------------------------------------- | -------------- | -------------------- | ----- | ----------- | --------- |
| 200 dpi, raw (old default)                           | 3              | 86%                  | 0     | 0           | 4.3 s     |
| 300 dpi, raw                                         | 4              | 79%                  | 1     | 3           | 6.2 s     |
| 300 dpi, grayscale                                   | 4              | 79%                  | 1     | 3           | 6.6 s     |
| 300 dpi, clean (deskew, binarise, erase table rules) | 9              | 81%                  | 2     | 1           | 9.4 s     |

The router's Tier 2 default is now 300 dpi + clean. A ladder over variants adds almost nothing (10 documents served by any variant vs 9 for
clean alone). What remains: 11 documents where the table is never located (wide 8-column standalone+consolidated scans), 9 where verification fails
(dropped digits and decimals, e.g. 0.01 vs 0.1105), and missing rows. Untested ideas: tesseract TSV word boxes to rebuild columns, crop the
standalone and consolidated halves separately, and a fast low-resolution pass to find the result page in scans. 30 documents is small.

## Tesseract accuracy work (2026-10-07): two-read consensus + arithmetic repair

What changed in the result router's Tier 2 (all measured on dev docs against XBRL truth, scored with `bench.js`/`report.js`):

1. `consensus.js`: the page is OCR'd under up to four settings (`LADDER` in `router.js`); per field the value most reads agree on wins.
2. `verify.reconcileIncomeStatement`: when an arithmetic identity fails, the unvouched operand is replaced ONLY by a solved value that is printed on the page,
   otherwise dropped. A field no identity vouches for needs two reads. Identities among near-zero values no longer count (0.01 - 0 = 0.01).
3. Bug fixes: EPS was rescaled by the statement unit (all 3 power-of-ten errors); a failing soft identity was ignored.

| run                                | docs              | served | strict accuracy on served fields printed | notes                                 |
| ---------------------------------- | ----------------- | ------ | ---------------------------------------- | ------------------------------------- |
| tess-1 single read (300 dpi clean) | 30 tuned-on       | 9      | 81%                                      |                                       |
| tess-4 ladder + repair             | 30 tuned-on       | 18     | 96.9% (99.4% excluding otherExpenses)    | tuned on these 30, so optimistic      |
| tess-5h same code                  | 40 fresh dev docs | 19     | 82.2% (85.5% excluding otherExpenses)    | 4 wrong-basis docs; the honest number |

The holdout shows overfitting. Its errors are systematic, not OCR noise: (a) two DATAMATICS filings were served as a verified table of the wrong entity or column
(22 wrong fields); (b) profit before tax read from the "before exceptional items" line (BIRLACORPN, CCAVENUE, FORCEMOT); (c) a dropped decimal (92 vs 5.92).
`otherExpenses` is not comparable: the PDF prints one line, XBRL sums several. Nothing here clears the 98% gate, and the corpus must stay as the test bed.

Side-by-side pages (`layout.js`, added 2026-10-07): a page printing STANDALONE and CONSOLIDATED columns is cut into its two blocks before parsing; previously the left block was served as consolidated.

| run                           | docs | served | strict accuracy on served fields printed (excluding otherExpenses) | notes                                                                                                                                                         |
| ----------------------------- | ---- | ------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tess-5h (before layout split) | 40   | 19     | 85.5%                                                              |                                                                                                                                                               |
| tess-6 (same 40 docs, after)  | 40   | 19     | 95.3%                                                              | burned for tuning; the 4 PBT misses are an XBRL definition gap (XBRL ProfitBeforeTax excludes the JV/associate share the face statement adds)                 |
| tess-7 (40 fresh dev docs)    | 39   | 24     | 82.4%                                                              | the honest number: 1 power-of-ten, wrong column/entity served as "verified" (MICEL, KKCL, INTLCONV), digit slips (49.9353 vs 19.9353), integer-printed tables |

Takeaway: two reads + arithmetic catch some errors but not column shifts, so tesseract-only text parsing stays around 80-85% on unseen filings. Next: choose columns by the
date headings and word positions (tesseract TSV), then re-measure on a fresh set. Do not promote PDF values over XBRL.

## Reading the report

`coverage` = served docs / docs; `servedAcc` = field accuracy among served docs (basis must match XBRL truth);
`headline` = revenue, total income, PBT, PAT only; `sign` / `pow10` = sign flips and power-of-ten errors (hard gates);
`localTok` = local-model tokens (not billed; plan §3b ranks billed agent tokens, which are 0 here); `p50ms`/`p95ms` = time.
`eligible` needs servedAcc at least 0.98 with zero sign flips and zero pow10 errors. Ranking among eligible candidates:
accuracy, then billed tokens, then time.

## Status 2026-10-03 (measured in the VM, dev split, 157 docs, no model)

| Run         | What                                                                                      | Coverage        | servedAcc | headline | pow10 |
| ----------- | ----------------------------------------------------------------------------------------- | --------------- | --------- | -------- | ----- |
| baseline-v3 | whole-document parser, same 157 docs (its file holds 274; restricted to the router's set) | 43.3%           | 63.6%     | n/a      | 94    |
| router-v1   | page-level router, v1                                                                     | 38.6% (44 docs) | 77.0%     | 82.4%    | 8     |
| router-v5   | + serve rule, basis-aware retry, OCR clean-up, unit hints, field sanity                   | 29.3%           | 83.2%     | 90.8%    | 1     |

Coverage fell on purpose: the baseline served every doc it parsed (94 power-of-ten errors on these docs); the router abstains
unless the column verifies. Not eligible yet (accuracy under 98%, one pow10). The residual set is the Tier 3 target:
about 55% of dev docs abstain (48 no table located, 39 no candidate verified) and 24 docs have only a standalone
table served where truth is consolidated (the consolidated page's text layer or OCR is too garbled for the parser).
Tier 3 code, providers and verification are covered by tests against mocks and a local mock HTTP server; no real model has been
run, so every Tier 3 accuracy or speed number is still unmeasured.

## What could be wrong

- Truth is XBRL on one basis per doc; a PDF with a different definition of "other expenses" scores wrong although it is right.
- L2 identities catch headline slips, not a wrong expense line that still sums; field sanity drops the obvious ones only.
- A model can read the wrong column (previous quarter): grounding passes because the number is on the page. The XBRL
  comparison in this benchmark is what catches it, so read per-field errors in the report before trusting a model.
- 8 to 14B models on 16 GB: close other apps or the machine swaps and timings become meaningless.

## Scale and automate

- Once a model is chosen, `extractResultPdf(file, {tier3:{provider}})` is the single entry point; wire it behind the same
  `data:push`-excluded local-only path as the corpus, and run it as a nightly job on the Mac for names with no XBRL.
- Cheapest first: Tiers 1-2 cost nothing and serve what verifies; the model only sees abstained pages.
- Token saving on your side: ask for `report.js --json` output plus the 5 worst docs rather than pasting tables; the
  agent reads the JSONL itself. Candidate sweeps and report generation are scripts, not LLM work.

## Closure: tesseract fallback (2026-10-08)

Decision: PDF extraction is a **fallback only**; XBRL stays primary. When XBRL is unavailable the PDF values are used as printed
(including "Profit before tax" and "Other expenses" as the filing prints them; they may differ from XBRL's definitions).

Final additions: label-in-the-middle side-by-side tables (`layout.js` `splitMid`), and `dropSuspectIntegers` (non-headline fields that
come back as bare non-zero integers in a decimal-printed table are dropped, since OCR loses decimal points).

Fresh held-out run `tess-9` (30 dev result filings not used in any earlier tesseract run, 3 of 4 workers; a few heavy docs skipped):

| metric | value |
|---|---|
| docs served | 12 of 30 (rest abstained) |
| field accuracy, excl. other expenses, before integer rule | 89.0% |
| same rows re-scored with the integer rule | 92.1% (105 right, 9 wrong, 4 dropped, none of the dropped were correct) |

Gate (>=98%, zero sign flips, zero pow10) is **not met**. Remaining errors: digit slips inside numbers that two reads agree on
(GUFICBIO, METROBRAND), wrong column or entity, integer-printed tables. Treat PDF values as hints that need a second source.
Corpus deletion: `rm -rf data/pdf-corpus/pdfs data/pdf-corpus/scan` (keeps truth, manifest and run logs).
