# Stockscans API — payload/response schemas

Single source of truth for every Stockscans endpoint this repo calls, so nobody
has to paste sample payloads into a prompt again. All calls go through
`stock-api/src/clients/StockscansClient.js` — treat that file's JSDoc as the
canonical per-method reference and this doc as the payload/response shapes
behind it. When a new field or gotcha is confirmed live, update BOTH the
client's JSDoc and this file in the same change.

Base URL: `https://www.stockscans.in`. Auth: `authtoken` cookie
(`STOCKSCANS_AUTH_TOKEN` env var), injected via `StockscansAuth`/`_headers()`.

**Universal document convention:** any record carrying an `ssUrl` (or a
variant — `transcriptSsUrl`, `resultSsUrl`, `pptSsUrl`) resolves to a
viewable/downloadable document at:

```
https://www.stockscans.in/document/<ssUrl>
```

This applies to every document type (Transcript, Result, PPT, Annual Report,
Recording), not just concalls.

---

## POST /api/company/announcements/scan

Client method: `scanAnnouncements(payload, opts)`. Confirmed live 2026-07-31.

**Request:**

```json
{
  "scan": {
    "scanId": "59822b15a2859d183df3770d",
    "scanName": "Recordings",
    "filters": [],
    "industry": [],
    "index": [],
    "watchlistIds": [],
    "searchFilters": [],
    "announcementType": "Earnings Call",
    "alerts": false,
    "searchMode": "full",
    "companyIds": [],
    "companyFilters": []
  },
  "offset": 0,
  "quarterDate": "202609"
}
```

Notes:

- **`scan.scanId` / `scan.scanName` are REQUIRED on every call, even ad-hoc
  ones — CORRECTED 2026-08-06.** Omitting them returns HTTP 400
  `{"message":"Field required","status":"error"}`. Earlier text in this doc
  said they could be omitted for an ad-hoc scan; that was never actually
  verified and is wrong. For ad-hoc (non-saved) scans, reuse the same
  constants the "Recordings" scan uses —
  `scanId: '59822b15a2859d183df3770d'`, `scanName: 'Recordings'`
  (`DEFAULT_SCAN_ID`/`DEFAULT_SCAN_NAME` in `stock-api/src/utils/bulkAnnouncementScan.js`)
  — they appear to be accepted as an arbitrary/placeholder scan identity
  rather than actually scoping to that saved scan's filters.
- `scan.watchlistIds` is the standard way to scope an ad-hoc scan to an
  arbitrary companyId list (create a throwaway watchlist, pass its id here,
  delete the watchlist after). `scan.companyFilters` is capped at 10 unique
  companyIds server-side (HTTP 400 above that) — prefer `watchlistIds` for
  anything bigger.
- The quarter filter is the **top-level** `quarterDate` field, format
  `"YYYYMM"` (calendar quarter-end month/year, e.g. `"202609"` = Jul-Sep
  2026). There is no per-item `date` or `documentType` filter in this
  request — filtering by document type happens by reading the response's
  `ssUrl` fields, not by a request param.
- `announcementType: "Earnings Call"` is how you scope to concall-related
  announcements (recordings, transcripts). Other values exist for other
  announcement categories (order wins, preferential issues, etc. — see
  `announcement-keyword-explorer` skill for the fuller catalog).
  **CONFIRMED 2026-08-06: `announcementType` is a real server-side enum with
  exactly 5 values**, matching the Stockscans UI's own filter dropdown:
  `"All"`, `"Financial Results"`, `"Earnings Call"`, `"Presentation"`,
  `"Annual Report"`. An earlier probe in this doc incorrectly guessed values
  like `"Investor Presentation"` — those aren't real enum members and got
  silently treated as `"All"` before `scanId`/`scanName` were understood to
  be required (once those were added, guessed values still returned the
  unfiltered set rather than erroring — the endpoint appears to silently
  ignore an unrecognized `announcementType` rather than reject it). Use
  `"Presentation"` to bulk-fetch PPT documents and `"Financial Results"` to
  bulk-fetch Result documents (both live-tested: `"Presentation"` returned
  only Investor Presentation announcements, `"Financial Results"` returned
  only board-meeting/results-outcome announcements, for a 2-company
  watchlist at `quarterDate: "202603"`). This is the confirmed bulk path
  used by `guidance-document-extractor` for Transcript+PPT+Result together
  at historical quarters (no separate `resultsDocuments`-style bulk endpoint
  exists for historical quarters — `resultsDocuments` only covers the
  current results season). A light client-side description-prefix check is
  still applied downstream as a sanity filter, since the enum bucket for
  "Financial Results" was observed to include adjacent categories like
  "Outcome of Board Meeting".
- Paginated — advance `offset` by the number of items in the previous page
  until it's empty or `offset + page.length >= total`.

**Response (shape used by this repo):** items carry a `companyId` and an
`ssUrl` (sometimes under `transcriptSsUrl` depending on the announcement
subtype) plus standard announcement metadata (title, date, description).
Response envelope is one of `{announcements: [...], total}` /
`{documents: [...], total}` — the client code defensively checks
`page.announcements || page.documents || page.items`.

---

## POST /api/company/concall-scan

Client method: `concallScan(payload, opts)`. **Confirmed live 2026-08-01**
(throwaway watchlist of 50 real tickers drawn from `resultsDocuments`'s
current-quarter Transcript set — see `stock-api/test/stockscansClient.concallScan.test.js`
for the recorded fixture this doc's schema is checked against).

**Request** (matches the user-provided spec exactly, mirrors the other scan
endpoints' shape):

```json
{
  "industry": [],
  "index": [],
  "watchlistIds": [],
  "resultTiers": [],
  "sentimentTiers": [],
  "filters": [{ "left": "Market Capitalization", "sign": ">=", "right": "100" }],
  "q": "",
  "offset": 0
}
```

Scope to an arbitrary companyId set via `watchlistIds` — the standard
throwaway-watchlist pattern (`createWatchlist` / `deleteWatchlist`, paired in
`try/finally`; see the watchlist section below).

**Response:**

```json
{
  "rows": [
    [
      "24769",
      "NSE:MUTHOOTFIN",
      "Muthoot Finance Ltd",
      "Finance & Investments - Gold Loan",
      "2026-08-01T16:00:00+05:30",
      "as-6dfa623c9445593ab0bdab05.pdf",
      1,
      true,
      47.9,
      1,
      [
        "▼ Yield 20.93% → 17.93%",
        "▲ Active customers +1.63 lakh",
        "▲ Belstar Microfinance returns to profit"
      ],
      "l0fyxca960154mtwtev1ok2t.pdf"
    ]
  ],
  "next": 50,
  "quarter": "202606",
  "subscription": "Premium Plus"
}
```

`next` is the offset to pass on the following call, or `null` when exhausted
(confirmed: a 50-ticker watchlist returned `next: 50` on page 1, then 0 rows

- `next: null` on page 2 at offset 50 — this is a plain offset cursor, not an
  offset/total comparison; do not paginate any other way). `quarter` is the
  same `"YYYYMM"` shape as `resultsDocuments`'s `quarterDate`.

Each row is a **positional array of 12 elements** (confirmed live across ~65
rows spanning large-caps and midcaps):

| Index | Field                   | Notes                                                                                                                                      |
| ----- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 0     | internal id             | numeric string, e.g. `"24769"` — purpose unconfirmed, unused                                                                               |
| 1     | `companyId`             | e.g. `"NSE:MUTHOOTFIN"`                                                                                                                    |
| 2     | company name            |                                                                                                                                            |
| 3     | industry/category label |                                                                                                                                            |
| 4     | concall/result date     | ISO datetime with `+05:30` offset — **this is the "how recent" field**; `gainers-signal`'s 7-day check computes `recentWithinDays` from it |
| 5     | PDF filename slug       | e.g. `"as-6dfa....pdf"` — likely the results PPT/announcement doc, not yet resolved to a full URL; unused                                  |
| 6     | small integer           | always `1` in every observed row — meaning unconfirmed, unused                                                                             |
| 7     | boolean                 | always `true` in every observed row — meaning unconfirmed, unused                                                                          |
| 8     | `resultQualityScore`    | number, 0-100, nullable (null observed for ABB, Urban Company)                                                                             |
| 9     | `sentiment`             | enum 0-4, see mapping below                                                                                                                |
| 10    | `highlights`            | `string[]`, typically 3 items, each prefixed `▲`/`▼`/`●`                                                                                   |
| 11    | PDF filename slug       | nullable — likely the transcript ssUrl; not yet cross-checked against `documents(companyId)`, unused                                       |

Indices 0, 5, 6, 7, 11 are parsed by nothing in this codebase today — if a
future caller needs one, confirm its exact meaning against a second live
company/quarter before relying on this table's guess.

Sentiment enum (index 9), exported as `CONCALL_SCAN_SENTIMENT` from
`StockscansClient.js`. Live-observed values: Bajaj Finance and Reliance both
scored `2` (Neutral), TCS scored `3` (Optimistic) — consistent with the
user-provided mapping:

```
0: Bearish
1: Cautious
2: Neutral       (source spec said "Nuetral" — typo, corrected here)
3: Optimistic
4: Bullish
```

---

## POST /api/company/results/documents

Client method: `resultsDocuments({offset, documentType, searchCompany, watchlistIds})`,
bulk helper `resultsDocumentsMap({documentType})`. Confirmed live 2026-07-26.

**Request:**

```json
{
  "scan": { "filters": [], "index": [], "industry": [], "watchlistIds": [] },
  "offset": 0,
  "searchCompany": "",
  "documentType": "Transcript"
}
```

Notes:

- **No historical-quarter override.** Passing `quarterDate`/`quarter` in the
  body returns HTTP 400 "Extra inputs are not permitted" — this endpoint
  always reflects whatever quarter Stockscans currently considers "in
  season" (returned in the response as `quarterDate`). Use `documents()`
  (single company) or `scanAnnouncements` (bulk, historical) for any
  explicit non-latest quarter.
- `documentType`: `''` (all), `'Result'`, `'PPT'`, or `'Transcript'` —
  filters server-side to companies that have that document type filed.
- `scan.watchlistIds` scopes to an arbitrary companyId list the same way as
  `scanAnnouncements` (throwaway watchlist pattern).
- `searchCompany` is a single-company name substring filter — not useful for
  bulk lookups; paginate `documentType: ''` (or the specific type) instead.
- Paginates in steps of 50 (`offset`).

**Response:**

```json
{
  "documents": [
    {
      "Name": "Some Company Ltd",
      "companyId": "NSE:XYZ",
      "resultSsUrl": "...",
      "pptSsUrl": "...",
      "transcriptSsUrl": "...",
      "hasNotes": true,
      "updatedAt": "2026-07-25T..."
    }
  ],
  "total": 502,
  "quarterDate": "202606"
}
```

---

## GET /api/company/documents/{companyId}

Client method: `documents(companyId)`, convenience wrapper `latestTranscript(companyId)`.

**Response:**

```json
{
  "documents": [
    {
      "documentType": "Transcript",
      "date": "202606",
      "ssUrl": "..."
    }
  ]
}
```

`documentType` is one of `Transcript`, `Result`, `PPT`, `AnnualReport` (exact
casing per live payloads — filter with `d.documentType === 'Transcript'`
etc.). `date` is `'YYYY'` or `'YYYYMM'` depending on document type — pad
before lexical sort (see `latestTranscript`'s `rank()` helper). This is the
only endpoint with a true per-quarter, per-company historical lookup for a
**single** company — no bulk equivalent exists except via `resultsDocuments`
(latest quarter only) or `scanAnnouncements` (any quarter, via watchlist).

---

## POST /api/user/watchlists (create), DELETE /api/user/watchlists (delete)

Client methods: `createWatchlist(name, companyIds)`, `deleteWatchlist(watchlistId)`.
Confirmed live 2026-07-26. Used as the standard "throwaway watchlist" pattern
for scoping bulk scan endpoints (`scanAnnouncements`, `resultsDocuments`) to
an arbitrary companyId list beyond the 10-id `companyFilters` cap.

**Create request:** `{ "watchlistName": "<name>", "companyIds": [...] }`
(both fields required — HTTP 400 "Field required" if either is missing).
**Create response:** `{ watchlistId, watchlistName, companyIds }`.

**Delete request:** `DELETE /api/user/watchlists` with body
`{ "watchlistId": "<id>" }` — NOT a path param (`DELETE .../watchlists/{id}`
404s; that pattern is for `deleteAnnouncementScan`, a different resource).

Always pair create+delete in a `try/finally` — this creates a real watchlist
in the user's account, not an ephemeral/scoped resource. See
`stock-api/bin/get-concall-transcript-url.js` (`_withThrowawayWatchlist`) for
the reference implementation.

---

## Concall transcript resolution — which endpoint for which scenario

Superseded the deprecated `concall-transcript-extractor` skill (see
`skills/_shared/conventions.md` §12); Stockscans now guarantees an official
Transcript document for every reported quarter, so no fallback waterfall is
needed. Use `stock-api/bin/get-concall-transcript-url.js`:

| Scenario                        | Endpoint                                                      | Notes                                                  |
| ------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| 1 company, any quarter          | `documents(companyId)`                                        | filter `documentType==='Transcript' && date===quarter` |
| N companies, latest quarter     | `resultsDocuments({documentType:'Transcript', watchlistIds})` | throwaway watchlist, paginate                          |
| N companies, historical quarter | `scanAnnouncements({scan:{watchlistIds,...}, quarterDate})`   | throwaway watchlist, paginate                          |

---

## POST /api/company/scans/run

Client method: `runScan(payload, scanId)`. Confirmed live 2026-08-20 —
built for `stock-api/bin/sync-company-sector-industry.js` (the sector/industry
company-master sync).

**Request:**

```json
{
  "ratiosType": "Default",
  "timePeriod": "Latest",
  "scan": {
    "filters": [],
    "index": [],
    "industry": [],
    "tags": [],
    "scanName": "Scan Name",
    "scanDescription": "Scan Description",
    "watchlistIds": []
  },
  "watchlistIds": [],
  "order": "desc",
  "orderBy": "Market Capitalization",
  "offset": 0
}
```

Notes:

- Paginates in steps of **50** (`offset`). `total` IS trustworthy for this
  endpoint (confirmed: `offset:50` returned `start:51,end:100`; an offset
  near the tail of a 6472-company universe returned exactly
  `total - offset` rows) — the *opposite* of `scanAnnouncements`'s
  self-inflating `total` (§16 in `skills/_shared/conventions.md`); safe to
  use `total` here to compute the full page count.
- `scan.scanName`/`scan.scanDescription` appear to be free-text placeholders
  accepted for any ad-hoc (non-saved) scan, not validated against a real
  saved scan — similar to the `scanId`/`scanName` placeholder pattern noted
  for `scanAnnouncements`.
- As of 2026-08-20 this returns the full market universe: `total: 6475`.
- **Rate limit is real and tight, and the ban is long-lived — plan around
  it.** Live-tested: ~40-90 requests (independent of concurrency —
  triggered both at concurrency 5/300ms-apart and concurrency 1/1s-apart)
  returned HTTP 429, and the ban was NOT a short burst window — a single
  isolated probe request still got 429 at +60s and +240s after the trip,
  clearing only around +8-9 minutes later. Any new caller of this endpoint
  should fetch sequentially with ~1s between requests (not concurrently) and
  implement exponential-backoff retry on 429 with a ceiling long enough to
  ride out a multi-minute ban (`withRateLimitRetry` in
  `sync-company-sector-industry.js` is the reference implementation — 8
  attempts, 2s base, doubling, ~8.5min cumulative ceiling).

**Response:**

```json
{
  "table": {
    "0": ["companyId", "Name", "Market Capitalization", "...", "Pledged Percentage", "Industry", "Sector"],
    "1": ["NSE:RELIANCE", "Reliance Industries Ltd", 1774115.34, "...", 0, "Refineries", "Refineries"],
    "2": ["NSE:BHARTIARTL", "Bharti Airtel Ltd", "...", 0, "Telecom Services", "Telecom-Service"]
  },
  "total": 6475,
  "start": 1,
  "end": 50,
  "order": "desc",
  "orderBy": "Market Capitalization",
  "subscription": "..."
}
```

`table` is a JS array **serialized as an object** keyed `"0".."N"` (not a
real JSON array) — `table["0"]` is the 35-column header (column NAMES, for
`ratiosType: "Default"`), and `table["1"]..table["N"]` are POSITIONAL
data-row arrays in the same column order for that page. Confirmed column
indices (0-based): `companyId` = 0, `Name` = 1, ..., **`Industry` = 33**,
**`Sector` = 34** (the last two columns). `Industry` is the granular
classification, `Sector` the broader grouping (e.g. HDFC Bank: Industry
`"Banks - Private"`, Sector `"Banks"`; Bharti Airtel: Industry
`"Telecom Services"`, Sector `"Telecom-Service"`) — do not assume they match
just because some rows (e.g. Reliance: both `"Refineries"`) happen to. The
full column order for `ratiosType: "Default"`:

```
0  companyId
1  Name
2  Market Capitalization
3  CFO To PAT
4  Debt To Equity
5  Change In FII Holdings Latest Quarter
6  FII Holdings
7  Price To Earnings
8  PEG
9  Days From Result
10 Returns Since Result
11 Price To Sales
12 Returns 1D
13 Returns 1W
14 Industry PE Median
15 Revenue Growth TTM
16 PAT Growth TTM
17 Current Ratio
18 ROE
19 ROA
20 ROCE
21 ROE Median 3 Years
22 ROCE Median 3 Years
23 Price To Book Value
24 Asset Turnover
25 Free Cash Flow
26 Net Cash Flow
27 Promoter Holdings
28 DII Holdings
29 PAT Growth QoQ
30 PAT Growth YoY
31 PAT Growth 3 Years
32 Pledged Percentage
33 Industry
34 Sector
```

Column order/count is tied to `ratiosType: "Default"` — a different
`ratiosType` (e.g. `"Performance"`, used elsewhere in this codebase for
`watchlistTable`) may return a different column set; re-confirm indices
live before reusing this table for another `ratiosType`.

---

## Other endpoints (reference only, not yet used by any consumer skill)

Brief pointers — expand with full schemas here as they get exercised live:

- `GET /api/user/saved-scans/{scanId}` — `getScanMetadata(scanId)`, the
  saved-scan definition (filters, tags, name).
- `POST /api/company/announcements/statistics` — `announcementStatistics(payload)`.
- `POST /api/company/announcements/company` — `companyAnnouncements(payload)`.
- `POST /api/company/announcements` — `announcements(companyIds, offset)`,
  paginates in steps of 30, `{companyAnnouncements, offset, limit}`.
- `GET /api/company/scans/metadata` — `scanMetadata()`, index/industry lists.
- `GET /api/company/search` — `companySearch(query, {type})` /
  `searchCompany(query)`, ticker/name → companyId autocomplete.
- `GET /api/user/watchlists` — `watchlistsList({view})`.
- `GET /api/user/announcement-scans` — `savedAnnouncementScans()`.
- `PUT /api/user/announcement-scans` — `saveAnnouncementScan(payload)`.
- `PUT /api/user/announcement-scans/order` — `reorderAnnouncementScans(scanIds)`.
- `DELETE /api/user/announcement-scans/{scanId}` — `deleteAnnouncementScan(scanId)`.
- `POST /api/company/announcements/search` — `searchAnnouncements(payload)`.
- `POST /api/company/card-details` — `cardDetails(companyIds)`, metrics under
  `data.cardData[companyId].metaRatios`.
- `GET /api/company/prices/{ticker}` — `prices(ticker)`.
- `GET /api/company/ohlcv/{ticker}` — `ohlcv(ticker, {tf, before})`, rows
  `[isoTimestamp, open, high, low, close, volume]`, paginate via `hasMore`
  - `before`.
- `GET /api/company/growth-catalysts/{companyId}` — `growthCatalysts(companyId)`,
  AI-synthesized report `{finalReport, dateLabel, toc}`.
- `GET /api/company/business-overview/{companyId}` — `businessOverview(companyId)`,
  same shape as growth-catalysts.
- `GET /api/company/concall-notes/{companyId}/{ssUrl}` — `concallNotes(companyId, ssUrl)`,
  AI-synthesized notes `{finalReport, date, companyName, bullets}`.
- `POST /api/user/watchlists/table` — `watchlistTable(watchlistId, opts)`.
- `POST /api/user/watchlists/company-ids/replace` — `replaceWatchlist(watchlistId, companyIds)`.
- `PUT /api/user/watchlists/company-ids` — `updateWatchlist(watchlistId, action, companyIds)`,
  `action` is `'add'|'delete'`.
- `GET /scans/saved/{scanId}` — `savedScanPageHtml(scanId)`, raw HTML (Next.js
  RSC payload embeds the scan definition).
- `GET /api/user/saved-scans` — `savedScans()`.
