# @stock/api

Centralized stock-data API clients for the whole stack. One source of truth per
datum, split by domain:

| Client             | Owns             | Use for                                                                    |
| ------------------ | ---------------- | -------------------------------------------------------------------------- |
| `StockscansClient` | **Fundamentals** | documents, announcements, scans, watchlists, screener, card-detail metrics |
| `NseClient`        | **Price-action** | quote, live delivery %, price/volume/deliverable history, live gainers     |
| `BseClient`        | **Price-action** | traded/deliverable qty, delivery %, live quote header, scrip-code lookup   |

> Rule: anything **fundamental** comes from Stockscans. NSE/BSE are **only** for
> price/volume/delivery. No endpoint is exposed on more than one client.

## Use (Node)

```js
const { stockscans, nse, bse } = require('@stock/api');

const scan = await stockscans.runScan(payload, scanId); // fundamentals
const live = await nse.getSymbolData('TCS'); // price-action (delivery %)
const pos = await bse.getSecurityPosition('500325'); // price-action
```

Inject dependencies for tests/custom config:

```js
const { StockscansClient, HttpClient, StockscansAuth } = require('@stock/api');
const client = new StockscansClient({
  http: new HttpClient({ timeout: 15000 }),
  auth: new StockscansAuth({ token: process.env.STOCKSCANS_AUTH_TOKEN }),
});
```

## Auth

One env var: **`STOCKSCANS_AUTH_TOKEN`** (legacy `STOCKSCANS_AUTHTOKEN` is read as a
deprecated fallback for one release, with a warning). Token is read lazily per
request so a refresh applies without a restart.

## Cloud skills

Skills can't import this package, so they carry a vendored copy of the Python port
(`python/stockscans_client.py`). Sync it into your skill sources:

```bash
node sync-skills.js --skills-root /path/to/skill-sources   # write vendored copies
node sync-skills.js --skills-root /path/to/skill-sources --check   # CI: fail if stale
```

`scripts/_vendor/` in each skill is **generated** — edit `python/*` and re-sync.

## Quarterly Result Extraction Scripts

- `fetch-result-documents`: Fetches latest PPT, Result, and Transcripts for a company into an output folder.
- `extract-result-text`: Converts downloaded Result and PPT PDFs to layout-preserving text.
- `extract-result-xbrl`: Extracts structured quarterly financial numbers from NSE/BSE XBRL filings.
- `extract-result-narrative`: Extracts exceptional items and auditor qualifications from filing text.
- `extract-income-statement`: Parses income statement tables from filing text.
- `extract-statements`: Extracts Balance Sheet and Cash Flow statements from filing or presentation text.
- `run-statement-signals`: Runs deterministic signal scans over Balance Sheet and Cash Flow statements.
- `compute-headline-financials`: Computes headline metrics (Revenue, EBITDA margin, PAT, Tax Rate, EPS).
- `save-result-documents`: Persists quarterly-result-documents DTO to the database chokepoint.

## Deterministic Report Rendering Scripts

- `render-quarterly-result-pdf`: Renders a `quarterly-result` JSON DTO into an institutional HTML/PDF report with standardized palette, NBFC quality checks, and runtime improvisation space (`--input <path> --output <path>`).
- `render-rerating-catalysts-pdf`: Renders a `rerating-catalysts` JSON DTO into an institutional HTML/PDF report with J-Curve inflection banner, core triggers, spike analysis, and runtime improvisation space (`--input <path> --output <path>`).

## Test

```bash
yarn workspace @stock/api test
```
