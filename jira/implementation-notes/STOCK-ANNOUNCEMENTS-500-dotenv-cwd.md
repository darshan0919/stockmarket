# Bug: GET /api/announcements/:symbol returned 500 despite valid STOCKSCANS_AUTH_TOKEN

## Summary

Two issues were involved:

1. **Wrong `.env` path** — The backend used `require('dotenv').config()` with no path, so `.env` was loaded from **`process.cwd()`** instead of the `backend/` directory. Starting the API from the **repository root** (e.g. `node backend/server.js`, or some IDE run configurations) did not load `backend/.env`, so `STOCKSCANS_AUTH_TOKEN` and other vars were missing at runtime.

2. **StockScans HTTP 500** — Even with a cookie value present, StockScans may respond with **HTTP 500** and `{ "status": "error", "message": "Internal error occurred" }` (e.g. expired or invalid JWT). That is upstream behavior, not something we can fix server-side except by refreshing the token.

## Fix

- **`backend/server.js`**: `dotenv.config({ path: path.join(__dirname, '.env') })` so env vars always load from `backend/.env` next to `server.js`.
- **`backend/services/stockscansAuth.js`**: Trim `STOCKSCANS_AUTH_TOKEN` to avoid stray newlines from `.env` breaking the cookie.
- **`backend/services/stockscansAnnouncements.js`**: Skip invalid `companyAnnouncements` rows; filter nulls after map.
- **`backend/controllers/announcementsController.js`**:
  - Try StockScans when `STOCKSCANS_AUTH_TOKEN` is set; on **any** StockScans failure, **fall back to NSE** `corporate-announcements` so the tab returns **200** with data.
  - Map upstream HTTP errors to **502** only when both providers fail (e.g. NSE down).
- **Frontend** (`AnnouncementsTab`): Track `meta.provider` (`stockscans` vs `nse`), disable pagination for NSE, and apply local search when provider is NSE and query is 3+ characters.

## Verification

1. From repo root: `PORT=5056 node backend/server.js` with `backend/.env`.
2. `curl -s http://localhost:5056/api/announcements/WAAREERTL` → `200`, `success: true`, `meta.provider` is `nse` when StockScans fails, or `stockscans` when upstream succeeds.

## Jira

No separate Jira issue was created in a team project from this repo; track this file and the PR.

## Status

Fixed in codebase (see commit).
