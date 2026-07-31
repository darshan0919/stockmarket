# Order Book Extraction — cache-first, script-first pipeline

Status: value + unit extraction from concall notes AND order-win
announcements is built and validated, wired into a per-company cumulative
ledger that is fully cache-first (nothing is ever parsed twice — see
"Cache-first architecture" below). As of 2026-07-31 the pipeline also reads
the announcement PDF text layer, which closed the two largest gaps —
execution timelines and the ~50% of filings whose value appears only in the
attachment — and it now writes durable facts to the events collection and
runs as a scheduled job over the Radar watchlist. See "PDF tier" below.

## Why concall notes, not raw PDFs

Stockscans' `concall-notes` API (`GET /api/company/concall-notes/{companyId}/{ssUrl}`)
already returns an AI-synthesized `finalReport` in a fixed markdown bullet
format: `*   {{bid:N}}**<Label>:** **<bold value>** [refs]`. This is a far
better extraction surface than the source PDF/PPT — no OCR, no table
parsing, no layout variance across filers. The order-book figures live in a
`# N. Order Book & ...` section as `**...Order Book...:** **₹X Cr**` bullets.

## Pipeline

```
concallNotesStore.js          — permanent, quarter-keyed cache (data/cache/concall-notes/<companyId>/<date>.json)
fetchConcallNotes.js           — DB-first fetch; only calls Stockscans (600 calls/month cap) on a cache miss
orderBookPatterns.js           — the regex/keyword vocabulary (the ONLY file the learning loop edits)
orderBookExtractor.js          — deterministic extraction: findCandidates() + extractOrderBook()
scripts/orderbook/extractOrderBook.js  — CLI entry point a skill should call
```

Call pattern for a skill:

```
node packages/jobs-runtime/scripts/orderbook/extractOrderBook.js NSE:TICKER --last-n 1
```

- Exit 0: clean deterministic result in `results[].valueCr` / `.unit` / `.label` / `.sourceLine`.
- Exit 2: `needsLlmFallback: true` on one or more quarters — `results[].llmFallbackPrompt`
  is a pre-built, token-minimal payload (just the order-book bullet lines,
  not the full report) ready to hand to a cheap model (Haiku/Gemini per
  project convention — see feedback memory on script-first + cheap-model use).
- Non-2 nonzero exit: real error (bad ticker, network, auth).

After an LLM fallback resolves a case, persist what was learned so the next
run doesn't need the LLM again:

```
node extractOrderBook.js --learn-segment "<keyword that mis-triggered a total>"
```

This does a source-text rewrite of `orderBookPatterns.js`'s `SEGMENT_KEYWORDS`
array — the pattern library is versioned in git like any other code, so this
is a normal commit, not a hidden runtime state file.

## Extraction logic

1. Scan `finalReport` for bullet lines matching `**<label>:** <value>` where
   `label` mentions "order book" or "backlog".
2. Classify each label TOTAL vs SEGMENT:
   - TOTAL if, after stripping "order book"/"backlog" and parenthetical
     qualifiers, the remaining head word is in `TOTAL_QUALIFIERS` (`total`,
     `outstanding`, `consolidated`, `standalone`, `current`, `closing`,
     `unexecuted`, `net`, `group`, `overall`, or bare).
   - SEGMENT if the label contains any `SEGMENT_KEYWORDS` term (vertical/
     product-line/JV qualifiers like "Water", "Smart Meter", "(O&M)", "JV",
     or process words like "Mix", "Guidance", "Momentum").
3. Parse the first `₹`/`Cr`/`Lakh`/`Mn`/`Bn` figure out of the bolded value
   text (`VALUE_RE`) — percentages, counts, and durations never match, so
   qualitative bullets are naturally excluded rather than needing a
   negative-list.
4. If exactly one TOTAL bullet has a parseable value → return it (`high`
   confidence). If several agree within 15% → return the highest-priority
   one. If several disagree by >15% → `OrderBookAmbiguousError` (e.g. actual
   vs. guidance, or H1 vs. full-year, or standalone vs. consolidated — these
   are genuinely different numbers and picking automatically would be wrong).
   If zero → `OrderBookNotFoundError` (the notes only cite segments, ratios,
   or prose — no clean bold total sentence exists).

## Validation (2026-07-19, 27 companies, defence/EPC/capital-goods/auto-ancillary/shipbuilding/rail)

| Outcome                                            | Count | %   |
| -------------------------------------------------- | ----- | --- |
| Clean deterministic extraction                     | 17    | 63% |
| Correctly flagged ambiguous (2 disagreeing totals) | 2     | 7%  |
| No total found → LLM fallback needed               | 8     | 30% |

Zero false positives observed in manual spot-check (every "OK" result's
`sourceLine` was hand-verified against the mined corpus). The 30% MISS rate
is not a bug to regex away — in each case the concall notes genuinely never
state a clean bold company-wide total (e.g. HAL and IRCON's notes only give
ratios like "~2x annual revenue" or a single product-line figure; GRSE's
total is embedded in prose "dipped below ₹20,000 Cr" with no exact bold
number). These are exactly the cases the LLM-fallback tier exists for.

## What could be wrong with this

- **Sample size (27 companies, one quarter each)** is enough to validate the
  mechanism, not enough to claim the SEGMENT_KEYWORDS list is complete.
  Expect the miss/ambiguous rate to shift as more sectors are run through —
  IT services, banks/NBFCs, and pharma likely don't use "order book"
  vocabulary at all (order book is a capital-goods/EPC/defence/auto-ancillary
  concept), so this extractor's applicability is sector-scoped, not universal.
- **Stockscans' AI notes are themselves a synthesis layer** — if their model
  mis-transcribes a number from the source PDF, this extractor inherits that
  error silently. There's no cross-check against the source PDF/PPT in this
  pipeline. A future validation step could diff the extracted value against
  the investor-presentation order-book slide when both exist.
- **`hasNotes:true` is required** — companies whose latest transcript hasn't
  been annotated by Stockscans yet have no concall-notes bullets at all; the
  fetch script silently returns `no Transcript with hasNotes:true found`
  rather than erroring, which could be mistaken for "no order book" if a
  caller doesn't check `results.length`.
- **`+ L1` and similar trailing decorations** are currently hard-coded as an
  allowed exception (KEC's "Order Book + L1") rather than a general rule —
  another such variant will MISS until added.

## Cache-first architecture (added 2026-07-19)

Every artifact this pipeline touches is permanently cached and content-
addressed. Nothing is ever recomputed once cached — a second call for the
same company with no new concall or announcements makes **zero** network
calls and reuses every prior computation verbatim.

```
data/cache/concall-notes/<companyId>/<quarter>.json      — concall text + its cached orderBook{} extraction (Task 7)
data/cache/order-announcements/<companyId>/<ssUrl>.json  — every announcement ever looked at, order-related or not, classified+extracted once
data/cache/order-book-ledger/<companyId>.json            — base (latest concall figure) + applied announcement deltas + running cumulative + audit history
```

| File                                       | Role                                                                                                                                                                                                                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/concallNotesStore.js`                 | `getOrderBook()`/`saveOrderBook()` — the extraction result lives ON the concall-note record it came from, never a separate file that could drift out of sync                                                                                                                                  |
| `lib/orderAnnouncementExtractor.js`        | Classifies + extracts a single announcement. Title match (`Award_of_Order_Receipt_of_Order` — a fixed SEBI Reg-30 filing category, mined live) is the free, reliable classifier; value comes from a `Rs./₹ X Cr` regex over title+description                                                 |
| `lib/orderAnnouncementStore.js`            | Permanent per-announcement cache. `unresolved(companyId)` recomputes the pending-LLM-fallback list FROM DISK every call — not "seen this run" — so an unresolved item is never silently lost once the watermark moves past its date (a real bug caught during validation, see below)          |
| `lib/orderBookLedger.js`                   | `setBase()` (new concall → replaces base, resets applied-announcements since the new base already reflects them), `applyAnnouncement()` (idempotent — a re-applied `ssUrl` is a no-op), `advanceWatermark()`, `recompute()` (cumulative is ALWAYS derived from base + deltas, never hand-set) |
| `scripts/orderbook/getCompanyOrderBook.js` | Orchestrator — the one entry point a skill calls: `ensureBase()` then `processNewAnnouncements(sinceDate)`                                                                                                                                                                                    |

### Call pattern

```
node packages/jobs-runtime/scripts/orderbook/getCompanyOrderBook.js NSE:TICKER
```

Returns `{base, cumulative, newlyAppliedAnnouncements, pendingLlmFallback, watermark}`.
Exit 0 = fully resolved. Exit 2 = `pendingLlmFallback` non-empty — those
items need a cheap LLM read (mostly because the order value is stated only
in the attached PDF, not in title/description — see limitation below).

After resolving a pending item via LLM:

```js
const { recordAnnouncementResolution } = require('.../getCompanyOrderBook');
recordAnnouncementResolution(companyId, ssUrl, date, { deltaCr, reasoning });
```

This permanently caches the resolution (never re-asked of the LLM) and folds
it into the ledger's cumulative total on the next call.

### "Last order book info" resolution rule

Per the requested design: the ledger's `base` always comes from the **latest
concall** with `hasNotes:true` (`ensureBase()` compares `ledger.base.
sourceQuarter` against the latest available quarter — if they match, nothing
is recomputed; if a newer concall exists, it becomes the new base and
`watermark` resets to that quarter's end date, since a fresh concall's own
order-book figure already subsumes prior order wins). Announcements are only
ever fetched/applied from `watermark` forward, so "the company's last order
book info, then parse new announcements since" is enforced structurally, not
just by convention.

### Validation (2026-07-19, live run on NSE:RVNL, NSE:NCC)

- **Base resolution**: correctly reused the cached `202603` concall base on
  every subsequent call (`newlyAppliedAnnouncements: []` unless a real new
  contribution existed) — zero recompute confirmed by identical `computedAt`
  timestamps not advancing between calls with no new data.
- **Idempotent announcement application**: manually re-triggered processing
  over the same announcement window twice — `announcementsApplied` in the
  ledger did not duplicate (guarded by `ssUrl` dedup in `applyAnnouncement()`).
- **Resolution loop**: manually resolved one of RVNL's 6 pending fallback
  announcements (`recordAnnouncementResolution` with a test delta) — cumulative
  correctly moved from 99,262 Cr → 99,762 Cr, and the item permanently
  dropped out of `pendingLlmFallback` on the next call.
- **Bug caught and fixed during validation**: the first version only returned
  `pendingLlmFallback` for announcements seen _in that call_. Once the
  watermark advanced past their dates, a second call reported an empty
  pending list — silently losing track of 6 real unresolved items. Fixed by
  making `orderAnnouncementStore.unresolved()` scan the cache directory fresh
  every call rather than tracking an in-memory "this run" list.

## What could be wrong with the announcement-value extraction

- **~50% of real order-win filings state the value ONLY in the attached PDF**,
  not in title/description (live sample: RVNL's "Receipt of LOA from NMDC
  Limited" and NCC's monthly "Order(s) received during June 2026" both carry
  no Rs/₹ figure in metadata). `pdf-parse` (already a repo dependency) was
  tried for PDF-body extraction and crashed unpredictably in this sandbox —
  not debugged further given scope; every such case is correctly routed to
  `pendingLlmFallback` rather than silently dropped, but the LLM tier is
  currently carrying more volume than ideal. Getting PDF text extraction
  working (or an LLM call that reads the PDF URL directly) would meaningfully
  cut the fallback rate.
- **NCC-style monthly aggregate announcements** ("Order(s) received during
  June 2026") may report ONE combined figure for a whole month, which — if
  ever resolved via PDF/LLM — must replace, not add on top of, any
  same-period per-order announcements to avoid double-counting. This
  pipeline doesn't yet detect that distinction; a resolver adding deltaCr for
  both a monthly aggregate and its constituent single-order filings in the
  same month would overcount. Worth flagging explicitly to whoever resolves
  fallback items via LLM.
- **The `announcements()` client method was newly added** (`StockscansClient.
announcements()`) because the pre-existing `companyAnnouncements()` method
  returns HTTP 400 for the documented payload shape (verified live,
  2026-07-19) — that pre-existing method is left untouched since other
  callers (`scanCatalysts.js`, `stockscansAnnouncementScansPage.js`) may
  depend on its current (possibly also broken, unverified here) behavior;
  worth a follow-up audit.
- **Watermark granularity is date-only (`YYYY-MM-DD`)**, not timestamp — two
  announcements on the same date as the watermark's boundary rely on the
  strict `d <= sinceDate` skip condition; this is correct given Stockscans'
  date-only announcement metadata but would need tightening if a future data
  source provides intra-day timestamps.

## PDF tier (added 2026-07-31)

The two "what could be wrong" items above — the missing execution timeline
and the ~50% of filings whose value lives only in the attachment — were both
caused by the same thing, and it was never an OCR problem.

`pdf-parse` had failed here, which made announcement PDFs look unreadable and
pointed earlier attempts toward OCR. Re-testing with `pdfjs-dist` over every
pending filing for NSE:NCC and NSE:RVNL found **8 of 8 carry a real embedded
text layer** — exchange filings are template-generated, not scanned. So the
fix was a different PDF library, not rasterise-and-OCR. No OCR tier exists and
none is needed; a genuinely scanned filing surfaces as `scanned: true` and
routes to the LLM queue.

```
lib/announcementPdfText.js  — pdfjs-dist text layer, permanently cached at
                              data/cache/announcement-pdf-text/<companyId>/<ssUrl>.json
lib/orderPdfExtractor.js    — value + quantities + timeline out of that text
```

### Why the SEBI template makes this tractable

Since SEBI Master Circular HO/49/14/14(7)2025-CFD-POD2/I/3762/2026 (30 Jan
2026), every order filing carries a standard "Annexure A" with fixed rows,
including (f) "Time period by which the order(s)/contract(s) is to be
executed" and (g) "Broad consideration or size of the order(s)/contract(s)".
The answers vary in wording but the vocabulary is narrow.

Two details that are easy to get wrong:

- **The ₹ glyph is often mangled by font encoding** — RVNL's filings render it
  as a stray `f` or `t` ("f 758.07 crores"). Requiring a currency symbol drops
  these entirely, so the symbol is optional and the amount is cross-checked
  against the SEBI-mandated word form ("Rupees Seven Hundred Fifty Eight
  Crores Seven Lakhs Only"), which survives mangling. Agreement between the
  two promotes the reading to `high` confidence. Note the word-form parser
  needs a sub-accumulator for Indian grouping: "Two Thousand Nine Hundred and
  Seventy Seven Crores" is 2977 Cr, not 2000 + 977 Cr.
- **Period-aggregate filings** (NCC's "Order(s) received during June 2026")
  state a total _and_ its components. When the smaller figures sum to the
  largest, the largest is the stated total — flagged `isAggregate` with
  `components` recorded, so the ledger adds the total once instead of
  double-counting. This is the double-counting hazard flagged in the previous
  section, now handled.

### Timeline

Filings state a _duration_ ("36 Months", "730 Days"), almost never explicit
start/end dates. The window is therefore anchored on the filing date, and
`basis: 'duration-from-filing-date'` records that it was derived rather than
stated. The ledger's `cumulative.executionWindow` reports `withTimeline` /
`withoutTimeline` counts so a consumer can see the coverage behind the dates.

A filing usually mentions several durations, so picking the right one matters
more than finding one. In precedence order, recorded in `selection`:

| `selection`           | Rule                                                                                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sebi-annexure-row-f` | The duration answering "Time period by which the order(s)/contract(s) is to be executed". Every issuer sampled reproduces this label verbatim, making it the one signal that is execution time _by definition_. |
| `execution-context`   | Longest duration near execution wording, when row (f) is absent                                                                                                                                                 |
| `longest-non-om`      | Last resort                                                                                                                                                                                                     |

Two corrections sit underneath that, both found on real filings:

- **O&M tails are excluded.** WABAG's Delhi Jal Board win is 21 months of
  build followed by 15 years of O&M. Taking the longest span reported an
  execution window nearly nine times too long. Durations introduced by O&M,
  annuity, defect-liability or warranty wording are dropped, and listed
  separately as `omDurations`. If _every_ duration in a filing is an O&M
  period, the timeline is `null` rather than the tail.
- **Kerned digits are reassembled.** These PDFs space digits apart, so the
  text layer emits `"6 0 months"` for 60 and `"2 4 months"` for 24. Read
  naively the leading digit is lost and Power Mech's 60-month contract
  registered as **0 months** — an order that looks already delivered. Only
  single digits are absorbed, so `"2026 36 months"` still yields 36.

### Validation (2026-07-31, all 8 previously-pending filings for NCC + RVNL)

| Outcome                      | Count | %    |
| ---------------------------- | ----- | ---- |
| Value extracted              | 8     | 100% |
| ...at `high` confidence      | 7     | 88%  |
| Execution timeline extracted | 5     | 63%  |

The 3 filings without a timeline are NCC's monthly aggregate letters, which
genuinely state no execution period — so timeline coverage is 5/5 on
single-order filings. `pendingLlmFallback` for both companies went to zero and
NCC's book moved 83,004 → 87,079 Cr as the previously-unread filings landed.

Sample size was the caveat: 8 filings from 2 issuers, both PSU/EPC. Extending
to a third issuer (WABAG) immediately cost that assumption, and the failures
are worth recording because none of them looked like failures:

- A **GST demand order** was booked as a ₹6.47 Cr win. `TITLE_RE` matches
  "Intimation for receipt of Order from GST Authorities" word for word — a tax
  authority issues "orders" too. Now filtered by `isRegulatoryOrder`.
- WABAG prints a **size-band grid** ("Upto 100 | 100 to 250 | …") in the footer
  of every filing. The value regex read that boilerplate, so four wins were
  booked at band boundaries rather than real values. The grid and its footnote
  are now scrubbed before any figure is matched.
- The grid's international row is denominated in **USD millions**, which was
  being taken as rupees — understating a USD 30–75 mn order by roughly two
  orders of magnitude. Foreign-currency figures are now detected and refused
  rather than converted at an assumed rate.

Net effect: WABAG's book was reported as ₹17,486 Cr, of which ₹286 Cr was
entirely fictional. It now reports the ₹17,200 Cr declared base with all five
wins in `pendingLlmFallback` — a smaller number that is actually true.

## Band-only disclosure

Some issuers never state an order value at all. WABAG answers SEBI annexure
row (g) with a size _class_ — "Mega Order \*" — and prints a grid in the
footer defining what each class means:

| Order Classification         | Small   | Medium   | Large    | Major        | Mega        |
| ---------------------------- | ------- | -------- | -------- | ------------ | ----------- |
| Domestic (in INR Crores)     | Upto 100 | 100–250 | 250–600  | 600–1,000    | Above 1,000 |
| International (in USD Mn)    | Upto 10  | 10–30   | 30–75    | 75–150       | Above 150   |

Refusing a figure is correct here, but reporting nothing throws away the one
thing the filing does say. So the class and the grid are read together:

- The class comes from row (g)'s answer, anchored on the row (h) label that
  follows it. Anchoring matters — "large" appears throughout the marketing
  prose ("a large-scale desalination solution") and only the annexure answer
  is the issuer's own classification.
- The jurisdiction comes from row (e), which selects the grid row.
- An open-ended top band ("Above 1,000") yields a `null` ceiling rather than
  a fabricated one.

The result is carried as `valueBand` on the announcement and folded into the
ledger as a **range around the firm total, never into the total itself**:

```
valueCr      17200      ← firm. Only ever stated figures.
rangeLowCr   17550      ← + the floor of each domestic band
rangeHighCr  18050      ← + the ceiling (null if any band is open-ended)
foreignBands [ … ]      ← USD/EUR bands, listed unconverted
```

Foreign-currency bands widen nothing. Expressing "USD 30 to 75 mn" in crore
needs an FX rate as of the filing date, and inventing one would reintroduce
exactly the error this section exists to prevent — so they are reported in
their own denomination and left for a human to weigh.

This turned WABAG from five unresolved filings into five resolved ones with
zero fallbacks, without asserting a single number the company did not state.

## Non-monetary units

`cumulative.quantities` holds per-unit buckets (MW, Km, MTPA, kWh, Tonnes...)
that are **never summed across units** — 385 Km and 10 MTPA share no
denominator. The rupee figure stays the headline; quantities describe what the
money buys. Unit spellings are folded to a canonical form (`km`/`Kms` → `Km`)
in both the extractor and the ledger, so older records don't strand a
duplicate bucket.

## Where the data lives

Per `docs/DATA_RULES.md` §1–2, derived state stays in cache and durable facts
go to the database:

| Artifact                                    | Location                                         | Why                                      |
| ------------------------------------------- | ------------------------------------------------ | ---------------------------------------- |
| Running cumulative total                    | `data/cache/order-book-ledger/`                  | Derived — rebuildable from base + deltas |
| Concall text, PDF text, per-filing verdicts | `data/cache/...`                                 | Heavy, re-derivable                      |
| Each order win                              | `events` collection, `type: order-win`           | Dated market occurrence                  |
| Each concall-declared order book            | `events` collection, `type: order-book-declared` | Dated market occurrence                  |
| Per-run audit                               | `events` collection, `type: order-book-sync`     | Pipeline health                          |

These are new **types** on the existing `events` collection, not a new
collection — no whitelist changes needed. Written via
`lib/orderBookEvents.js`, with ids derived from the source document (`ssUrl` /
quarter) so a re-run updates in place rather than duplicating.

## Scheduled job

`packages/jobs-runtime/orderBookSync.js` (`yarn order-book-sync`) refreshes
every company on the Radar watchlist, daily at 21:00 — after the 20:00 digests
that also write `events`, and late enough for the day's filings to be
disseminated. Because the pipeline is cache-first, a company with nothing new
costs zero network calls.

`--force-recompute` re-judges cached concall verdicts against the current
extractor at no API cost; run it after changing extraction rules.

### `noOrderBookDisclosed` — the distinction that keeps the queue honest

A first run over Radar flagged 19 of 23 companies as needing an LLM, which is
far worse than the documented 30% miss rate. The cause was conflating two
different things:

- concall notes contain **no order-book bullet at all** — the company simply
  doesn't have an order book (order book is an EPC/defence/capital-goods
  concept; PERSISTENT, CARTRADE, MUTHOOTMF, SATIN never will). This is an
  answer, not a parsing failure.
- bullets exist but state no clean company-wide total — a genuine LLM case.

The first is now recorded as `noOrderBookDisclosed` and excluded from the
fallback queue. Without it, a daily job re-asks an unanswerable question about
the same 11 companies forever and an LLM tier burns tokens hunting for a
number that does not exist. After the fix Radar splits 11 not-applicable /
8 genuine fallbacks / 3 awaiting Stockscans annotation.

## Still out of scope

- **Execution burn-down.** The base is net of work already executed, but the
  deltas are gross, so between concalls the running total drifts slightly
  high. The next concall resets it. Subtracting interim revenue would need
  quarterly execution data this pipeline doesn't fetch.
- **Cross-checking concall figures against the investor-presentation slide**
  (the Stockscans synthesis layer is trusted as-is).
- **OCR for scanned filings.** None observed yet; they route to the LLM queue.
