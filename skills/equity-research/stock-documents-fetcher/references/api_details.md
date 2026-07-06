# Stockscans API — request/response details

Reference doc for the two endpoints used by this skill. Read this if you're extending the skill (e.g. adding a new document type, debugging an unexpected response shape, handling a new auth flow). For day-to-day fetching, the SKILL.md is enough.

## 1. Documents endpoint

**Method**: `GET`
**URL**: `https://www.stockscans.in/api/company/documents/{ticker}`
where `{ticker}` is URL-encoded (`NSE:BSE` → `NSE%3ABSE`).

**Required headers**:
- `accept: application/json`
- `content-type: application/json`
- `cookie: authtoken=<JWT>` — the JWT lives in the `authtoken` cookie on stockscans.in
- `referer: https://www.stockscans.in/company/{encoded_ticker}` — sometimes enforced

### Response

```json
{
  "companyId": "NSE:BSE",
  "documents": [
    {
      "date": "2025",
      "documentType": "Annual Report",
      "ssUrl": "yc3nvum4t36kuygbxxgispiw.pdf",
      "hasNotes": false
    },
    {
      "date": "202509",
      "documentType": "Transcript",
      "ssUrl": "nvytq3siyg4v7ddaitqic7qy.pdf",
      "hasNotes": true
    }
  ]
}
```

### Field semantics

| Field | Meaning |
|---|---|
| `date` | `"YYYY"` for `Annual Report`; `"YYYYMM"` for `PPT`, `Result`, `Transcript`. The YYYYMM month is the **quarter-end month** for results-oriented docs (e.g. `202509` = quarter ending Sep-2025 = Q2 FY26 in Indian fiscal calendar). |
| `documentType` | One of: `"Annual Report"`, `"PPT"` (investor presentation), `"Result"` (financial result), `"Transcript"` (earnings call transcript). |
| `ssUrl` | The S3 object key (just the filename, no path). Build the full URL by prefixing `https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/`. |
| `hasNotes` | Whether Stockscans has enriched/annotated notes for this document. Useful for picking transcripts. |

### Confirmed document types

As of testing in May 2026, the only `documentType` values observed are the four listed above. If you encounter a new type, add a canonical entry to `CANONICAL_TYPES` and (if helpful) corresponding aliases to `TYPE_ALIASES` in `fetch_documents.py`.

### Behaviour on invalid ticker

Returns `200 OK` with `{"companyId": "NSE:WHATEVER", "documents": []}`. No 404. The script surfaces this with a `NOTE` to stderr.

## 2. Announcements endpoint

**Method**: `POST`
**URL**: `https://www.stockscans.in/api/company/announcements`

**Body**:
```json
{"companyIds": ["NSE:BSE"], "offset": 0}
```

`companyIds` is plural — the API supports multi-company queries, but the script keeps it single-ticker for simplicity. `offset` paginates in steps of 30.

**Required headers**: same as documents endpoint, plus:
- `origin: https://www.stockscans.in`

### Response

```json
{
  "companyAnnouncements": [
    {
      "companyKey": "21236",
      "date": "2026-04-30",
      "title": "Updates",
      "description": "BSE Limited has informed the Exchange regarding General update.",
      "ssUrl": "l12jo5i54dve4p0dsgivqijm.pdf",
      "createdAt": "2026-04-30T19:57:29.748612",
      "name": "BSE Ltd",
      "companyId": "NSE:BSE"
    }
  ],
  "offset": 0,
  "limit": 30
}
```

### Notes

- Page size is **30** (per response `limit`). The script uses `API_PAGE_SIZE = 30`.
- Sort order is newest-first. The script terminates pagination when (a) a page returns fewer than 30 rows, (b) `--max-pages` is hit, or (c) any announcement falls before `stop_before` (set from `--start`).
- Some announcements have an empty `ssUrl` — these are text-only filings with no PDF. The script puts those in `skipped` with reason `"no PDF attached"`.

## 3. Authentication

The `authtoken` is a HS256 JWT with payload:

```json
{"exp": 1779196263, "userId": "648edf896e634b92b651f597"}
```

`exp` is a Unix timestamp in seconds. The skill decodes this without verification — we don't have the signing key, but the server enforces it on every request, so the scripts only use the local decode for friendly expiry warnings.

Tokens are issued with multi-week lifetimes. When one expires, the user must log into stockscans.in in a browser and copy the fresh `authtoken` cookie value into the project file.

## 4. The S3 CDN

PDFs are served publicly (no auth) from:
```
https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/<ssUrl>
```

`Cache-Control: public, max-age=172800` and `Content-Type: application/pdf` confirmed via `HEAD`. Range requests are supported (`Accept-Ranges: bytes`) — useful if you ever need to peek at a file without downloading the whole thing.

## 5. Rate limits & politeness

There are no published rate limits and the API tolerates the small bursts the scripts produce (≤4 calls per ticker for documents, ≤max-pages for announcements). The announcements script sleeps 200 ms between paginated calls anyway. If you ever batch many tickers, add an outer sleep between tickers (1–2 s) to stay well-mannered.
