# Announcements: bulk ZIP broken + wrong count (StockScans pagination)

## Tracking fields (local Jira)

Use this table for repo-local tracking. If the work is mirrored in a real Jira project, copy **Issue Key** here when known.

| Field | Value |
|--------|--------|
| **Issue Key** | — (optional external key, e.g. `PROJ-123`) |
| **Issue Type** | Bug |
| **Status** | Done |
| **Priority** | High |
| **Labels** | `announcements`, `stockscans`, `pagination`, `frontend` |
| **Component** | Announcements tab / StockScans integration |
| **Summary** | Bulk “Download ZIP” unreliable; announcements count wrong with StockScans pagination |
| **Affects version** | — |
| **Fix version** | — |
| **Reporter** | — |
| **Assignee** | — |
| **Created** | 2026-04-13 |
| **Updated** | 2026-04-13 |

## Description

1. **Bulk download (“Download ZIP”)** could hang, time out, or fail to collect all PDFs when listing announcements from **StockScans** with pagination.
2. **Announcements count** was misleading or inflated: “Load more” could repeat the same API page, duplicating rows and totals.

## Root cause

Pagination advanced the next offset as `(meta.offset ?? requestOffset) + batch.length`. StockScans often returns **`meta.offset: 0` on every page**. The nullish coalescing operator does not treat `0` as “missing”, so the expression used `0` instead of the **requested** offset. The client then reused the same offset (or advanced incorrectly), causing duplicate fetches and broken bulk ZIP collection.

Secondary: ZIP download path did not `encodeURIComponent` the symbol (e.g. `M&M`), unlike the list endpoint.

## Fix (codebase)

| Area | Change |
|------|--------|
| `frontend/lib/announcementBulkDownload.js` | After each page: `offset += batch.length` (do not derive next offset from `meta.offset` via `??`). |
| `frontend/components/stock/AnnouncementsTab.js` | `setNextOffset(offset + batch.length)` for StockScans; when `hasMore`, clarify copy: “loaded (more when you use Load more)”. |
| `frontend/lib/api.js` | `POST /announcements/:symbol/download` uses `encodeURIComponent(symbol)`. |

## Tests

- `frontend/lib/__tests__/announcementBulkDownload.test.js` — regression: `meta.offset` always `0`, offsets must be `0 → 1 → 2`.
- `frontend/lib/__tests__/api.test.js` — download path encodes symbol.

## Verification

```bash
cd frontend && npm test -- \
  --testPathPatterns=announcementBulkDownload \
  --testPathPatterns=api.test \
  --testPathPatterns=AnnouncementsTab \
  --no-coverage
```

Manual: StockScans provider → open a symbol with many announcements → **Load more** advances unique rows; **Bulk download → Download ZIP** completes.

## Links

- API: `docs/API_REFERENCE.md` (Announcements APIs)
- Related note: `jira/implementation-notes/STOCK-ANNOUNCEMENTS-500-dotenv-cwd.md`
