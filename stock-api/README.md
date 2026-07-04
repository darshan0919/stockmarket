# @stock/api

Centralized stock-data API clients for the whole stack. One source of truth per
datum, split by domain:

| Client | Owns | Use for |
|---|---|---|
| `StockscansClient` | **Fundamentals** | documents, announcements, scans, watchlists, screener, card-detail metrics |
| `NseClient` | **Price-action** | quote, live delivery %, price/volume/deliverable history, live gainers |
| `BseClient` | **Price-action** | traded/deliverable qty, delivery %, live quote header, scrip-code lookup |

> Rule: anything **fundamental** comes from Stockscans. NSE/BSE are **only** for
> price/volume/delivery. No endpoint is exposed on more than one client.

## Use (Node)

```js
const { stockscans, nse, bse } = require('@stock/api');

const scan = await stockscans.runScan(payload, scanId);   // fundamentals
const live = await nse.getSymbolData('TCS');              // price-action (delivery %)
const pos  = await bse.getSecurityPosition('500325');     // price-action
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

## Test

```bash
yarn workspace @stock/api test
```
