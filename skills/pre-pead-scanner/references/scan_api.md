# Stockscans scan API — request/response details

Reference for the two endpoints `run_scan.py` uses to turn a saved-scan URL into a company universe. Read this if you're extending the script or debugging an unexpected response. For day-to-day use, `run_scan.py` abstracts all of this away.

## The saved-scan URL

A saved scan lives at:
```
https://www.stockscans.in/scans/saved/<scanId>
```
`<scanId>` is a 24-character hex string (a Mongo ObjectId). `run_scan.py` accepts either the full URL or the bare id.

## 1. Definition endpoint (fetch the live filters)

**Method**: `GET`
**URL**: `https://www.stockscans.in/api/user/saved-scans/{scanId}`
**Headers**: `accept: application/json`, `content-type: application/json`, `cookie: authtoken=<JWT>`

### Response
```json
{
  "scanId": "c29a98ebbb568f073162ba24",
  "scanName": "Pre PEAD Candidates",
  "scanDescription": "Pre PEAD Candidates",
  "industry": [], "index": [], "sector": [],
  "tags": [["NSE"]],
  "watchlistIds": [],
  "filters": [
    {"left": "Market Capitalization", "sign": ">=", "right": "300"},
    {"left": "Market Capitalization", "sign": "<",  "right": "30000"},
    {"left": "Days From Result",       "sign": "<=", "right": "3"},
    {"left": "Days From Result",       "sign": ">=", "right": "2"},
    {"left": "Retail Holdings * Market Capitalization", "sign": ">=", "right": "100"},
    {"left": "Volume SMA 20D * SMA 20D", "sign": ">=", "right": "50000000"}
  ],
  "alertFrequency": null
}
```

**Why fetch this fresh every run:** users edit saved scans. The same `scanId` returned `Days From Result 0–1` with a `PAT Growth TTM ≥ 20` filter on one day and `Days From Result 2–3` with no PAT filter a week later. Hardcoding filters would silently desynchronise the skill from the user's intent. Always GET the definition, then feed it to the run endpoint verbatim.

### `Days From Result` semantics

This is the filter that makes a scan a "pre-results" scan. It counts *forward* to the next scheduled result:
- `Days From Result >= 0 AND <= 1` → reports today or tomorrow
- `Days From Result >= 2 AND <= 3` → reports in two to three days

So the window the user has set tells you which result dates to expect in `Next Result Date`. Use it to sanity-check Step 2 (already-declared exclusion).

## 2. Run endpoint (execute the scan)

**Method**: `POST`
**URL**: `https://www.stockscans.in/api/company/scans/run`
**Headers**: definition headers + `origin: https://www.stockscans.in`

### Body
Wrap the definition object under `scan`:
```json
{
  "ratiosType": "Default",
  "timePeriod": "Latest",
  "scan": { ...the definition object from endpoint 1... },
  "watchlistIds": [],
  "order": "desc",
  "orderBy": "Market Capitalization",
  "offset": 0
}
```
`offset` paginates if the scan returns more rows than one page; in practice these scans return the full set in one call (`total` in the response tells you the count).

### Response
```json
{
  "table": [
    ["companyId", "Name", "Days From Result", "Market Capitalization", "Close Price",
     "Revenue", "EPS", "Equity Shares", "Last Result Date", "Next Result Date", "..." ],
    ["NSE:PGEL", "PG Electroplast Ltd", 1, 13376.89, 468.4, 5481.0, 12.1, 28.6,
     "2026-02-02", "2026-05-20", ... ],
    ...
  ],
  "total": 31
}
```
The first row of `table` is the header; every subsequent row is a company. `run_scan.py` zips them into dicts.

### Columns surfaced (as of May 2026)

The exact column set follows the scan's `ratiosType`; with `"Default"` the rows carry, among others:

| Column | Use in this skill |
|---|---|
| `companyId` | **The key for every downstream API call** (e.g. `NSE:PGEL`) |
| `Name` | Display |
| `Sector`, `Industry` | Display / business-first framing |
| `Last Result Date` | Step 2 — already-declared check |
| `Next Result Date` | Confirms the upcoming report date |
| `Days From Result` | Pre-results window |
| `Market Capitalization` | ₹ Cr |
| `Close Price` | CMP (cross-check on result day vs Dhan/Kotak) |
| `Revenue` | TTM revenue — historical base for extrapolation |
| `EPS` | Trailing EPS — cross-check for the EPS estimate |
| `Equity Shares` | Share count for the EPS calc (Step 5) |
| `PAT Growth TTM / YoY / QoQ / 3 Years` | Momentum + historical-performance validation |
| `Revenue Growth TTM` | Historical-performance validation |
| `ROE`, `ROCE`, `ROA` (+ 3-yr medians) | Business-quality framing |
| `Price To Earnings`, `Industry PE Median`, `EV To EBITDA`, `PEG`, `Price To Book Value`, `Price To Sales` | Valuation context (keep brief — this skill leads with business, not multiples) |
| `Debt To Equity`, `Current Ratio` | Balance-sheet check |
| `CFO To PAT`, `CFO To EBITDA`, `Free Cash Flow`, `Operating Cash Flow` | Earnings-quality validation |
| `Promoter / FII / DII / Retail Holdings` | Ownership context |

Note: `Revenue`, `Market Capitalization`, `Free Cash Flow` etc. are in **₹ Crore**. `EPS` is in ₹. Treat any single-decimal share figure with caution — confirm against the latest result for the EPS calc.

## 3. Auth

Identical to `stock-documents-fetcher`: an HS256 JWT in the `authtoken` cookie, payload `{"exp": <unix>, "userId": "..."}`. `run_scan.py` decodes `exp` locally for a friendly expiry warning but the server enforces the real check. On 401/403, the token has expired — the user refreshes it from the browser (DevTools → Cookies → `authtoken`) and updates `/mnt/project/Stockscans_authtoken`.

## 4. Behaviour notes

- **Empty `table`** (header only) → the scan currently matches no companies. This is common for tight `Days From Result` windows on days when nothing is scheduled to report. Not an error — report it to the user.
- **`total` vs returned rows** → if `total` exceeds the rows returned, paginate by bumping `offset` in steps matching the page size. These pre-results scans rarely exceed one page.
- **Column drift** → if Stockscans changes column names, `run_scan.py`'s `col()` helper checks a few aliases. Add new aliases there if a column you need goes missing.
