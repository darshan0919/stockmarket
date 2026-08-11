# NSE/BSE historical bulk/block deals + IPOPlatform anchor-investor API notes

Written alongside `anchorBulkDealTracker.js` (2026-08-10), per
`skills/_shared/conventions.md` §13 — schemas below back that script's data
fetches. Update this doc in the same change if any of these shapes drift.

## NSE `/historicalOR/bulk-block-short-deals` (confirmed live 2026-08-10)

**First guess was wrong, corrected same day.** The initial implementation
guessed a plain `/api/historical/bulk-deals` route (pattern-matched from
nseindia.com's own bulk-deals page, never live-tested — this sandbox couldn't
reach nseindia.com via raw `curl` to check). Once the script ran for real and
every NSE call came back `503`, it was tempting to blame NSE's bot gate — but
`nse.getLargeDeals()` and `nse.getSastReg29()` (confirmed-working endpoints,
same `NseSession`, same cookie warmup) succeeded fine in the same process, so
the `503` was specific to that one guessed path, not a network/IP block.
Probing sibling paths under NSE's `historicalOR` namespace (same family as
`getPriceVolumeDeliverable`'s `generateSecurityWiseHistoricalData`) found
`/historicalOR/bulk-block-short-deals` returning `500` instead of `404` —
i.e. a real route rejecting the request shape, not a dead one — which pointed
at a missing/misnamed param. Swapping the guessed `type` param for
`optionType` (`bulk_deals` / `block_deals`, lowercase-with-underscore) got a
`200` with real data back.

- `GET https://www.nseindia.com/api/historicalOR/bulk-block-short-deals?optionType=bulk_deals&from=DD-MM-YYYY&to=DD-MM-YYYY[&symbol=SYM]`
  (`optionType=block_deals` for block deals; same path, same params otherwise)
- Response: `{ data: [ { BD_DT_DATE, BD_DT_ORDER, BD_SYMBOL, BD_SCRIP_NAME,
  BD_CLIENT_NAME, BD_BUY_SELL, BD_QTY_TRD, BD_TP_WATP, BD_REMARKS } ] }`.
  `BD_DT_DATE` is `DD-MON-YYYY` (e.g. `03-AUG-2026`); `BD_DT_ORDER` is a full
  ISO timestamp, one calendar day earlier at 18:30 UTC (`T-1 18:30Z` = trade
  date's own midnight IST — an NSE timezone-encoding quirk, not a data bug).
  **Field names are entirely different from `getLargeDeals()`'s
  `BULK_DEALS_DATA` rows** (`date`/`symbol`/`name`/`clientName`/`buySell`/
  `qty`/`watp`, no prefix) — these are two separate NSE backends serving
  overlapping data (today-only snapshot vs. date-range history), not the same
  endpoint with a date param added. `anchorBulkDealTracker.js`'s
  `normalizeNseRow()` maps the `BD_`-prefixed shape; don't assume the two are
  interchangeable if reusing either client method elsewhere.
- No ₹ value field — compute as `BD_QTY_TRD × BD_TP_WATP`.
- `symbol` param name is unconfirmed for a single-symbol filter (never
  exercised — `anchorBulkDealTracker.js` always calls unfiltered and matches
  client-side); spot-check before relying on it.

## BSE `BulkDealData_ng/w` (confirmed live — reused, not new)

Already documented at `stock-api/src/clients/BseClient.js:130` and exercised
daily by `dealsDigest.js`. No changes made here; `anchorBulkDealTracker.js`
calls `BseClient.getBulkBlockDeals('bulk'|'block', fromDate, toDate)`
unfiltered (`sc_code=''`) the same way `dealsDigest.js` does, then filters
client-side.

## IPOPlatform `#anchor-investors` table (per-IPO detail page)

**Status: confirmed live 2026-08-10** against
`https://www.ipoplatform.com/ipo/aegeus-technologies-ipo/4561` (and the shape
holds across other detail pages spot-checked the same day).

- `GET https://www.ipoplatform.com/ipo/<chittorgarh_slug>/<id>` (HTML, server-rendered)
- Locate `<div class="idv2-section" id="anchor-investors">...</table>`; the
  table has no `id` attribute (unlike the "Closed IPOs"/"Subscription Status"
  tables IPOPlatform uses elsewhere, which do), only classes
  (`idv2-anchor-table` etc.) — extract rows directly from the section's
  `<tbody>`, not by table id.
- Columns: `Anchor Investor` (name, links to
  `/anchor-investor/<investor-slug>/<investor-id>`) | `No. of shares Allotted`
  | `Offer Price (in ₹.)` | `Amount Invested (in ₹.)`.
- IPOs with **zero** anchor participation (most SME issues) render the
  section with an empty `<tbody>` — this is a genuine "no anchor round", not
  a parse failure; `parseAnchorInvestors()` returns `[]` and the caller
  treats that as `anchorParticipated: false`, not an error.
- This is IPOPlatform's own per-investor allocation table — **not** the same
  data as the official NSE/BSE "Anchor Investor Intimation" circular filed
  before listing (a PDF corporate announcement). The circular is the more
  authoritative primary source and is a documented follow-up if IPOPlatform's
  table is ever found to be incomplete/stale for a given IPO; not implemented
  here (out of scope for the first cut of `anchorBulkDealTracker.js`).

## IPOPlatform vs Chittorgarh — anchor-investor data (POC, 2026-08-10)

**Verdict: switched `anchorBulkDealTracker.js` to chittorgarh.com as the
primary anchor-investor source, IPOPlatform kept as a fallback.** Do NOT
replace IPOPlatform everywhere else in this repo — the POC below only covers
the anchor-investor table specifically; the performance-tracker index
(`fetchPerformanceWindow` in `ipoBacktest.js`) and the closed-IPO/subscription
tables (`ipoSubscriptionScanner.js`) were NOT re-verified against chittorgarh
and should not be assumed covered by this finding.

**Why chittorgarh wins for anchor investors, concretely:** in a live 3-month
re-run (2026-05-10 to 2026-08-10), switching the anchor-investor source from
IPOPlatform's own `#anchor-investors` table to chittorgarh's `#AnchorTable`
(same underlying company, `chittorgarh_id` already present on every
IPOPlatform performance-tracker row) took anchor-data coverage from 31/79
IPOs to 52/79, and the downstream bulk-deal-reappearance match count from
6 to 13 IPOs. 51 of those 52 came from chittorgarh; only 1 needed the
IPOPlatform fallback. Chittorgarh's table is also structurally richer per
row — it splits "Anchor" (the specific scheme, e.g. "QSIF EQUITY EX-TOP 100
LONG-SHORT FUND") from "Group Entity" (the parent AMC, e.g. "QUANT MUTUAL
FUND"), which IPOPlatform's table doesn't carry at all. That parent-entity
name turned out to matter for THIS script specifically: bulk-deal
`clientName` strings more often use the AMC/parent name than the specific
scheme name, so `crossReferenceIpo()` now tries both and keeps whichever
scores higher (`matchedOn: 'groupEntity'|'anchorName'` on each match).

Concrete example that motivated this: Caliber Mining and Logistics Limited
(NSE:CMLL) — IPOPlatform's detail page has an "Anchor Investor Shares
Offered" quota number but genuinely no `#anchor-investors` table (empty
section, not a parse bug), so the original run silently skipped it entirely.
Chittorgarh's page for the same IPO
(`chittorgarh.com/ipo_subscription/caliber-mining-and-logistics-ipo/1999/`)
has the full 10-investor breakdown with shares/amount/%allocated per entity.

**Chittorgarh access pattern:** `https://www.chittorgarh.com/ipo_subscription/<any-slug>/<chittorgarh_id>/`
— confirmed live that the slug is decorative only (requesting a deliberately
wrong slug with the correct id returns the identical 200 page), so no
separate chittorgarh-side name/slug resolution is needed; `chittorgarh_id`
already ships on every IPOPlatform performance-tracker row used to build the
IPO universe. `parseChittorgarhAnchorInvestors()` reads `table#AnchorTable`'s
`<tbody>` directly (no `id` needed via `extractTableRows`, same reasoning as
IPOPlatform's own anchor table). A trailing "Total" summary row in the same
`<tbody>` has only 5 `<td>`s (no row-number, no Group Entity column) instead
of the data rows' 7 — filtered out by requiring `cells.length >= 7 && cells[0]`.

**What I did NOT verify (real gaps in this POC, not resolved yet):**
- No chittorgarh equivalent was found for IPOPlatform's paginated
  `main-board/index` JSON API (the backbone of `fetchPerformanceWindow` —
  date-windowed, auto-paginating, ~90 structured fields per IPO including
  financials, subscription multiples, symbols). Chittorgarh's own IPO
  dashboard page (`chittorgarh.com/ipo/ipo_dashboard.asp`) is server-rendered
  HTML with only ~20 rows (current/upcoming IPOs, not a queryable historical
  range) and no obvious DataTables/ajax JSON endpoint in a quick scan — a
  full migration off IPOPlatform would need either finding that endpoint (if
  it exists) or a much heavier per-IPO-page scrape to rebuild the same
  universe, which wasn't attempted here.
- IPOPlatform's own "Closed IPOs" and "Subscription Status" tables (used by
  `ipoSubscriptionScanner.js`, unrelated to `anchorBulkDealTracker.js`)
  weren't compared against a chittorgarh equivalent at all.
- Worth noting: IPOPlatform's own page schema self-identifies
  `"parentOrganization": "Chittorgarh.com"` (see
  `skills/equity-research/ipo-subscription-ranker/references/ipo_data_sources.md`)
  — the two sites are related/same-data-pipeline, which is consistent with
  IPOPlatform's index API being a convenient JSON front-end over
  substantially the same underlying data chittorgarh's HTML pages show, not
  two independent data sources that could silently disagree.

## IPOPlatform performance-tracker index (reused, not new)

`fetchPerformanceWindow({fromDate, toDate, ipoType})` in `ipoBacktest.js` —
already documented there — is the universe source `anchorBulkDealTracker.js`
reuses for "which IPOs listed in [from,to]". Confirmed fields used by the new
script: `id`, `company_name`, `ipo_year` (listing date, `YYYY-MM-DD`),
`chittorgarh_slug`, `nse_script_symbol`, `bse_script_code`.
