# SOIC signal-system plan (Suresh, Shashank, ishmohit + SOIC teaching corpus)

Date: 2026-10-09. Status: PLAN, nothing built beyond what already exists.

## Goal

Turn the combined knowledge into **living signal processes** for finding, categorising and tracking signals for **entry and exit**:
top-down (macro, liquidity, policy, news, sector tailwinds) + bottom-up (filings, results, price action).
Out of scope (decided 2026-10-09): portfolio risk, position sizing, stop-loss, quarterly retrospective, watchlist filing checklist.

## Sources (assumption: SOIC = the group; 3 X handles + teaching corpus)

| Source                                                                   | In repo                              | Digested so far                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------ | --------------------------------------------------------------------------------------- |
| @SureshKBN (X)                                                           | captured                             | 3 topics: J-curve, PEAD, filings. Main tier-1 pass ~61 chunks left, tiers 2-3 untouched |
| @Shashank1171, @ishmohit1, @thechartist26 (X) - **confirmed 2026-10-09** | captured (11.3k / 10.6k / 5.2k docs) | none (P0 audit only)                                                                    |
| SOIC Learnyst (569 lessons, many are PDFs with no transcript)            | `data/learnyst-lessons/`             | valuation KPIs, J-curve (via concept-transcript-integrator)                             |
| SOIC YouTube (774 transcripts)                                           | `data/youtube-transcripts.json`      | searchable via ask-soic only                                                            |

Roles: Learnyst/YouTube = the **rule** (what SOIC teaches). X posts = the **application** (dated live calls -> backtestable cases). Per framework, keep a cross-source agree/conflict table.

## Images in tweets (decided 2026-10-09: read all photos, ignore GIFs and videos)

~9.6k photos across the 4 handles. Three-stage, script-first:

1. `lna.py img-collect|img-fetch|img-ocr --source x:<handle>`: download + local tesseract OCR (zero LLM, ~5 images/s). Text-heavy images (frameworks, tables, report screenshots, >=40 words) are **read by OCR alone** and joined to the tweet as `[IMAGE]` text, so topic-scan keyword matching sees them.
2. Charts (few words) go to a **topic-driven vision pass**: only chart images attached to docs that a topic-scan matched, newest/most-liked first, described by a cheap-tier subagent (ticker, timeframe, pattern, levels, annotations; stored `inferred`, never presented as his claim). Cost is bounded by topic, not by 9.6k.
3. OCR is noisy on charts and small print; framework images judged important (high likes, OCR-garbled) get a vision re-read.

## Signal ledger (the "living" part)

One record per signal definition (`kb-signal`, new, small): `angle` (macro|policy|sector|filing|result|price|exit), trigger definition, data source, **detector** (Stockscans saved scan | script on OHLCV/filings | skill phase | manual), lifecycle states (detected -> confirmed -> entry-ready -> invalidated/spent), validation status (untested | backtested n=.. | calibrated), source citations.
A nightly script-only job keeps per-(company, signal) state, so the morning digest shows only transitions (new entry-ready, newly invalidated). Reuse existing digests/jobs as detectors rather than adding parallel ones.

## What exists vs gap

| Angle                      | Already live                                                                                                | Gap to close                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Filings                    | announcement-insights, classifier, filingClusterFlags                                                       | done (see backtest caveat)                                                       |
| Results / PEAD             | quarterly-result-analysis PEAD read, pre-pead-scanner (scan 429918e3098ce660baec9f22), pead-surprise-ranker | season job = run that scan daily in results season (reuse; no new scan)          |
| Growth / re-rating         | rerating-catalysts, spentRerating.js                                                                        | wire real inputs                                                                 |
| Price action / entry       | gainers-signal, volume-rocketing, delivery-volume-tracker, near-highs-digest                                | **explicit entry-trigger definitions + exit signals; RS/52wk-funnel enrichment** |
| Sector / theme             | sector-research-deepdive, value-chain-analysis, sector-valuation-kpis                                       | hot-theme tracker (sector RS from near-highs digest)                             |
| Macro / liquidity / policy | tweet-signals only                                                                                          | **no regime view**: breadth, FII/DII flows, VIX, rates, policy calendar          |
| Exit                       | spentRerating, thesis-delta jobs                                                                            | distribution / failed-breakout / thesis-break signals                            |

## Phases (each independently shippable; cheapest first)

**P0 Coverage audit (script, zero LLM).** Matrix topic x source: post counts by keyword group, Learnyst/YouTube hits, lessons lacking transcripts. Also checks data availability for top-down feeds (FII/DII, VIX, breadth via Stockscans Custom Index). Output decides P2 order.
**P1 Signal taxonomy v1 (1 flagship session).** From P0 + existing frameworks, draft the angle list and ~30 candidate signals with detector type. You prune.
**P2 Topic passes** using the existing machinery (topic-scan -> Haiku extract -> verify -> persist -> flagship synthesis), run across all 3 X handles + SOIC corpus per topic. Order by value to entry/exit: (a) price action, volume, entry timing, base/breakout and exits; (b) top-down: macro, liquidity, policy, market regime; (c) sector/theme and value chain; (d) valuation horizon and priced-in; (e) screens/process. Budget: Haiku ~220-290k tokens per 5 chunks (measured); cap per topic and stop at diminishing returns.
**P3 Cross-source merge.** Agree/conflict table per framework; near-duplicate consolidation.
**P4 Detectors.** For each signal choose: Stockscans filter spec (you save it; I supply the filter definition), OHLCV script, or skill phase. Float gate: `floatMcap = mcap x (1 - promoter%)` from the scan field.
**P5 Ledger job + digest** (script-first, keyed state per company+signal, safe for concurrent runs).
**P6 Calibration.** Benchmark-adjusted event study (Nifty 500), longer window, only groups with n>=30; promote signal to "calibrated" or drop. Weekly refresh job feeds new tweets into the same pipeline (delta only).

## What could be wrong

- Tweets are survivorship-biased (winners get posted); backtests of them overstate edge. Early backtests were inconclusive and one contradicted the hypothesis.
- Keyword topic-scan misses implicit mentions and picks up noise; recall is unmeasured.
- Free float from promoter% ignores other locked-in holders; SEBI requires >=25% public holding, so a "10% float" gate may never fire - check whether the threshold meant float % or float market cap.
- Macro signals are slow-moving and hard to backtest on a few months of data.
- Technical rules differ per author; conflicts must be resolved by data, not by who posts most.

## Needed from Darshan (only these)

1. Confirm handles (Shashank1171, ishmohit1, thechartist26?).
2. Approve P0 (cheap, scripted).
3. Float gate: % of market cap or absolute float mcap, and the threshold.
4. URLs of any Stockscans saved scans you already use for technical setups (reuse as detectors).
5. Benchmark for calibration (default Nifty 500).

## Progress log

- 2026-10-09 P0 audit, P1 taxonomy (32 signals, all kept), image pipeline (OCR: Suresh complete; others partial, most-liked first).
- 2026-10-09 P2 technical wave 1: 453 units -> `data/assets/technical-playbook-soic-handles.md` (+7 proposed automations).
- 2026-10-09 P2 macro/liquidity/policy wave 1: 572 units -> `data/assets/macro-liquidity-policy-playbook-soic-handles.md` (+7 proposed automations).
- 2026-10-10 P2 sector/theme wave 1: 1,037 units -> `data/assets/sector-theme-playbook-soic-handles.md` (+6 proposed automations).
- 2026-10-09 Stockscans probe: `runScan` is scriptable with arbitrary filters and index scoping; no RS/delivery/ATR tokens; see `data/assets/stockscans-scriptable-probe-2026-10-09.md`. Nifty 500 breadth validated against posted figures (SMA-based).
- Decisions (user, 2026-10-09): keep all 32 signals; ignore low-float gate; macro included in next passes; user's Near Highs scan = 9493efc2c969d602c5dedbe2 (same scan the near-highs-digest job uses).
- Open: ledger storage decision (new collection vs existing), data sources for Brent/US10Y/USDINR/FII flows, remaining OCR, valuation + process passes, tier-2/3 chunks.

- 2026-10-11 — **MTF flush-out entry built** (`lib/mtfFlush.js`, `mtfFlushDaily.js`, `IndiaMtfClient`, job `mtf-flush-daily`; spec/evidence `docs/mtf-flush-signal/SPEC.md`). Scored 0-100 and tiered A/B/C; ledger signalId `MTF-flush`. Back-test edge small (≈+1% median 20d excess, hit 56-58%); weights uncalibrated.
- 2026-10-10 — **entry-ready-detector built** (`lib/technicalSetups.js`, `technicalSetupsDaily.js`, job `technical-setups-daily`, 11 unit tests). First live run (session 2026-10-09): 988-name universe, 96 RS≥90 candidates, 9 E1 `detected`, 0 E1 `entry-ready`, 5 E2 `entry-ready`; market gate active (M4-deep-correction, M3-weak-macro). Parameters are uncalibrated (provenance in lib header); E2 min/max pullback (2%/15%), 40/15-session windows are ASSUMPTIONS. Not yet scheduled; `data:push` not run.

- 2026-10-10 — **sector-cluster detector built** (`lib/sectorClusters.js`, `sectorClustersDaily.js`, job `sector-clusters-daily`, 5 tests). S1 flags an industry when ≥3 names, ≥10% share, universe ≥8 and share ≥1.5× the market-wide near-high rate; `confirmed` = 4 of last 5 sessions (history in `sector_snapshot` events). First run (302 near-highs / 2055 names, market rate 14.7%): 18 industries `detected` (e.g. Aerospace & Defence 11/24, EMS 6/12, Pharma Formulations 12/51). Thresholds are ASSUMPTIONS, uncalibrated. Not scheduled; `data:push` not run. S3 (focus-name concentration) deferred until a tracked set exists.

- 2026-10-10 — **exit-watch built** (`lib/exitSignals.js` X1/X2/X3/X7, `exitWatchDaily.js`, job `exit-watch-daily`, 7 tests; tracked set = Stockscans watchlist "Portfolio" 838b3f7e…; first dry run: 1 name, OPTIEMUS X2 detected). Scheduled weekdays IST: market-regime 21:15, technical-setups 21:50, sector-clusters 22:25, exit-watch 22:55.
- 2026-10-10 — **technical backtest (P6 first pass)** `technicalBacktest.js` → `data/assets/technical-setups-backtest-2026-10-10.json`. Nifty 500 (466 names, 2019-05→2026-10, step 5, excess vs equal-weight universe). Result: **no demonstrated edge**. E1 entry-ready n=55: +1.08% mean / 58% hit at 20d but −0.34% / 43.5% at 60d. E2 entry-ready n=337: +0.17% 20d, −2.14% / 40.5% hit at 60d. E0 candidates n=3327: mean +1.9% but median −1.8% at 60d (skew). Survivorship-biased, overlapping, thresholds untuned. E2 as defined should NOT be treated as a buy signal.

- 2026-10-10 — **calibration track + Stockscans probes deferred** by user. **OCR benchmark prepared**: `skills/tooling/learn-and-automate/scripts/ocr_benchmark.py prepare`; 60 images (20 text-heavy / 20 mid / 20 low-text, seed 42) in `data/runs/learn-and-automate/_ocr_benchmark/batch_1..6`, tesseract output in `tesseract.jsonl`, Gemini prompt in `GEMINI_PROMPT.md`; waiting for the user's `gemini.jsonl` (compare step not yet written).
- 2026-10-10 — **policy-event tracker built** (`lib/policyEvents.js`, `policyEventsDaily.js add|run`, job `policy-event-tracker`, 5 tests). Agent discovers dated policy events weekly (Sun 18:30 IST) and maps to 3-25 ticker baskets with source URLs; script computes basket excess return vs CNX500 daily (chained into `sector-clusters-daily`) → ledger `P1-policy-absorption` (detected <5%, confirmed 5-20%, spent ≥20%, 120d age-out; ASSUMPTIONS). No events registered yet.

- 2026-10-10 — **liquidity monitor built** (`lib/liquiditySupply.js`, `liquiditySupplyDaily.js`, job `liquidity-supply-daily` 23:25 IST weekdays, 4 tests): L2 block-deal SELL value last-5-sessions vs prior-20 median (≥2×/3×), L1 FII 20-session cumulative (needs 20 `market_snapshot`s; omitted until then). Bulk deals excluded (NSE caps responses at 70 rows/call; one call per day, past days cached). First dry run: ratio 0.48× → no flag. IPO/OFS supply and SIP flows NOT covered. **cycle-indicators built** (`lib/cycleIndicators.js`, `cycleIndicatorsMonthly.js add|run`, job `cycle-indicators-monthly` on the 6th 10:20 IST, 4 tests; agent only fetches sourced figures). **Skill edits applied**: Tailwind/Headwind Test → `sector-research-deepdive` Phase 3; Proxy ladder → `value-chain-analysis`. news-absorption-gauge = covered by `P1-policy-absorption` (no separate build). Gemini OCR prompt rewritten for in-project agent use.
- 2026-10-10 — **valuation + process topic passes done (P2d/P2e) + teaching corpus.** New topics in `topic_keywords.json` with contracts `topic_extraction_valuation.md` / `topic_extraction_process.md`. X handles: tier-1 only, 10 chunks per handle, 66 Haiku chunks -> 511 valuation + 470 process verified units. Teaching corpus (title-narrowed: 41 Learnyst + 7 YouTube valuation chunks, 25 + 10 process chunks) -> 557 valuation + 527 process units. Four merged playbooks persisted as `kb-framework` (`valuation-playbook`, `process-playbook`, `valuation-teaching-playbook`, `process-teaching-playbook`; sources in `data/runs/learn-and-automate/_combined/*`); `framework_persist.py` builds the records. 11 built detectors/skill edits marked applied in `kb-automation`; 8 new automation proposals added (V1-V4, process P1-P4). Not done: stance review (Darshan's), remaining Learnyst/YouTube chunks, replies/tier-2, chart vision pass. Notes: OCR benchmark chose tesseract for text extraction. Stray broad scan dirs `learnyst-a-e-i-o-u` and `youtube-soicfinance` under `data/runs/learn-and-automate/` are unused scratch (delete when allowed).
- 2026-10-10 — **stances + automations decided by Darshan.** Provisional auto-stances (`scripts/auto_stance.py`, rank: SOIC teaching > Suresh > ishmohit > Shashank > Chartist; recent+explicit = adopt, inferred/repost/older than 2y/lower-ranked side of a listed conflict = unsure; `userNote` starts `auto:`; `pick` units left unreviewed): 5,787 adopt, 1,354 unsure, patched via persist `--patch`. The 8 new automation proposals are `approved`. Stray scratch files and unused scan folders deleted; `data:push` run at the end.

- 2026-10-10 — Approved automations built: V1 `valuation-stretch-daily` (PEG / Industry-PE premium / PE>50 in weak regime; own-history median PE not in scan → applied-partial); `funnel-gaps-daily` (F1 PAT-QoQ>25 as EPS proxy, F2 candles<250 as IPO<1y proxy; live run pending Stockscans 429 → applied-partial); `peadPricedIn` + NEAR_52W_HIGH (informational); market-regime 1M-gainer breadth (`pctGainers1M`, `pctGainers1MOver10`); `weekly-review-prompt` routine. sector-pe-phase blocked (no sector PE history). Pending: paper-supply, results-season-prep. All thresholds uncalibrated.

- 2026-10-10 — funnel-gaps live-verified on a >=1L Cr slice (22 names; F2 caught Tata Motors CV, ICICI AMC, Vedanta Aluminium, SBI Funds); added a seasoned-name cache so scheduled runs skip OHLCV for old listings. Still open: paper-supply (no QIP/preferential feed wired), results-season-prep.

- 2026-10-11 — paper-supply-daily (P1 high-PE block selling, P2 QIP/preferential at PE>50; live dry-run OK: SBI Life P1 confirmed) and results-season-prep-daily (R1 faded post-result, 467 screened, 164 flagged — not market-adjusted) built; both applied-partial. All 8 approved automations are now applied/applied-partial except sector-pe-phase (blocked: no PE history; needs a weekly snapshot collector).

- 2026-10-11 — sector-pe-snapshot-weekly built; first snapshot 2026-W41 (204 industries; own median matches platform median). sector-pe-phase evaluator deferred until >=26 weekly snapshots.

- 2026-10-11 — Teaching passes for technical (322 units), macro (133), sector (243, first 15 of 22 Learnyst chunks) title-narrowed; 3 teaching playbooks persisted (kbf*learnyst-soic-teaching*{technical,macro,sector}-teaching-playbook); 24 conflict-side units set to unsure via `conflict_stance.py`; provisional stances on all new teaching units (rank 0). sector-pe-snapshot-weekly built. Chart vision pass NOT run: 924 chartist charts alone; user priority is text extraction (tesseract) — recommend skipping.
- 2026-10-10: vision pilot applied (200 chart-class images, 4 handles, inferred); sector Learnyst chunks c016-c022 verified+persisted (308 units total, 100 adopt by auto-stance).
- 2026-10-11: sector playbook refreshed to 343 units / 193 derivedFrom (all 22 Learnyst chunks).
- 2026-10-11: tier-1 gap-fill: 48 missing X chunks (suresh process/technical/valuation, shashank valuation, chartist technical) extracted by Haiku; ~1,000 raw units, 73 rejected by verbatim check, rest persisted + auto-stanced (559 adopt / 444 unsure). Tier-2/3 (replies/reposts: 295 chunks) still unextracted by design. Vision pilot spot-check: ~45% of chart-class images are real charts/tables (chartist 66%); rest covers/memes/logos. Sector playbook refreshed to 343 units.
- 2026-10-11: **X4-X6 built** into exit-watch-daily (`lib/exitSignalsExtra.js`, 15 tests): X4-sector-rs-rollover (held industry vs Nifty 500, 3M leading + 1M lagging), X5-distribution (rising on falling volume, block SELL >=Rs10 Cr/5d, >=2 failed breakouts/60d, FII holding -1pp), X6-fundamental-exit (stretched valuation via valuationStretch, muted result reaction, CFO/PAT<0, pledge>=20%). All thresholds ASSUMPTIONS. Dry run on Portfolio watchlist (1 name, Optiemus): X5 repeat-failed-breakouts, X6 cash-divergence (CFO/PAT -18), X4 not flagged (EMS 1M -4.6% vs market -5.9%). Tracked set is only 1 name, so the signals are untested at scale.
- 2026-10-11: **IPO/OFS supply built** (`lib/ipoSupply.js`, `ipoSupplyDaily.js`, job `ipo-supply-daily`, 15 tests): P3-ipo-review-window (12-18m after listing; confirmed if price<=offer, PAT YoY>0, no overpricing flag), P4-lockin-expiry (SEBI lock-ins approximated from listing date), P5-ofs-announcement (NSE announcements feed). Live dry run: 249 mainboard IPOs, 74 P3 (17 confirmed), 6 P4, 0 P5 (none in the last 7 days; the Stockscans full-text search was too noisy so NSE feed is used). Stockscans 429s after repeated universe scans -> same-day cache. Also fixed a date bug in exit-watch (istDate returns a Date). paper-supply automation -> applied. Schedule slot suggested 23:55 IST.
- 2026-10-11: **sector-rotation-daily built** (`lib/sectorRotation.js`, 8 tests): S3-focus-concentration (daily; 29 focus names across 13 industries -> none >=3 & >=25%), S2-sector-rs-rising + X4-sector-rs-rollover (weekly, Nifty 500 Performance scan; first snapshot day uses acceleration proxy, week-2 onward compares to last snapshot). Dry run 2026-W41: market median 1M -5.9% / 3M -7.2%; S2 12 industries (IT Services, private/PSU banks, new-age platforms lead); X4 5 (Pharma CRAMS, Aerospace & Defence, Diversified Auto Components confirmed). Suggested slot 22:40 IST. sector-rs automation -> applied-partial.
- 2026-10-11 — **Open items cleared.** (1) _Digest enrichment_: near-highs-digest industry table gains `RS 1M / 3M` (latest weekly sector snapshot) and `Signals` (S1/S2/X4/S3/P1 from the ledger) at zero API cost; 3 tests. (2) _sector-kpi-map + valuation reconciliation_: additive section appended to `skills/_shared/sector-valuation-kpis.md` (24 sectors cross-checked vs teaching + X handles; 10 conflicts/caveats, e.g. EPC order-book valuation contested, CDMO cyclical vs premium, teaching quotes numeric P/E anchors the file deliberately avoids; single-source items marked). (3) **P6 calibration** (`signalCalibrationReplay.js`, `lib/signalCalibration.js`, 3 tests): replayed the price-only exit detectors over ~4y of candles for 127 liquid NSE names (survivor sample; 3 split-artifact tickers dropped; benchmark = same-date cross-sectional median; onsets with 20-session cooldown). **Result: no edge.** X1, X2, X3 (20/50 EMA), X5 volume and X5 failed-breakout onsets show forward 21d/63d excess return and 21d worst-drawdown within ~1pp of the unconditional baseline (e.g. P(21d drawdown >=10%) 19-22% vs 21.1% baseline). They stay as risk context, not as predictive signals; no threshold change justified by this data. A first run suggested a large X5 edge (-10% at 63d) that came entirely from a polluted equal-weight benchmark (split artifacts) — caught by per-year breakdown. Still open: sector-lifecycle (needs crowding thresholds from Darshan), sector-cluster-validation (needs cluster-count history), V1/F1/F2/R1/P-signal calibration (need ledger history or fundamentals history).

- 2026-10-11 — **sector-lifecycle-weekly built** (`lib/sectorLifecycle.js`, `sectorLifecycleWeekly.js`, 13 tests): S4-sector-lifecycle-crowding, context only, user-chosen defaults — price >=2x off the 24M low (warm 1.7x), IPO supply >=4 listings/12m or >=25% of names, sector P/E >=1.5x its earliest 13 snapshots (n/a until 26 snapshots, ~Apr 2027). 1 flag detected, 2+ confirmed; phase base/run/crowded/fading + months since low. Dry run 2026-W41 (184 industries): 14 price-crowded (defence, cables, electrical/power equipment, data centre, shipping, textiles...), 4 IPO-supply flags. Fixes found by checking the first run: recent listings and BSE micro-caps faked 16-80x runs, so index members need mcap >= Rs 500 Cr and full 24M history. Caveat: count-only IPO rule flags big industries (IT Services, 6 of 126 names).

- 2026-10-11 — **sector-cluster-validation replayed** (`sectorClusterReplay.js`, `yarn sector-cluster-replay`, no API calls): production S1 rule (>=3 near-high names, share >= max(10%, 1.5x market rate), 4 of 5 sessions) over cached candles of 1,020 names / 105 industries (2023-2026), near-high = 95% of 252d close high, industry sample = <=8 largest names. 364 cluster onsets vs 7,875-observation baseline (every 10th day, all industries), both vs the cross-sectional median: **21d +2.84% vs +1.84% (+1.0pp); 63d +6.77% vs +4.31% (+2.5pp); cluster > baseline in every year 2023-2026 on both horizons.** Verdict: weak, consistent positive lift, not strong enough to make the sector gate blocking. Caveats: survivor sample, bull-market window (~4y of candles), overlapping/clustered events (naive t-stats ~9 are optimistic), proxy near-high and sampled-industry share differ from production. Re-run on real `sector_snapshot` history later (1 snapshot so far, 2026-10-10).
