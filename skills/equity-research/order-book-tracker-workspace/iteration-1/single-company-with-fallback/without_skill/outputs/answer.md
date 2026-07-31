# VA Tech Wabag (NSE:WABAG) — Order Book as of 31 Jul 2026

## Short answer

**Declared on the last concall: ₹17,200 Cr** (Q4/FY26 call, backlog as of 31-Mar-2026).

**Since then: 5 order wins.** WABAG does not disclose order values — it discloses a
size _band_ for every order. Those bands put the new wins at **roughly ₹2,400–4,700 Cr**,
so the current gross order book is **~₹19,600–21,900 Cr**, with a central estimate
around **₹20,700 Cr**.

**Execution runway on the new wins: 21 months to about 4.5 years of EPC**, clustered
at 36 months because the two biggest wins both carry 36-month schedules. O&M annuity
tails run much longer — out to 2034, 2036 and 2043 respectively.

One important caveat up front: the automated pipeline in this repo returns a precise-looking
₹17,486.47 Cr for WABAG. **That number is wrong.** The details are in the last section, and
they matter because WABAG is a company the pipeline currently cannot read.

---

## The declared base

|            |                                       |
| ---------- | ------------------------------------- |
| Figure     | **₹17,200 Cr** order backlog          |
| Source     | Q4/FY26 concall (quarter `202603`)    |
| As of      | 31-Mar-2026                           |
| Confidence | High — stated as a clean bolded total |

Supporting colour from the same call:

- Order intake ₹7,500 Cr for the year, up 31.5% YoY
- O&M backlog ₹6,500 Cr, about 40% of the total
- Net cash ₹950 Cr, up 35% YoY
- Management framed the backlog as **"over four years of revenue coverage"**

---

## What they've won since

WABAG's Reg-30 filings state a classification band, never a number. Their published bands:

| Band   | Domestic (₹ Cr) | International (USD Mn) |
| ------ | --------------- | ---------------------- |
| Small  | up to 100       | up to 10               |
| Medium | 100–250         | 10–30                  |
| Large  | 250–600         | 30–75                  |
| Major  | 600–1,000       | 75–150                 |
| Mega   | above 1,000     | above 150              |

At USD/INR 95.5, the five wins:

| Date   | Win                                             | Band             | Value (₹ Cr) | EPC              | O&M          |
| ------ | ----------------------------------------------- | ---------------- | ------------ | ---------------- | ------------ |
| 22 May | Delhi Jal Board — 17 MGD WWTP, Mitraon (DBO)    | Medium, domestic | 100–250      | 21 mo → Feb 2028 | 15 yr → 2043 |
| 09 Jun | Ajman Sewage Biorefinery Ph-3, UAE — 60 MLD STP | Large, intl      | 287–716      | 24 mo → Jun 2028 | —            |
| 19 Jun | Doha SWRO Stage II, Kuwait — 60 MIGD (~272 MLD) | **Mega**, intl   | 1,433+       | 36 mo → Jun 2029 | 5 yr → 2034  |
| 01 Jul | Donauinsel Water Works, Vienna — ~86 MLD        | Large, intl      | 287–716      | to 2030          | —            |
| 20 Jul | BWSSB Bengaluru — 100 + 60 MLD STP, 25 MLD TTP  | Large, domestic  | 250–600      | 36 mo → Jul 2029 | 7 yr → 2036  |

**Total: ₹2,356 Cr at every band floor; ~₹4,670 Cr at band ceilings** (taking Kuwait at
USD 250 Mn — the Mega band is open-ended, so the true ceiling is unbounded). Central
estimate **~₹3,500 Cr**. Together the wins add roughly **600 MLD of treatment capacity**.

Two things drive most of the uncertainty. The Kuwait Doha SWRO order is the single
biggest swing factor: "Mega" only tells you it exceeds USD 150 Mn. And both Kuwait
and Ajman are executed through a JV/consortium, so WABAG's economic share is not
separately disclosed.

### Current order book

|                             | ₹ Cr                         |
| --------------------------- | ---------------------------- |
| Declared base (31-Mar-2026) | 17,200                       |
| New wins (low / mid / high) | +2,356 / +3,513 / +4,670     |
| **Gross order book**        | **19,556 / 20,713 / 21,870** |

This is _gross_ — it doesn't net out the four months of execution since 31-Mar. At the
implied run-rate (₹17,200 Cr over "four-plus years" ≈ ₹1,075 Cr a quarter), roughly
**₹1,400 Cr has been burned down** but not yet reflected. The net book is therefore
more likely **~₹18,100–20,400 Cr**. The Q1 FY27 concall will reset this cleanly.

---

## Execution runway

**On the whole book:** management's own framing is over four years of revenue coverage,
and the new wins extend rather than compress that — inflow since 31-Mar (~₹3,500 Cr
central) is running ahead of the ~₹1,400 Cr executed in the same window.

**On the new wins specifically:**

- **Shortest:** Delhi Jal Board at 21 months (~Feb 2028)
- **Longest:** Vienna, with commissioning stated as calendar-2030 (~4 to 4.5 years)
- **Value-weighted centre: about 34–36 months.** This is the number that matters — the
  two largest wins (Kuwait Mega, BWSSB Large) both run 36-month EPC schedules, so most
  of the new rupee value converts to revenue over FY27–FY30 rather than near-term.

The practical read: none of these wins is a quick burn. Revenue recognition is
back-weighted into FY28–FY30, with Vienna trailing furthest.

**O&M tails go much further out.** Three of the five carry long annuity periods after
commissioning — 5 years on Kuwait (to ~2034), 7 years on BWSSB (to ~2036), and 15 years
on Delhi Jal Board (to ~2043). This is consistent with the mix disclosed on the concall,
where O&M was already ~40% of backlog, and it means the reported order book increasingly
represents low-risk annuity revenue rather than pure EPC.

---

## Why the pipeline's number can't be used here

I ran `getCompanyOrderBook.js NSE:WABAG`. It returned a cumulative of **₹17,486.47 Cr**
and looked clean. Checking each extraction against the cached filing PDFs, four of the
five values are wrong and a fifth filing isn't an order at all.

**Every WABAG filing prints the band table above at the foot of the page. The extractor
read numbers out of that table.**

| Date   | Pipeline said | It actually matched                                 | Reality          |
| ------ | ------------- | --------------------------------------------------- | ---------------- |
| 01 Jul | ₹7.5 Cr       | `"o 75 million"` — the _30 to 75_ cell              | USD 30–75 Mn     |
| 09 Jun | ₹7.5 Cr       | `"o 75 Million"` — same cell                        | USD 30–75 Mn     |
| 19 Jun | ₹15 Cr        | `"D 150 million"` — the _75 to 150_ cell            | above USD 150 Mn |
| 22 May | ₹250 Cr       | `"Rs. 250 Crores"` — the footnote defining _Medium_ | ₹100–250 Cr      |

Note the compounding error on the international ones: "75 million" from a **USD** row was
converted as if it were rupees (75 Mn INR = 7.5 Cr). A USD 30–75 Mn order was booked at
₹7.5 Cr — off by roughly two orders of magnitude.

**A GST tax demand was booked as an order win.** The 19 Jun filing titled
"Intimation For Receipt Of Order From GST Authorities" is a demand order from the
Principal Commissioner of Central Tax, Bengaluru East, rejecting WABAG's rectification
application for FY2019-20 under Sec 73 of the CGST Act. The classifier matched on
"Receipt Of Order" and booked the demand amount of ₹5,71,22,863 as ₹6.47 Cr of new
orders. It's a liability, not a win.

**A timeline was misread.** The Delhi Jal Board win was recorded with a 180-month
window ending 2041. That 15 years is the post-commissioning O&M period; the EPC schedule
is 21 months. The extractor took the longest duration in the document rather than the one
answering Annexure row (f).

**The one filing the pipeline flagged as unresolved was the honest outcome.** The BWSSB
win went to `pendingLlmFallback` because no value could be found — correctly, since the
filing states only "Large*". I've resolved it as the band (₹250–600 Cr) rather than
inventing a point estimate, and deliberately have *not\* written it back via
`recordAnnouncementResolution`, because that store is never re-queried once written and
baking a guess into it permanently would be worse than leaving it flagged.

### What needs fixing

1. **Exclude the band table from value extraction.** It appears verbatim in every WABAG
   filing and is a reliable false-positive generator. It should be stripped before the
   value regex runs, or the extractor should be scoped to Annexure row (g).
2. **Add currency awareness.** "USD Millions" versus "INR Crores" is stated in the row
   header and is currently ignored.
3. **Tighten the order-win classifier** so tax, regulatory and litigation orders don't
   match on the word "order". A title containing "GST", "Tax Authorities", "Commissioner"
   or "demand order" should be excluded.
4. **Support band-only disclosure as a first-class outcome.** WABAG is not an edge case —
   several EPC issuers disclose only a size class. The ledger currently assumes every
   resolved win is a point value; it needs a `valueLowCr`/`valueHighCr` representation so a
   band doesn't have to be faked into a number.
5. **Scope the timeline extractor to Annexure row (f)** and separate EPC duration from the
   O&M tail rather than taking the longest duration present.
6. **Purge and rebuild WABAG's durable state.** The run persisted 5 `order-win` events and a
   ledger cumulative of ₹17,486.47 Cr built on these bad values. I left them in place
   rather than hand-editing the events store, but they should be cleared once the
   extractor is fixed.

---

## Sources

All figures trace to cached artifacts in this repo:

- Base: `data/cache/concall-notes/NSE:WABAG/202603.json`
- Filings: `data/cache/announcement-pdf-text/NSE:WABAG/*.json` (all 6, text layer, none scanned)
- USD/INR 95.5 as of 31-Jul-2026
