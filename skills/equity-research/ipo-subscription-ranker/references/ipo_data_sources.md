# IPO Subscription Data Sources — reconciliation, formulas, and per-use-case decisions

Canonical write-up of a 2026-08-09 investigation into where IPO subscription-multiple
data can come from, why different sources disagree, and which source each skill in this
repo should use and why. Read this before touching any IPO subscription/scoring code —
several of the findings below overturn assumptions made earlier in the same investigation,
and the corrections are as important as the original findings.

## The four "independent" sources are one source

A user request to cross-validate `ipoplatform.com`, `chittorgarh.com`, `ipomatrix.com`,
and NSE's own site surfaced that the first three are **the same company**.
IPOPlatform's own page schema states `"parentOrganization": "Chittorgarh.com"`, and
Chittorgarh's site footer lists "Our Websites: IPOMatrix | Investorgain | IPO Platform".
**Only NSE is a genuinely independent source.** Do not treat agreement between
ipoplatform/chittorgarh/ipomatrix as cross-validation — it's one data pipeline with three
front-ends (and a fourth, investorgain, for GMP).

## Ground truth: Chittorgarh's published methodology (verified against ANAWIL)

Chittorgarh's subscription-status page for a closed IPO publishes the full offered/bid/
amount breakdown per category with explicit footnotes on what's included:

> *"the portion of anchor investors (or market makers) is not included in the total
> number of shares offered"* and *"Market Maker portion is not included to NII/HNI."*

Verified example — Anawil Wire & Engineering (SME, closed 2026-08-05):

| Category | Shares Offered | Shares Bid | Multiple |
|---|---|---|---|
| Anchor | 18,75,600 | 18,75,600 | 1x |
| Market Maker | 3,31,200 | 3,31,200 | 1x |
| QIB (Ex Anchor) | 12,50,800 | 20,58,34,800 | 164.56x |
| NII (= bNII+sNII) | 9,38,400 | 21,89,88,000 | 233.36x |
| bNII (>₹10L) | 6,25,600 | 18,07,37,200 | 288.90x |
| sNII (<₹10L) | 3,12,800 | 3,82,50,800 | 122.29x |
| Retail | 21,89,600 | 22,82,05,600 | 104.22x |
| **Total** | **43,78,800** | **65,30,28,400** | **149.13x** |

All multiples check out exactly as `Shares Bid / Shares Offered`. **This is the accepted,
publicly-cited methodology** (used by news outlets, brokers, and every retail-facing IPO
tracker) — QIB and Retail denominators exclude only what they naturally exclude (nothing
extra), while NII/bNII and Total additionally exclude both Anchor and Market Maker.

IPOPlatform's own **live** "subscription-status" combined table (the one
`ipoSubscriptionScanner.js` scrapes) matches this exactly — 149.13 / 164.56 / 122.29 /
288.90 / 233.36 / 104.22, byte for byte. **The live scanner's data source is correct.**

## The bug: IPOPlatform's per-IPO "detail" page (used by the historical cache)

IPOPlatform ALSO publishes a permanent per-IPO "subscription detail" page
(`ipo/subscription/<slug>/<id>`) with a JSON-LD `Table` — this is what `ipoBacktest.js`'s
`parseSubscriptionDetail()` and `ipoHistoryCache.js` have been reading all along, because
it's the only page that survives after an IPO drops off the live table (needed for
backtesting IPOs that closed weeks/months ago).

For the same Anawil IPO, this page reports: QIB 164.56x (✓ matches), sNII 122.29x
(✓ matches), Retail 104.22x (✓ matches) — but **bNII 189.24x, NII 172.75x, Total 138.72x**,
all *understated* relative to Chittorgarh's numbers. Root cause, found by comparing the
offered-share denominators: the detail page's bNII "Shares Offered" is 9,56,800, vs
Chittorgarh's 6,25,600 — a difference of exactly 3,31,200, the Market Maker allocation.
**IPOPlatform's detail-page parser folds the Market Maker quota into bNII's denominator**,
inflating it and understating bNII/NII/Total for every SME IPO it touches. Mainboard IPOs
have no Market Maker quota (it's an SME/NSE-Emerge-only mechanism), so this bug is
SME-specific — a mainboard detail page should not exhibit it, though this hasn't been
separately re-verified.

**Practical implication:** the live scanner (primary path) is unaffected; the historical
cache (weight-finding path) was corrupted for every SME IPO until this was found. See
"What changed as a result" below.

## NSE's own data (`ipo-detail` and `public-past-issues` APIs)

`https://www.nseindia.com/api/ipo-detail?symbol=<SYM>&series=<EQ|SME|BE>` returns
`bidDetails` (category-wise offered/bid counts) and `issueInfo.dataList` (free-text issue
metadata) for any NSE-listed IPO — reaching back to 2012 via
`https://www.nseindia.com/api/public-past-issues` (1,394 NSE-listed issues as of
2026-08-09), far beyond IPOPlatform's granular-data cutoff (~2025-09-24, confirmed
empirically — see `ipoBacktest.js`'s header).

Key findings, all verified against Chittorgarh's ANAWIL numbers:

1. **`series` parameter matters.** `series=EQ`/`SM`/`BE` silently DROP the retail category
   for SME IPOs and mis-sum Total as a result (Total = QIB + NII only, no Retail). Only
   `series=SME` returns the correct 3-category breakdown. Always pass the IPO's actual
   `securityType` from `public-past-issues` as the series.
2. **The offered-shares denominator is frequently blank for SME series** — `noOfSharesOffered`
   comes back `"0"` for every category on ANAWIL regardless of which series was tried. NSE's
   own `noOfTime` is therefore `0.00` and unusable. Mainboard (`EQ`) IPOs, by contrast,
   reliably DO carry a real offered figure (verified on Northern Arc Capital, Tata
   Technologies) — this bug is SME-specific.
3. **Applied/bid share counts are trustworthy and reconcile exactly** against Chittorgarh
   for QIB and Retail. NII/bNII/Total are each inflated by exactly the Market Maker's bid
   count (331,200 shares for ANAWIL) — NSE has no separate "Market Maker" line item in
   `bidDetails` at all; it's silently folded into the NII/bNII bucket (structurally, inside
   one of `2.1`'s sub-splits — the sub-splits sum to `2.1` exactly, so there's no visible
   seam to subtract it back out from `bidDetails` alone).
4. **A "subtract Total from sum-of-categories" trick to isolate Market Maker does NOT
   work on NSE's own data** — tested and falsified live (2026-08-09): NSE's Total already
   equals QIB+NII+Retail exactly (residual = 0), and NII's sub-splits sum to NII exactly
   (residual = 0). The 331,200-share Market Maker gap only becomes visible when diffed
   against an *external* reference (Chittorgarh's Total), which defeats using NSE alone.
5. **The Market Maker (and Anchor) quantity IS derivable from NSE's own response**,
   just not via arithmetic — it's in `issueInfo.dataList`'s "Issue Size" prose field:
   *"...Offer for Sale of up to 13,00,800 Equity Shares (Including Market Maker portion of
   3,31,200 Equity Shares and Anchor Allocation of 18,75,600 Equity Shares)"* — regex-
   extractable, and both figures matched Chittorgarh exactly on ANAWIL.
6. **A cleaner alternative to regex exists and is what this repo actually uses**:
   IPOPlatform's performance-tracker index API (`fetchPerformanceWindow()` in
   `ipoBacktest.js`, already fetched for every IPO regardless) carries clean structured
   numeric fields per category — `qib_shares_offered`, `qib_ex_anchor_shares_offered`,
   `anchor_investor_shares_offered`, `nii_shares_offered`, `bnii_shares_offered`,
   `snii_shares_offered`, `retail_shares_offered`, `market_maker_shares_offered` — verified
   present on multiple SME IPOs (Klassroom, Anawil). No regex, no prose parsing, no
   arithmetic-derivation trick needed; these are carried through to the cache as
   `sharesOfferedRaw` (see `ipoBacktest.js::baseRecordFields`).

## BSE's own data (two bid-detail endpoints, one of them almost missed)

BSE runs its own IPO bidding APIs, distinct from NSE's — relevant because ~650 IPOs in our
universe are BSE-only (no NSE listing at all, mostly BSE SME) and had zero coverage even
after the NSE merge above. Both endpoints require `referer: https://www.bseindia.com/` and
`origin: https://www.bseindia.com` headers (they 404 without — not real auth, just a
same-origin-ish check).

1. **List** — `https://api.bseindia.com/BseIndiaAPI/api/HomePage_Issues_BBS_Landing_ng/w?flag=2&scrip_Name=&end_dt=&IR_FLAG=IPO&Start_DT=`.
   `IR_FLAG=IPO` selects BSE's own "IPO" issue-type tag (other flags —`OTB`/`FPO`/`DPI`/
   `BuyBack`/`OFS`/`RI`/`REITS`— are different instrument types, confirmed excluded by the
   user). Empty date params return the FULL history in one call — 1,227 records, 2002-2026.
   Gives `Scrip_cd` (BSE's own INTERNAL record id — **not** the public BSE trading scrip
   code already stored in our IPOPlatform-derived cache; confirmed by direct comparison),
   `Scrip_Name`, `IPO_NO` (join key below), `Start_Dt`/`End_Dt`, `eXCHANGE_PLATFORM`.

2. **Bid detail (recent)** — `.../Pubissues_GetBkbldgCatdem_PAR_bbnew_ng/w?IPO_NO=<n>`,
   returns `table1`. **Only populated for ~2025+ IPOs** — every older `IPO_NO` tested (100
   through 7500) returned an empty `table1`. This was the ONLY endpoint used in the first
   pass of this investigation (2026-08-09 morning), and it made BSE look almost useless for
   historical backfill: only 143/1,227 records got real data, and after de-duplicating
   against companies IPOPlatform already covers, only 15 were genuinely new. Row schema:
   `SRNo`-keyed (1=QIB+1a-1d, 2=NII+2.1=bNII/2.2=sNII each with a/b/c sub-splits, 3=Retail,
   4=Employees, 5=Shareholders, 6=Policy Holders, untagged Total), `col3`=offered,
   `col4`=bid, `col5`=BSE's own precomputed multiple.

3. **Bid detail (historical)** — `.../Pubissues_GetBkbldgCatdem_ng/w?IPO_NO=<n>` (**no**
   `_PAR_bbnew_ng` suffix), returns a DIFFERENT table, `table2`. **Found only after the user
   pointed at IPO_NO=5761 (Aether Industries, a 2022 mainboard IPO) and noted it had data
   despite endpoint #2 being empty for it.** This is BSE's real historical archive — tested
   working across the full IPO_NO range down to ~2010 (real bid data starts appearing
   2010-01 in our cache; 2002-2009 is a genuine BSE-side gap, not a bug). Two row layouts:
   mainboard issues get the same 25-row schema as endpoint #2 (explicit 2.1/2.2 bHNI/sHNI
   split); SME issues get a 20-row schema with a single undifferentiated NII bucket
   (sub-split only into Corporates/Individuals/Others, no bHNI/sHNI breakdown at all from
   this endpoint alone).

**Data-quality caveat — partial-per-category, not all-or-nothing.** Even within endpoint
#3, sub-category `offered` (`col3`) is frequently blank while `bid` (`col4`) is populated —
e.g. Aether Industries had solid QIB/Retail/Total figures but its NII row showed `bid: 0`
(evidently a stale/partial BSE snapshot for that one category, not a universal gap). Per
explicit user instruction (2026-08-09): *"we need to skip only the ones which don't have
any data at all... consider partial or full data as per respective investor category."*
`bseIpoHistoryFetcher.js::parseBseBidDetails()` therefore computes every category
(QIB/NII/bHNI/sHNI/Retail/Employee/Shareholder/Total) independently and leaves any single
category `null` when its own offered-or-bid data is missing, rather than nulling the whole
record. A record's `hasData` is `true` if ANY category came out usable.

**Merge strategy**: both bid-detail endpoints are fetched for every `IPO_NO`; endpoint #3
(`_ng`, wide historical coverage) is the base layer, endpoint #2 (`_PAR_bbnew_ng`, narrow
but sometimes more granular) is layered on top and preferred specifically for bHNI/sHNI
when it has the explicit 2.1/2.2 split that endpoint #3's SME-schema lacks.

**The bNII-offered fix** (validated on G V Electricals, IPO_NO 7859): BSE's own displayed
`2.1` row `offered` figure is unreliable even when present — showed 300,000 vs the true
580,000 (confirmed against IPOPlatform's independently-published number). Fix: **always**
recompute `bniiOffered = niiOffered − sNiiOffered` when both are known, falling back to
BSE's own direct row only when the recompute isn't possible. Reproduces IPOPlatform's
163.59x exactly (BSE's own uncorrected 316.28x for that row is wrong and unused).

**Join-key caveat**: neither `Scrip_cd` nor `IPO_NO` has a counterpart field on
IPOPlatform's index API — this cache is joined to `ipo-history.json` by normalized company
name, disambiguated by listing-date proximity (≤45 days) when multiple BSE records share a
name (`ipoWeightFinder.js::findBseMatch()`).

**Net yield after the fix** (finding endpoint #3): 867/1,227 BSE records now have real bid
data (up from 143 with endpoint #2 alone), of which 503 are genuinely new to the
weight-finding sample (not already covered by IPOPlatform's granular data) — a 34x jump
from the initial 15-company estimate, and the single biggest source-discovery win of this
whole investigation. **Lesson**: when a vendor API returns suspiciously sparse historical
data, check for a sibling/legacy endpoint before concluding the data doesn't exist — BSE's
own site likely calls the newer endpoint for its live UI and the older one only for
archival lookups, so it's easy to miss without a specific pointer (as happened here).

## Decision matrix — which source for which use case

| Use case | Skill | Source | Rationale |
|---|---|---|---|
| Bulk daily scan / ranking | `ipo-subscription-ranker` | **IPOPlatform only** (live "subscription-status" table) | Validated byte-for-byte correct against Chittorgarh's published methodology; easy, fast, scales to many IPOs/day without per-symbol NSE/BSE cookie/rate-limit handling. NSE as fallback only if IPOPlatform data is missing/incomplete for a given IPO. |
| Single-IPO report | `drhp-ipo-analysis` | **IPOPlatform primary**, NSE as fallback/extra-granularity | Same reasoning — IPOPlatform's live table is the validated-correct, low-friction source for a freshly-closed IPO (which is always what this skill is scoring). NSE only needed if IPOPlatform genuinely lacks the data for that specific IPO. |
| Weight-finding (`ipoWeightFinder.js`) | secondary, not user-facing | **IPOPlatform + NSE + BSE merged** | IPOPlatform's granular data only exists from ~2025-09-24 (n≈137, too thin to fit 5 category weights confidently). NSE reaches back to 2012 (NSE-listed only); BSE reaches back to 2010 (fills in BSE-only/SME issues NSE never lists). Market Maker is deliberately NOT corrected out of the NSE-derived training records (per explicit instruction — directional correlation goal, not absolute accuracy) but IS corrected for BSE records (bNII fix above, cheap to apply and already validated). See `ipoWeightFinder.js::loadFlatRecords()`'s header for the exact 4-provenance join logic (`ipoplatform` / `nse-selfcomputed` / `nse-x-platform-offered` / `bse`). |

## Disclaimer text (bulk/scale outputs)

Per the decision above, `ipo-subscription-ranker`'s email/report output should carry a
visible note along these lines (already wired into `ipoDigestEmail.js`'s footer):

> Subscription figures are sourced from IPOPlatform's live tracker, cross-verified against
> Chittorgarh's published methodology (same data pipeline, both correctly exclude Anchor
> and Market Maker allocations from NII/HNI/Total denominators). NSE's own per-IPO data is
> used as a secondary/fallback source only, not for the primary daily ranking — see
> `references/ipo_data_sources.md` for the full source-reconciliation writeup if the
> numbers here ever look inconsistent with another site.

## What changed as a result of this investigation (2026-08-09)

- `nseIpoHistoryFetcher.js` (new) — builds `data/cache/nse-ipo-history.json`, backfilling
  NSE's `ipo-detail` for all 1,263 NSE-listed EQ/SME/BE issues from `public-past-issues`
  (1,257/1,263 successfully cached at time of writing). Self-computes `bid/offered` where
  NSE provides both (mainboard/BE — 476 companies); leaves it null where NSE's offered
  field is blank (SME).
- `ipoBacktest.js::baseRecordFields()` — added `sharesOfferedRaw` (the structured
  per-category offered-share fields from IPOPlatform's index API) to every cached record,
  used as the SME fallback denominator.
- `ipoWeightFinder.js::loadFlatRecords()` — now joins IPOPlatform's granular cache with
  the NSE cache, expanding the weight-finding eligible sample from 137 to 591 (137
  IPOPlatform-native + 400 NSE-self-computed + 54 NSE-bid/IPOPlatform-offered).
- `bseIpoHistoryFetcher.js` (new) — builds `data/cache/bse-ipo-history.json`, backfilling
  all 1,227 BSE-tagged IPOs from BOTH BSE bid-detail endpoints (merged, see "BSE's own
  data" above). 867/1,227 have real per-category data.
- `ipoWeightFinder.js::loadFlatRecords()` extended again — added BSE as a 4th, lowest-
  priority provenance (name+date-proximity join, `findBseMatch()`), further expanding the
  weight-finding eligible sample from 591 to **837** (137 IPOPlatform + 400
  NSE-self-computed + 54 NSE-bid/IPOPlatform-offered + 246 BSE). Eligibility criterion also
  loosened from "must have qibX" to "must have at least one granular category" — BSE
  partial records (e.g. totalSubscriptionX known but qibX not) are no longer discarded
  wholesale; `computeSubscriptionScore()`/`suggestWeights()` already null-filter per field.
- `lib/ipoScoring.js::SCORE_WEIGHTS_LISTING` / `SCORE_WEIGHTS_CAGR` — re-derived on the
  n=591 sample first, then again on the final n=837 sample (previously n=137/136). See
  `data/reports/rpt_ipo-weight-finder_global_*.json` for the underlying correlation tables
  (this report id is overwritten on each same-day re-run, so it always reflects the latest).
- **A correction to an earlier finding, replicated a third time**: the original n=137
  weight-finding run found the CAGR score predicted large-issue IPOs (median ~₹631cr) far
  better than small ones (r=0.426 vs r=0.119) and added a `cagrConfidence: 'LOW'` flag for
  small/SME issues on that basis. The n=591 NSE+IPOPlatform re-run **reversed the
  direction** (small r=0.209, large r=0.125). The final n=837 NSE+IPOPlatform+BSE re-run
  showed a THIRD pattern: for listing gain, large issues now correlate far stronger
  (r=0.595 vs r=0.194); for CAGR, small and large stayed close (r=0.186 vs r=0.148). Three
  re-runs, three different pictures — this is conclusive evidence the size-split finding is
  simply unstable across sample composition, not a real effect at any scale tried so far.
  `computeDualScores()`'s `cagrConfidence` stays neutralized (always `'NORMAL'`) rather than
  pointing at an unreplicated (now actively falsified) finding. **Methodological lesson**:
  don't trust a split-sample or subgroup finding from a single window without attempting to
  replicate it — and if the first replication also looks strong, run a third check on an
  independently-different sample before concluding anything is stable. This is the same
  category of mistake as the earlier daily-vs-weekly-CAGR sample-composition bug found
  and documented in `ipo_ranking_framework.md`.
