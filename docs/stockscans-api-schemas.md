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
- `scan.scanId` / `scan.scanName` are only present when replaying a *saved*
  scan (e.g. the user's "Recordings" saved scan) — omit both for an ad-hoc
  scan; the endpoint accepts a `scan` object without them.
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
- Paginated — advance `offset` by the number of items in the previous page
  until it's empty or `offset + page.length >= total`.

**Response (shape used by this repo):** items carry a `companyId` and an
`ssUrl` (sometimes under `transcriptSsUrl` depending on the announcement
subtype) plus standard announcement metadata (title, date, description).
Response envelope is one of `{announcements: [...], total}` /
`{documents: [...], total}` — the client code defensively checks
`page.announcements || page.documents || page.items`.

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

| Scenario | Endpoint | Notes |
|---|---|---|
| 1 company, any quarter | `documents(companyId)` | filter `documentType==='Transcript' && date===quarter` |
| N companies, latest quarter | `resultsDocuments({documentType:'Transcript', watchlistIds})` | throwaway watchlist, paginate |
| N companies, historical quarter | `scanAnnouncements({scan:{watchlistIds,...}, quarterDate})` | throwaway watchlist, paginate |

---

## Other endpoints (reference only, not yet used by any consumer skill)

Brief pointers — expand with full schemas here as they get exercised live:

- `POST /api/company/scans/run` — `runScan(payload, scanId)`, full scan
  payload (offset, filters, index, industry, watchlistIds — same shape
  family as the scan endpoints above).
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
  + `before`.
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
