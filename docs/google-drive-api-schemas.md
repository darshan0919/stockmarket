# Google Drive API v3 — Schemas

> **Document Type**: External API Contract  
> **Client**: [`cloud-utils/src/googleDriveApi.js`](../cloud-utils/src/googleDriveApi.js)  
> **Confirmed**: yes — Google Drive REST API v3 (googleapis official SDK); matches the [official Drive API v3 reference](https://developers.google.com/drive/api/reference/rest/v3).

Used by: `packages/jobs-runtime/scripts/data.js` (`yarn data:push`, `yarn data:pull`, `yarn data:status`) for 1:1 sync of `data/` ↔ Drive `StockMarket/data/v2`.

---

## Authentication & Client Setup

**Auth**: OAuth2 via `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and long-lived `GOOGLE_REFRESH_TOKEN`.
Scoped to `https://www.googleapis.com/auth/drive`.
Configured and refreshed via `yarn data:auth` (`packages/jobs-runtime/scripts/googleAuth.js`).

**Timeout & Abort Strategy**:

- Metadata queries (`files.list`, folder creation, renames) use an `AbortController` timeout of 30,000 ms (30s) to prevent hanging indefinitely.
- Media upload and download streams calculate a dynamic timeout:
  - Base minimum: 120,000 ms (2 minutes).
  - Scaled by file size: `Math.max(120000, transferMs)` at 100 KB/s upload rate (e.g. 150 MB -> ~25.6 min; 350 MB -> ~60 min) or 200 KB/s download rate.
  - Can be overridden via `DRIVE_UPLOAD_TIMEOUT_MS` and `DRIVE_DOWNLOAD_TIMEOUT_MS` environment variables.

---

## 1. GET /drive/v3/files (`files.list`)

List files matching a query.

```http
GET https://www.googleapis.com/drive/v3/files?q=...&fields=...&pageSize=...
```

**Query Parameters**:
| Param | Type | Required | Notes |
| --- | --- | --- | --- |
| `q` | string | Yes | Query string (e.g. `'<folderId>' in parents and trashed = false`). |
| `fields` | string | Yes | Partial response selector (e.g. `files(id, name, size, modifiedTime, md5Checksum)`, `nextPageToken`). |
| `pageSize` | number | No | Page size (typically 100 for folder walks). |
| `pageToken` | string | No | Continuation token for next page. |

**Response Body (200)**:

```json
{
  "nextPageToken": "string",
  "files": [
    {
      "id": "1aX0AMVgtmJHcEroKTHHHUcmykPwzNQPq",
      "name": "filename.ext",
      "mimeType": "application/octet-stream",
      "size": "157286400",
      "modifiedTime": "2026-09-13T12:30:24.257Z",
      "md5Checksum": "d41d8cd98f00b204e9800998ecf8427e"
    }
  ]
}
```

---

## 2. POST /upload/drive/v3/files (`files.create`)

Create a new file or folder on Google Drive.

```http
POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart
```

**Request Body**:

- Folders: JSON metadata `{ "name": "...", "mimeType": "application/vnd.google-apps.folder", "parents": ["<folderId>"] }`.
- Files: Multipart body containing metadata `{ "name": "...", "parents": ["<folderId>"] }` and media read stream.

**Response Body (200)**:

```json
{
  "id": "1hmSCQtXCXuFQ91yYp_EAXpsxyLy0mCMt",
  "name": "filename.ext"
}
```

---

## 3. PATCH /upload/drive/v3/files/{fileId} (`files.update`)

Update existing file metadata or content stream on Google Drive.

```http
PATCH https://www.googleapis.com/upload/drive/v3/files/{fileId}?uploadType=multipart
```

**Path Parameters**:
| Param | Type | Required | Notes |
| --- | --- | --- | --- |
| `fileId` | string | Yes | ID of existing Drive file to overwrite. |

**Request Body**:

- Media: File readable stream.
- Request body: Optional metadata updates (e.g. `{ "name": "..." }` for renames).

**Response Body (200)**:

```json
{
  "id": "1hmSCQtXCXuFQ91yYp_EAXpsxyLy0mCMt",
  "name": "filename.ext"
}
```

---

## 4. GET /drive/v3/files/{fileId} (`files.get`)

Download media content stream.

```http
GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media
```

**Response**:
Binary stream piped directly to local file destination via Node.js `stream.pipeline`.

---

## Error Shapes

Google Drive API error format:

```json
{
  "error": {
    "code": 403,
    "message": "Rate Limit Exceeded",
    "errors": [
      {
        "message": "Rate Limit Exceeded",
        "domain": "usageLimits",
        "reason": "rateLimitExceeded"
      }
    ]
  }
}
```

On timeout abortion by `AbortController`:

- Node.js / gaxios throws an `AbortError`: `"The user aborted a request."` or `"Drive API timeout after <N>ms"`.
