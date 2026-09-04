# YouTube API — payload/response schemas

Single source of truth for every YouTube endpoint `youtubeTranscriptRefresh.js`
(`packages/jobs-runtime/`) calls. Two very different auth models are in play:

| Purpose                                                          | API                                                                                               | Auth                                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Resolve a channel handle → channel id + list its uploaded videos | YouTube Data API v3 (`channels.list`, `playlistItems.list`)                                       | Plain API key (preferred) or OAuth2 (fallback — reuses the Drive credentials, see below) |
| Fetch the actual transcript text for one video                   | `yt-dlp` (external CLI, `--impersonate chrome`) — see §3, direct unauthenticated fetch is blocked | None (no Google credential) — but requires the `yt-dlp` + `curl_cffi` system dependency  |

The official `captions.download` endpoint (YouTube Data API v3) is **not**
used here — it requires OAuth2 as the video's owner/channel manager, which
only works for videos in the authenticated user's own channel. Fetching a
transcript for someone else's public channel (e.g. `@SOICfinance`, `@AnilLamba`) is not
possible through the official captions API, so this pipeline uses the same
unofficial caption-track approach as widely-used libraries like
`youtube-transcript`/`youtube-transcript-api`.

**Auth for endpoints #1/#2 (`createYoutubeClient()` in
`youtubeTranscriptRefresh.js`)**: prefers a plain API key (`YOUTUBE_API_KEY`)
when set — simplest, and sidesteps the OAuth scope issue below. Falls back to
OAuth2 with the same credentials already configured for Google Drive
(`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REFRESH_TOKEN`, same
pattern as `createDriveClient` in `cloud-utils/src/googleDriveApi.js`) only
if no API key is set. That OAuth2 path requires:

1. The same Google Cloud project that issued those Drive credentials also has
   **YouTube Data API v3** enabled (APIs & Services → Library).
2. The refresh token's original OAuth consent included the
   `https://www.googleapis.com/auth/youtube.readonly` scope. A token minted
   only for Drive access (e.g. `https://www.googleapis.com/auth/drive`) will
   fail these two calls with a 403 "insufficient scope" error even though the
   API itself is enabled — confirmed live 2026-08-27: this repo's Drive-only
   `GOOGLE_REFRESH_TOKEN` does NOT have the YouTube scope. The consent screen
   has to be re-run with the YouTube scope added to mint a new refresh token.
   `createYoutubeClient()` surfaces this distinctly from an expired/invalid
   token (see `isInsufficientScopeError()`), because the fix is different
   (re-consent, not just refresh).

---

## 1. GET youtube.googleapis.com/youtube/v3/channels (`forHandle`)

Resolves a channel handle (e.g. `@SOICfinance` or `@AnilLamba`) to its channel id and its
"uploads" playlist id (every channel has one auto-generated playlist
containing all its public uploads in reverse-chronological order).

**Request:**

```
GET https://www.googleapis.com/youtube/v3/channels
    ?part=contentDetails,snippet
    &forHandle=SOICfinance
    &key=<YOUTUBE_API_KEY>
```

`forHandle` takes the handle **without** the leading `@`. Full URLs (e.g.
`https://www.youtube.com/@AnilLamba`) are automatically parsed and normalized.
Alternatively `forUsername` (legacy custom URLs) or `id` (a known channel id, `UC...`) can
be passed instead — the script accepts raw channel ids via `--channel-id` / `--channel-ids` to
skip this lookup entirely. Multiple channels can be supplied via `--channels @SOICfinance,@AnilLamba`
or `YOUTUBE_CHANNEL_HANDLES`.

**Response:**

```json
{
  "kind": "youtube#channelListResponse",
  "items": [
    {
      "id": "UCxxxxxxxxxxxxxxxxxxxxxx",
      "snippet": { "title": "SOIC Finance", "customUrl": "@soicfinance" },
      "contentDetails": {
        "relatedPlaylists": {
          "uploads": "UUxxxxxxxxxxxxxxxxxxxxxx"
        }
      }
    }
  ]
}
```

Notes:

- `items` is empty if the handle doesn't resolve — treat as a fatal
  config error, not a retryable one.
- `contentDetails.relatedPlaylists.uploads` is the id needed for endpoint #2.
  It is always `id` with the `UC` prefix replaced by `UU`.

---

## 2. GET youtube.googleapis.com/youtube/v3/playlistItems

Paginates every video in the channel's uploads playlist, newest first.

**Request:**

```
GET https://www.googleapis.com/youtube/v3/playlistItems
    ?part=snippet,contentDetails
    &playlistId=UUxxxxxxxxxxxxxxxxxxxxxx
    &maxResults=50
    &pageToken=<optional, from previous page's nextPageToken>
    &key=<YOUTUBE_API_KEY>
```

**Response:**

```json
{
  "kind": "youtube#playlistItemListResponse",
  "nextPageToken": "CAUQAA",
  "pageInfo": { "totalResults": 412, "resultsPerPage": 50 },
  "items": [
    {
      "snippet": {
        "title": "How to Read a Balance Sheet",
        "publishedAt": "2026-08-01T10:00:00Z",
        "resourceId": { "kind": "youtube#video", "videoId": "abc123XYZ" },
        "position": 0
      },
      "contentDetails": { "videoId": "abc123XYZ", "videoPublishedAt": "2026-08-01T10:00:00Z" }
    }
  ]
}
```

Notes:

- `nextPageToken` absent = last page. Keep paginating until it's gone or
  `--limit` videos have been collected.
- `contentDetails.videoPublishedAt` (when the video actually went public) is
  used in preference to `snippet.publishedAt` (when it was added to the
  playlist) — normally identical for a straightforward upload, but can differ
  for a video that was scheduled/premiered.
- Quota cost: 1 unit per page (very cheap — a channel with 400 videos costs
  ~8 units against the default 10,000/day quota).

---

## 3. Caption fetch — DIRECT unauthenticated requests are blocked (2026-08)

The original design of this pipeline was: scrape the watch page HTML for the
embedded `captionTracks` array (like every open-source transcript library
does), then `GET` the track's `baseUrl` directly for the transcript body.
**This no longer works as of 2026-08.** Confirmed live, repeatedly, against
multiple videos: the watch-page scrape still succeeds, and the extracted
`baseUrl` is a validly-signed, non-expired URL — but a plain unauthenticated
`fetch()`/`curl` against that `baseUrl` (in any format: default XML,
`fmt=json3`, `fmt=srv3`, `fmt=vtt`) returns **HTTP 200 with an empty body**.
No error, no 403 — just silently withheld. This matches YouTube's newer
anti-bot enforcement on the `timedtext` endpoint (TLS/HTTP2 fingerprint and/or
proof-of-origin-token checks), the same failure mode reported across the
`youtube-transcript`/`youtube-transcript-api` ecosystem around the same time.

**What works**: [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) (an
actively-maintained, widely-used open-source downloader — this repo shells
out to the real published tool, it does not reimplement any bypass) with
`--impersonate chrome`, which uses the `curl_cffi` Python package to make the
HTTP/TLS handshake match a real Chrome browser. Verified working end-to-end
against `@SOICfinance` videos on 2026-08-27.

**Setup** (one-time, system-level — not an npm dependency):

```bash
brew install yt-dlp
$(brew --prefix yt-dlp)/libexec/bin/python3 -m pip install curl_cffi
```

The second command is required — without `curl_cffi`, `--impersonate chrome`
is unavailable (`yt-dlp --list-impersonate-targets` shows `(unavailable)` for
every target) and caption downloads hit the same empty-body wall as a plain
fetch.

**Command** (`fetchTranscriptViaYtDlp()` in `youtubeTranscriptRefresh.js`):

```bash
yt-dlp --skip-download --write-subs \
  --sub-langs "en.*" --sub-format vtt \
  --impersonate chrome \
  -o "<tmpdir>/%(id)s" \
  "https://www.youtube.com/watch?v=<videoId>"
```

Run once with `--write-subs` (manual/human-uploaded captions); if no `.vtt`
file is produced, re-run with `--write-auto-sub` instead (auto-generated,
`kind: asr`) when `YOUTUBE_ALLOW_AUTO_CAPTIONS` allows it. `--sub-langs
"en.*"` is a regex match, so it also picks up `en-US`/`en-orig`/etc without
needing to enumerate every variant. The output filename encodes the actual
language matched, e.g. `<videoId>.en.vtt`.

Notes:

- **429 Too Many Requests** was observed when re-requesting the _same_
  video+format combination repeatedly within a short window during testing —
  this looks like a per-resource, not a global, rate limit; retrying a
  different video or waiting briefly resolved it. `withRetry()` (exponential
  backoff, same as the Learnyst pipeline) covers this.
- This is still an **unofficial, third-party-tool-dependent mechanism** —
  yt-dlp is maintained precisely because YouTube's page/anti-bot behavior
  changes frequently; a yt-dlp version bump may occasionally be needed if
  this starts failing broadly again (`brew upgrade yt-dlp`).
- The official `captions.download` API endpoint remains unusable for this
  purpose (OAuth as the channel owner only) — see the top of this doc.

---

## 4. VTT transcript parsing (`parseVttCues()`)

YouTube's auto-caption VTT is a "rolling karaoke" format, not one cue per
sentence — each cue block repeats the previous completed line, then appends
the next partially-typed line as it's recognized:

```
00:00:02.800 --> 00:00:05.670 align:start position:0%

Hi <00:00:03.165><c>Investors </c><00:00:03.530><c>Welcome</c>...to SIC So in today's

00:00:05.670 --> 00:00:05.680 align:start position:0%
Hi Investors Welcome to SIC So in today's


00:00:05.680 --> 00:00:07.670 align:start position:0%
Hi Investors Welcome to SIC So in today's
Unique <00:00:05.875><c>Business </c>...to analyze an
```

Parsing approach: for each cue block, strip the inline `<HH:MM:SS.mmm><c>`
karaoke tags, take only the **last line** of the (up to two-line) cue block —
that's the newest content — and drop a cue if its last line is identical to
the previously-kept line (the "hold" cues between growth steps, like the
middle block above). This reconstructs one clean line per spoken phrase
without the duplication. Manually-uploaded (non-auto) VTT captions are
usually already one-cue-per-line and pass through this same logic unchanged
(no last-line dedup needed since there's nothing to dedup).

---

## Rate limiting / quota (operational, not part of the API contract)

- **Data API v3 quota**: default 10,000 units/day. `channels.list` = 1 unit,
  `playlistItems.list` = 1 unit/page (50 videos/page). A full channel refresh
  costs single-digit-to-low-double-digit units — not a practical constraint
  unless the script is run very frequently.
- **Caption fetches (yt-dlp)**: unofficial, undocumented, subject to
  YouTube's anti-bot enforcement — treat as the highest abuse-risk part of
  the pipeline. `YOUTUBE_REQUEST_DELAY_MS` (default 4000ms) paces requests
  between videos; cache-first fetching (`db.get('youtube-transcripts', id)`
  gate) means a full channel is only ever fully walked once, and later runs
  only touch new videos.
- **Two distinct failure modes observed, needing different fixes**:
  1. A plain `429 Too Many Requests` on one video, recovering on retry a few
     seconds later — transient, per-resource throttling. The built-in
     exponential backoff (`withRetry`, 2s→4s→8s→16s) already handles this.
  2. `ERROR: Sign in to confirm you're not a bot` — an escalated block, not
     transient (confirmed: retrying with backoff does NOT clear it). This
     shows up after sustained request volume from one IP. yt-dlp's own fix,
     which this script wires up via `--cookies-from-browser`, is to
     authenticate using a real logged-in browser session's cookies
     (`YOUTUBE_YTDLP_COOKIES_FROM_BROWSER=chrome`, see `.env.example`) — the
     script detects this specific error and fails fast with that
     instruction rather than burning retries on it.
- **For a large backfill**, batch with `--limit N` across multiple
  invocations rather than one unlimited run — sustained low-volume batches
  are far less likely to trigger the escalated block than one long run.
