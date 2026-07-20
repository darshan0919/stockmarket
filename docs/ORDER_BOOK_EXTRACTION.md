# Order Book Extraction — cache-first, script-first pipeline

Status: value + unit extraction from concall notes AND order-win
announcements is built and validated, wired into a per-company cumulative
ledger that is fully cache-first (nothing is ever parsed twice — see
"Cache-first architecture" below). Execution-timeline extraction remains out
of scope (see bottom).

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

| Outcome | Count | % |
|---|---|---|
| Clean deterministic extraction | 17 | 63% |
| Correctly flagged ambiguous (2 disagreeing totals) | 2 | 7% |
| No total found → LLM fallback needed | 8 | 30% |

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

| File | Role |
|---|---|
| `lib/concallNotesStore.js` | `getOrderBook()`/`saveOrderBook()` — the extraction result lives ON the concall-note record it came from, never a separate file that could drift out of sync |
| `lib/orderAnnouncementExtractor.js` | Classifies + extracts a single announcement. Title match (`Award_of_Order_Receipt_of_Order` — a fixed SEBI Reg-30 filing category, mined live) is the free, reliable classifier; value comes from a `Rs./₹ X Cr` regex over title+description |
| `lib/orderAnnouncementStore.js` | Permanent per-announcement cache. `unresolved(companyId)` recomputes the pending-LLM-fallback list FROM DISK every call — not "seen this run" — so an unresolved item is never silently lost once the watermark moves past its date (a real bug caught during validation, see below) |
| `lib/orderBookLedger.js` | `setBase()` (new concall → replaces base, resets applied-announcements since the new base already reflects them), `applyAnnouncement()` (idempotent — a re-applied `ssUrl` is a no-op), `advanceWatermark()`, `recompute()` (cumulative is ALWAYS derived from base + deltas, never hand-set) |
| `scripts/orderbook/getCompanyOrderBook.js` | Orchestrator — the one entry point a skill calls: `ensureBase()` then `processNewAnnouncements(sinceDate)` |

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
  `pendingLlmFallback` for announcements seen *in that call*. Once the
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

## Out of scope for this pass

- Execution-timeline extraction (deferred, per 2026-07-19 conversation).
- PDF-body text extraction for announcements (see above).
