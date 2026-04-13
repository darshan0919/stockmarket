# StockScans announcements: HTTP 500 misread as generic server failure

## Tracking fields (local Jira)

| Field | Value |
|--------|--------|
| **Issue Key** | — |
| **Issue Type** | Bug |
| **Status** | Done |
| **Priority** | Medium |
| **Labels** | `announcements`, `stockscans`, `integration` |
| **Component** | Announcements tab / StockScans proxy |
| **Summary** | StockScans upstream HTTP 500 for unknown `companyId` produced misleading “try again” + token-refresh UI |
| **Created** | 2026-04-13 |
| **Updated** | 2026-04-13 |

## Description

Users saw:

- `StockScans server error (HTTP 500). Try again later.`
- Plus copy suggesting refreshing `STOCKSCANS_AUTH_TOKEN`, even when auth was fine.

## Root cause

StockScans `POST /api/company/announcements/search` often returns **HTTP 500** with body `{"message":"Internal error occurred"}` (or an empty object) when **`companyId` is not known** to their system (e.g. symbol not on StockScans). Valid tokens still get this response for bad tickers.

Our client overwrote the upstream message for every5xx with a generic “try again later” string, and the UI always suggested refreshing the JWT.

## Fix

| Area | Change |
|------|--------|
| `backend/services/stockscansAnnouncements.js` | Classify generic/internal/empty 5xx responses as `STOCKSCANS_BAD_COMPANY` with a clear message naming `companyId` and suggesting NSE or verifying on stockscans.in; keep distinct copy for specific upstream messages. |
| `frontend/components/stock/AnnouncementsTab.js` | Read `error.response.data.code`; show token hint only for auth-style errors; show NSE/symbol hint for `STOCKSCANS_BAD_COMPANY`. |

## Verification

- `yarn test backend/services/__tests__/stockscansAnnouncements.test.js`
- `yarn test frontend/components/stock/__tests__/AnnouncementsTab.test.js`
- Manual: with a valid token, call StockScans with a bogus `companyId` (e.g. `NSE:INVALIDXYZ123`) — expect 500 and new messaging; with `NSE:RELIANCE` expect 200.

## Links

- `backend/services/stockscansAnnouncements.js`
- `frontend/components/stock/AnnouncementsTab.js`
- `docs/API_REFERENCE.md` (Announcements APIs — error `code` values)
