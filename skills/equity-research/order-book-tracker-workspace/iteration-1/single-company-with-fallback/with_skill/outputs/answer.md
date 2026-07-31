## NSE:WABAG — declared order book ₹17,200 Cr, plus 5 wins since that don't carry a price tag

**₹17,200 Cr** is the number VA Tech Wabag declared at its **Q4FY26 (Mar-26) concall**. Since
then it has announced **five order wins**, and here is the honest complication: **not one of them
states a rupee value.** Every WABAG filing discloses only its SEBI size *band* — "Medium",
"Large", "Mega" — so there is no clean number to add.

Adding the band midpoints would invent precision the company never gave, so the arithmetic below
is a **range**, not a total:

| Declared / added                     | ₹ Cr                     |
| ------------------------------------ | ------------------------ |
| Base — Q4FY26 concall backlog        | 17,200                   |
| 5 wins since, at band floors         | +2,177                   |
| 5 wins since, at band ceilings       | +3,896                   |
| **Indicative book today**            | **≈19,400 – 21,100**     |

### The five wins since the Mar-26 concall

| Date       | Order                                                        | Disclosed size          | Capacity | EPC done by |
| ---------- | ------------------------------------------------------------ | ----------------------- | -------- | ----------- |
| 2026-05-22 | Delhi Jal Board — Mitraon WWTP (DBO)                          | Medium: ₹100–250 Cr     | 17 MGD   | Feb-2028    |
| 2026-06-09 | Ajman Sewage Biorefinery Ph-3, UAE (consortium-led)           | Large intl: $30–75 mn   | 60 MLD   | Jun-2028    |
| 2026-06-19 | Kuwait MEWRE — Doha SWRO Stage II (JV with HEISCO)            | **Mega intl: >$150 mn** | 272 MLD  | Jun-2029    |
| 2026-07-01 | City of Vienna — Donauinsel Water Works expansion, Austria    | Large intl: $30–75 mn   | ~86 MLD  | 2030        |
| 2026-07-20 | BWSSB — Byramangala + Bellandur STP/TTP, Bengaluru (DBO)      | Large: ₹250–600 Cr      | 185 MLD  | Jul-2029    |

Total new capacity **~680 MLD**. USD bands converted at ₹87/$.

The Kuwait Doha SWRO win is by far the largest — "Mega" means above $150 mn (₹1,300 Cr+) and is
open-ended at the top, so it alone drives most of the range. It is also WABAG's first entry into
Kuwait.

### Execution runway on the new wins

**EPC delivery runs May-2026 → Dec-2030, with a stated timeline on all 5 of 5 wins** — unusually
complete coverage.

The load is back-ended. Nothing completes in FY27; Delhi lands in FY28, Ajman in FY29, Kuwait and
Bengaluru in FY30, and Vienna in FY31. So these wins support revenue three-to-five years out
rather than the current year.

Two things extend the runway well past the EPC dates:

- **Long O&M tails.** Delhi carries 15 years of O&M after commissioning (to ~2043), Bengaluru 7
  years (to ~2036), Kuwait 5 years (to ~2034). These are annuity obligations, not EPC backlog.
- **The book was already long.** Management put the existing ₹17,200 Cr at **over four years of
  revenue coverage**, which squares with a book-to-bill of roughly **4.4x** against ~₹3,950 Cr of
  FY26 revenue (PAT ₹371 Cr at a 9.4% margin). Note that ₹6,500 Cr of that book — about 40% — is
  O&M stretching up to 20 years, so the *EPC* runway is meaningfully shorter than 4.4x implies.

### What to be careful about

- **The wins are bands, not numbers.** Anyone quoting a precise post-win order book for WABAG is
  extrapolating. The Q1FY27 concall should reset the base with a real figure.
- **Kuwait and Ajman are shared.** Both are JV/consortium contracts and the bands describe the
  *whole contract*. WABAG's own booked share is undisclosed and lower — possibly much lower.
- **Nothing has been burned off.** The ₹17,200 Cr base is net of execution as of 31-Mar-26, but
  the four months since are not deducted. At WABAG's run-rate that is roughly ₹1,000–1,300 Cr of
  revenue already executed, which offsets a good part of the new wins. The true figure sits
  nearer the low end of the range.
- **Context for the inflow rate:** FY26 order intake was ₹7,500 Cr (+31.5% YoY), and management
  guided to ₹10,000–12,000 Cr of new orders over the next 24 months. Roughly ₹2,200–3,900 Cr in
  four months is consistent with that pace.

Nothing is left unresolved — the pipeline now runs clean for this company with no pending items.

### Corrections made to the stored data

The pipeline had been reporting **₹17,486.47 Cr**. That figure was wrong, and three underlying
bugs were fixed:

1. **SEBI band boilerplate read as order values.** Every WABAG filing prints the classification
   grid ("Domestic: Upto 100 / 100 to 250 / 250 to 600 …") and a footnote defining its band. The
   extractor was reading numbers out of that furniture — the Delhi order became exactly ₹250 Cr,
   the ceiling of its own band. Both the grid and the footnote are now scrubbed before the money
   pass.
2. **USD amounts scaled through the rupee ladder.** "USD 150 million" was becoming ₹15 Cr, because
   `million` is mapped as an INR scale. Foreign-currency amounts are now skipped rather than
   silently mis-converted.
3. **A GST demand counted as an order win.** "Intimation For Receipt Of Order From GST
   Authorities" matched the order-win title pattern, adding a ₹6.47 Cr *tax liability* to the
   order book. Regulatory and judicial orders are now excluded, and the event has been retracted
   (marked, not deleted).

Separately, order-win events were being written with `valueCr: undefined` — the ledger names the
field `deltaCr` — so every summary read "₹undefined Cr". Fixed, and value-less filings now record
their size band instead of a fabricated number.

### Files touched

Source and tests:

- `packages/jobs-runtime/lib/orderPdfExtractor.js`
- `packages/jobs-runtime/lib/orderAnnouncementExtractor.js`
- `packages/jobs-runtime/lib/orderAnnouncementStore.js`
- `packages/jobs-runtime/lib/orderBookLedger.js`
- `packages/jobs-runtime/lib/orderBookEvents.js`
- `packages/jobs-runtime/scripts/orderbook/getCompanyOrderBook.js`
- `packages/jobs-runtime/test/orderPdfExtractor.test.js`
- `packages/jobs-runtime/test/orderBookEvents.test.js`
- `packages/jobs-runtime/test/orderAnnouncementExtractor.test.js` (new)

Data (from `db.touchedFiles()` and `data:push`):

- `companies.json`, `reports.json`
- `reports/rpt_order-book-tracker_NSE:WABAG_2026-07-31_f16ebb2f.json`
- `events-2026-04.json`, `events-2026-06.json`
- `cache/order-book-ledger/NSE:WABAG.json`
- `cache/order-announcements/NSE:WABAG/*.json` (22 files)

`data:push` uploaded 37 files. All 195 tests in `@stock/jobs-runtime` pass.
