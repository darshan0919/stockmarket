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

## Migration notes 2026-09-16

Stockscans re-organized nearly every endpoint under new path prefixes on this
date (old paths all 404 now). This was a **path-and-consolidation** refactor,
not a rewrite — payload/response shapes are unchanged for the large majority
of endpoints. Every path below has been updated in place in this doc and in
`StockscansClient.js`'s JSDoc; this section only calls out what's
non-obvious. See `StockscansClient.js` for the definitive per-method
reference (path + confirmed/unconfirmed status + full payload notes).

**Renaming pattern** (old → new prefix):

- `company/X` → `company/reports/X` (`business-overview`, `growth-catalysts`)
  or `company/fundamentals/X` (`announcements`, `documents`)
- `company/scans/X` → `scans/stock/X` (`metadata`, `run`) or
  `scans/announcement/X` (`statistics`, merged `search`) or
  `scans/concall/X` (`run`, `notes`) or `scans/result/X` (`run`, `documents`)
- `user/X` → `scans/stock/saved` (was `user/saved-scans`) or
  `scans/announcement/saved` (was `user/announcement-scans`)
- `company/card-details` → `home/card-details`
- `company/ohlcv/{ticker}` → `charts/ohlcv/{ticker}`

**Endpoint consolidations** (two old endpoints merged into one):

- `scanAnnouncements` (old `company/announcements/scan`) and
  `searchAnnouncements` (old `company/announcements/search`) now both hit
  `POST /api/scans/announcement/search`. Differentiated only by whether
  `scan.searchFilters` is empty (`[]` → scan behavior, matches old
  `scanAnnouncements`) or populated (keyword array → search behavior,
  matches old `searchAnnouncements`). `searchAnnouncements` is kept as a
  thin wrapper for backward compatibility with existing call sites.
- `companyAnnouncements` (old `company/announcements/company`, single
  company) and `announcements` (old `company/announcements`, bulk) now both
  hit `POST /api/company/fundamentals/announcements` with the identical
  `{companyIds, offset}` request shape — a single-company call is just
  `companyIds: [oneId]`.

**Real DTO/behavior changes** (not just a path swap):

- **`resultsScan`** (new path `POST /api/scans/result/run`): the response's
  `data.results` array is **gone**. Replaced by a top-level `resultTables`
  array. Each record is now `{companyId, metaRatios: {Name, ...},
resultTable: {C, S}, documents: [{ssUrl, documentType, hasNotes}, ...]}` —
  a nested shape, not the old flat per-company record. The only in-repo
  caller, `scripts/jobs/daily_results_extractor.js`, has been updated to
  read `response.resultTables` and derive `resultSsUrl`/`pptSsUrl`/
  `transcriptSsUrl` by matching `documents[].documentType` against
  `'Result'`/`'PPT'`/`'Transcript'`. That `documentType` matching was NOT
  independently live-verified against this exact endpoint (it mirrors the
  vocabulary confirmed for `resultsDocuments`, a sibling endpoint) —
  spot-check against a live run before trusting it further downstream. See
  also `screener-api/src/features/results/declaredResultsController.js`,
  which independently calls a related (but not identical) Stockscans
  endpoint, `POST /api/company/scan-company-results`, and already consumes
  this same `resultTables` shape — used as the confirmation source for the
  record structure.
- **`ohlcv`**: the `tf` query-param enum changed from all-lowercase to
  capitalized day/week/month values, and gained two new granularities.
  Confirmed live enum (from a 400 error message):
  `'1m', '2m', '3m', '5m', '10m', '15m', '30m', '1h', '2h', '4h', '1D', '1W', '1M'`
  — old callers passing lowercase `'1d'` must switch to `'1D'` (also now
  `'1W'`/`'1M'`, previously unavailable).
- **`cardDetails`**: response now has a more prominent `prices` intraday
  candle array per company, alongside the existing `metaRatios`. Additive,
  not breaking.

**Transient-401 quirk** (not a path/DTO change, but a live-testing finding
worth flagging): the two endpoints served by Stockscans' separate
`uvicorn`/FastAPI backend — `growthCatalysts` (`company/reports/
growth-catalysts/{id}`) and `concallNotes` (`scans/concall/notes/{id}/
{ssUrl}`) — occasionally return a 401 that clears on an immediate retry
(~1.5s later) with zero change to the request or token. Treat as
retry-worthy rate-limiting-like behavior, not a real auth failure.

**Not live-tested (mutating, unverified path-only change assumed safe):**
`saveAnnouncementScan` (PUT), `reorderAnnouncementScans` (PUT),
`deleteAnnouncementScan` (DELETE) — new paths taken directly from a
user-provided migration map, not independently probed, since probing would
mutate the real account's saved scans. Verify against a real call before
depending on them in a new caller.

---

## POST /api/scans/announcement/search

Client method: `scanAnnouncements(payload, opts)`. Confirmed live 2026-07-31
(original `company/announcements/scan` path); path migrated 2026-09-16 to
`scans/announcement/search` — CONFIRMED LIVE via captured browser traffic,
same request/response shape. This endpoint is now also where
`searchAnnouncements` routes (see Migration notes above) — differentiated by
`scan.searchFilters`.

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

## POST /api/scans/concall/run

Client method: `concallScan(payload, opts)`. **Confirmed live 2026-08-01**
(original `company/concall-scan` path); path migrated 2026-09-16 to
`scans/concall/run` — CONFIRMED LIVE, pure path swap, zero payload/response
changes.
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

## POST /api/scans/interview/run

Client method: `interviewScan(payload, opts)`. **CONFIRMED LIVE 2026-09-25**
(user-supplied sample, `q: "NEPHROPLUS"`, 9 rows returned).

**Request:**

```json
{
  "industry": [],
  "index": [],
  "watchlistIds": [],
  "channelIds": [],
  "q": "NEPHROPLUS",
  "cursor": ""
}
```

`q` is a free-text match (confirmed usage: bare ticker symbol, no exchange
prefix) — it is a text search, not an exact companyId scope, so filter the
returned rows' company tags (index 6 below) against the target companyId
before trusting a match. `watchlistIds` is present on the payload (mirrors
every other scan endpoint's shape) but scoping this endpoint via the
throwaway-watchlist pattern (§14) has NOT been live-confirmed — `q` is the
confirmed path.

**Response:**

```json
{
  "rows": [
    [
      "Y7YT7sqszzg",
      "NephroPlus Targets 15–20% Revenue Growth: 40–50 New Clinics Every Year | Business News | ET Now",
      "2026-09-25T11:40:11+05:30",
      562,
      true,
      "ET Now",
      [["NSE:NEPHROPLUS", "Nephrocare Health Services Ltd", true]]
    ]
  ],
  "next": null,
  "total": 9,
  "channels": [["UCI_mwTKUhicNzFrhm33MzBQ", "ET Now"]],
  "subscription": "Premium Plus"
}
```

Each row is a **positional array of 7 elements**:

| Index | Field         | Notes                                                              |
| ----- | ------------- | ------------------------------------------------------------------ |
| 0     | `videoId`     | YouTube video id — the key for `interviewDetail`                   |
| 1     | title         |                                                                    |
| 2     | `publishedAt` | ISO datetime with `+05:30` offset — the recency field to filter on |
| 3     | duration      | seconds                                                            |
| 4     | embeddable    | boolean                                                            |
| 5     | channelName   |                                                                    |
| 6     | companies     | `Array<[companyId, companyName, isPrimary:boolean]>`               |

`next` is an **opaque cursor** (confirmed `null` when a query is fully
satisfied in one page — the user-supplied 9-row sample had `next: null` with
`total: 9`), not an offset — per conventions §16's exception for genuinely
cursor-based pagination, page sequentially (pass `next` back as `cursor`)
rather than firing pages in parallel; do not assume it is secretly
offset-based. `total` has not been stress-tested against the
`scanAnnouncements.total` self-inflation bug (conventions §16) — treat it as
informational only, never as a page-count driver, same rule as everywhere
else in this doc.

---

## POST /api/scans/interview/detail

Client method: `interviewDetail(videoId, opts)`. **CONFIRMED LIVE
2026-09-25** (`videoId: "Y7YT7sqszzg"`, the NephroPlus/ET Now row above).

**Request:**

```json
{ "videoId": "Y7YT7sqszzg" }
```

**Response** (live-captured, not the user-supplied guess — the actual shape
differs from a flat `takeaways: string[]`):

```json
{
  "takeaways": [
    [
      "NSE:NEPHROPLUS",
      "- **Revenue growth guidance:** NephroPlus is targeting 15% to 20% annual revenue growth ...\n- **Clinic expansion roadmap:** ...",
      null
    ]
  ],
  "video": {
    "title": "NephroPlus Targets 15–20% Revenue Growth: 40–50 New Clinics Every Year | Business News | ET Now",
    "channelName": "ET Now",
    "publishedAt": "2026-09-25T11:40:11+05:30",
    "embeddable": true
  }
}
```

`takeaways` is an array of `[companyId, markdownBullets, null]` — one entry
per company the interview substantively discusses (single-company interviews
observed to have exactly one entry; the third positional element's purpose
is unconfirmed, always observed `null` — do not rely on it). `markdownBullets`
is a markdown-formatted STRING (bold headers + bullet list), not structured
JSON — parse it as prose, not as a schema. **This is a Stockscans-generated
summary of the interview, not a verbatim transcript excerpt** — unlike a
Filing Extract (`resolveFilingContent`), which is quote-verified against the
source document, a takeaway is a third-party paraphrase with no page/timestamp
anchor back to what was actually said. Any consumer (see
`rerating-catalysts` SKILL.md) must treat a specific number quoted here with
more caution than the same number sourced from a Result/Transcript/PPT filing
— corroborate against a filing where possible, and cite it explicitly as
interview commentary, not as filing-sourced.

`video.publishedAt` duplicates row index 2 from `interviewScan` — either is a
valid source for the recency check.

---

## POST /api/scans/result/documents

Client method: `resultsDocuments({offset, documentType, searchCompany, watchlistIds})`,
bulk helper `resultsDocumentsMap({documentType})`. Confirmed live 2026-07-26
(original `company/results/documents` path); path migrated 2026-09-16 to
`scans/result/documents` — CONFIRMED LIVE, same request/response shape.

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

## GET /api/company/fundamentals/documents/{companyId}

Client method: `documents(companyId)`, convenience wrapper `latestTranscript(companyId)`.
Path migrated 2026-09-16 from `company/documents/{companyId}` — CONFIRMED
LIVE, same response shape.

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

## POST /api/scans/stock/run

Client method: `runScan(payload, scanId)`. Confirmed live 2026-08-20 —
built for `stock-api/bin/sync-company-sector-industry.js` (the sector/industry
company-master sync). Path migrated 2026-09-16 from `company/scans/run` to
`scans/stock/run` — CONFIRMED LIVE via captured browser traffic. The request
body now wraps filters inside a nested `scan` object (see below) rather than
the flat top-level shape used pre-migration.

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
  `total - offset` rows) — the _opposite_ of `scanAnnouncements`'s
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
    "0": [
      "companyId",
      "Name",
      "Market Capitalization",
      "...",
      "Pledged Percentage",
      "Industry",
      "Sector"
    ],
    "1": [
      "NSE:RELIANCE",
      "Reliance Industries Ltd",
      1774115.34,
      "...",
      0,
      "Refineries",
      "Refineries"
    ],
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

## GET /company/{companyId} (HTML page -- NOT a JSON API)

Client method: `companyPageHtml(companyId)` (fetch only). Parser:
`stock-api/src/analyzers/companyFinancials.js` (`parseCompanyPage`,
`getCompanyFinancials`). CLI: `yarn workspace @stock/api company-financials
--companies NSE:X,NSE:Y`. Consumed by `pead-surprise-ranker` Step 1b.

**Why HTML:** the page's Financials section has no backing JSON endpoint
(confirmed 2026-09-20 -- the data is server-rendered Next.js SSR). The only
source of historical quarterly/annual P&L on Stockscans is this authenticated
page (`Cookie: authtoken=...`, `Accept: text/html`; ~400-500 KB; a raw `curl`
may get a transient bare `401 {}` -- retry once, same as the other
uvicorn-backed endpoints).

**Structure the parser relies on** (tag names + visible text only; the CSS
class names are hashed CSS-modules and change on every deploy -- never key
on them). 10 `<table>`s per page, each rendered twice (mobile + desktop copy;
the first is used):

| Table (first header cell) | Columns                                                                  | Notes                                                                                  |
| ------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `Quarter`                 | 12 quarter-ends, oldest -> newest, e.g. `Sep 2023` ... `Jun 2026`        | the P&L used                                                                           |
| `Financial Year` (P&L)    | `Mar 2020` ... `Mar 2026` + `TTM`; 8-13 columns depending on company age | the P&L used -- picked as the first `Financial Year` table that has Revenue + PAT rows |
| `Financial Year` (others) | balance sheet, cash flow, ...                                            | ignored                                                                                |

Row labels (label cell = 3 text nodes: mobile label, desktop label, unit):
Revenue, Growth YoY, Expenses, Operating Profit, OPM, Other Income, Interest
Expense, Depreciation, PBT, Tax, PAT, Growth YoY, NPM, EPS. **Banks/NBFCs
("financial" layout)** instead show `Interest Expended`, `Financing Profit`
and `FPM` (mapped onto the same output keys; Financing Profit is often
NEGATIVE, so Operating-Profit growth is not comparable for them). Values:
whole INR Cr for money rows (Indian digit grouping, e.g. `3,36,367`; `-` prefix
for negatives), one decimal for `%` rows, INR for EPS. Consolidated view is
the default (`activeView` marker text `Consolidated`).

**Precision caveat:** money rows are rounded to whole Cr on the page, while
the page's own `Growth YoY` % rows are computed on unrounded numbers -- for
small companies growth re-derived from the rounded rows can differ by several
points (e.g. AVALON Q1FY27 PAT: 35 vs 14 Cr -> 150% derived, 145.4% on the
page). Prefer the page's growth rows when comparing to the latest quarter.

**Parsed output** (`parseCompanyPage`): `{layout, basis, quarters[], years[],
ttm, warnings[]}`; each record has `period` ("Jun 2026"), `yyyymm`, `fq`/`fy`
("Q1FY27"/"FY26"), `fiscalYear`, `fiscalPeriod`, and the keys `revenue,
revenue_growth_pct, expenses, operating_profit, opm_pct, other_income,
interest, depreciation, pbt, tax, pat, pat_growth_pct, npm_pct, eps`
(always present, `null` when the row was missing). `baselines`
(`selectBaselines`) adds `latest_quarter`, `next_quarter`, `year_ago_quarter`,
`latest_year_ago`, `last_fy`, `ytd_quarters`, `seasonality`. Parsing throws
loudly if the quarterly table is absent (layout change / login wall /
expired token) and emits `warnings` when a row's cell count does not match
the header or when Revenue - Expenses != Operating Profit (or the PBT bridge
fails) beyond rounding tolerance.

**Verified live 2026-09-20** on NSE:AVALON, NSE:HDFCBANK, NSE:BAJFINANCE,
NSE:IFBIND, NSE:SUPRAJIT (industrial + financial layouts, 9-13 annual
columns, all 12 quarters). AVALON FY26 revenue 1,603 Cr matches the concall
commitment "INR 1,603 crores (FY26) to ~INR 3,200 crores (FY29)". Cached 24h
under `data/cache/company-financials/` via `StorageService`.

---

## Other endpoints (reference only, not yet used by any consumer skill)

Brief pointers — expand with full schemas here as they get exercised live.
Paths below are the post-2026-09-16-migration paths; see Migration notes
above for what each replaced.

- `GET /api/scans/stock/saved/{scanId}` — `getScanMetadata(scanId)`, the
  saved-scan definition (filters, tags, name). Path migrated from
  `user/saved-scans/{scanId}` — CONFIRMED LIVE, same response shape.
- `POST /api/scans/announcement/statistics` — `announcementStatistics(payload)`.
  Path migrated from `company/announcements/statistics` — CONFIRMED LIVE,
  same payload/response shape.
- `POST /api/company/fundamentals/announcements` — `companyAnnouncements(payload)`
  AND `announcements(companyIds, offset)` (bulk) — now the SAME endpoint
  (see Migration notes: consolidation). Path migrated from
  `company/announcements/company` / `company/announcements` respectively.
  Request shape `{companyIds, offset}`; response `{companyAnnouncements, offset, limit}`.
- `GET /api/scans/stock/metadata` — `scanMetadata()`, index/industry lists.
  Path migrated from `company/scans/metadata` — CONFIRMED LIVE. Despite the
  "stock" segment, still serves generic metadata used for announcement-scan
  filters too.
- `GET /api/company/search` — `companySearch(query, {type})` /
  `searchCompany(query)`, ticker/name → companyId autocomplete. Unaffected
  by the migration.
- `GET /api/user/watchlists` — `watchlistsList({view})`. Unaffected by the
  migration.
- `GET /api/scans/announcement/saved` — `savedAnnouncementScans()`. Path
  migrated from `user/announcement-scans` — CONFIRMED LIVE, same response
  shape (`{announcementScans: [...]}`).
- `PUT /api/scans/announcement/saved` — `saveAnnouncementScan(payload)`. Path
  migrated from `user/announcement-scans`. NOT live-tested (mutating) — see
  Migration notes.
- `PUT /api/scans/announcement/saved/order` — `reorderAnnouncementScans(scanIds)`.
  Path migrated from `user/announcement-scans/order`. NOT live-tested
  (mutating) — see Migration notes.
- `DELETE /api/scans/announcement/saved/{scanId}` — `deleteAnnouncementScan(scanId)`.
  Path migrated from `user/announcement-scans/{scanId}`. NOT live-tested
  (mutating) — see Migration notes.
- `POST /api/scans/announcement/search` — `searchAnnouncements(payload)`. Now
  the same endpoint as `scanAnnouncements` (see Migration notes). Path
  migrated from `company/announcements/search`.
- `POST /api/home/card-details` — `cardDetails(companyIds)`, metrics under
  `data.cardData[companyId].metaRatios`. Path migrated from
  `company/card-details` — CONFIRMED LIVE. Response now also carries a more
  prominent `prices` intraday-candle array per company.
- `GET /api/company/prices/{ticker}` — `prices(ticker)`. Legacy/superseded by
  `ohlcv`; zero call sites in this repo (confirmed via dead-code scan) —
  left unmigrated intentionally.
- `GET /api/charts/ohlcv/{ticker}` — `ohlcv(ticker, {tf, before})`, rows
  `[isoTimestamp, open, high, low, close, volume]`, paginate via `hasMore`
  - `before`. Path migrated from `company/ohlcv/{ticker}` — CONFIRMED LIVE.
    `tf` enum changed (see Migration notes): now
    `'1m','2m','3m','5m','10m','15m','30m','1h','2h','4h','1D','1W','1M'`
    (capitalized day/week/month, two new granularities).
- `GET /api/company/reports/growth-catalysts/{companyId}` — `growthCatalysts(companyId)`,
  AI-synthesized report `{finalReport, dateLabel, toc}`. Path migrated from
  `company/growth-catalysts/{companyId}` — CONFIRMED LIVE. Served by
  Stockscans' `uvicorn`/FastAPI backend — see Migration notes' transient-401
  quirk.
- `GET /api/company/reports/business-overview/{companyId}` — `businessOverview(companyId)`,
  same shape as growth-catalysts. Path migrated from
  `company/business-overview/{companyId}` — CONFIRMED LIVE.
- `GET /api/scans/concall/notes/{companyId}/{ssUrl}` — `concallNotes(companyId, ssUrl)`,
  AI-synthesized notes `{finalReport, date, companyName, bullets}`. Path
  migrated from `company/concall-notes/{companyId}/{ssUrl}` — CONFIRMED
  LIVE. Same `uvicorn` backend and transient-401 quirk as `growthCatalysts`.
- `POST /api/user/watchlists/table` — `watchlistTable(watchlistId, opts)`.
  Unaffected by the migration.
- `POST /api/user/watchlists/company-ids/replace` — `replaceWatchlist(watchlistId, companyIds)`.
  Unaffected by the migration.
- `PUT /api/user/watchlists/company-ids` — `updateWatchlist(watchlistId, action, companyIds)`,
  `action` is `'add'|'delete'`. Unaffected by the migration.
- `GET /scans/saved/{scanId}` — `savedScanPageHtml(scanId)`, raw HTML (Next.js
  RSC payload embeds the scan definition). Unaffected by the migration (not
  an `/api/` path).
- `GET /api/scans/stock/saved` — `savedScans()`. Path migrated from
  `user/saved-scans` — CONFIRMED LIVE, same response shape (`{scans: [...]}`).
