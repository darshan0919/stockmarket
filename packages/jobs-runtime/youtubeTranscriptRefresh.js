#!/usr/bin/env node
'use strict';

/**
 * YouTube Transcript Refresh — fetches caption transcripts for every public
 * video uploaded to a YouTube channel (default: SOIC Finance, @SOICfinance),
 * storing them in the `youtube-transcripts` collection (docs/DATA_ECOSYSTEM.md §1).
 *
 * This is unrelated to stock-research data (channel commentary/course
 * content, not company-scoped) — no `companyId`/`buildCompanyContext`
 * involvement.
 *
 * Two-stage pipeline, documented in full at docs/youtube-api-schemas.md:
 *   1. YouTube Data API v3 (`channels.list` + `playlistItems.list`) —
 *      resolve the channel handle to a channel id + uploads playlist, then
 *      paginate every video in it. Auth: prefers a plain `YOUTUBE_API_KEY`
 *      when set (simplest). Falls back to OAuth2 with the same credentials
 *      already configured for Google Drive (`GOOGLE_CLIENT_ID`/
 *      `GOOGLE_CLIENT_SECRET`/`GOOGLE_REFRESH_TOKEN` — see
 *      `cloud-utils/src/googleDriveApi.js`'s `createDriveClient`) only if no
 *      API key is set — that path needs the same Cloud project to have
 *      YouTube Data API v3 enabled AND the refresh token's consent to
 *      include the `youtube.readonly` scope (the Drive-only token in this
 *      repo does not have it) — see `createYoutubeClient()`.
 *   2. Caption fetch via `yt-dlp` (external binary, shelled out to) with
 *      `--impersonate chrome` — downloads the best available subtitle track
 *      (manual preferred over auto-generated) as VTT, then parses it into
 *      timestamped + plain text. A plain unauthenticated `fetch()` against
 *      YouTube's caption endpoints (the previous approach here) started
 *      returning empty bodies as of 2026-08 (YouTube's anti-bot behavior on
 *      that endpoint) — yt-dlp's TLS-impersonation support is what makes
 *      this reliable again. This is the only way to get transcript text for
 *      a channel you don't own; the official `captions.download` endpoint
 *      requires OAuth as the channel owner. Requires `yt-dlp` + `curl_cffi`
 *      installed (see docs/youtube-api-schemas.md).
 *
 * Cache-first (mandatory, per user requirement): a video already present in
 * the `youtube-transcripts` collection (by deterministic id) is skipped on
 * every subsequent run unless --force is passed. Only genuinely new videos
 * get fetched, which is what makes repeat runs cheap.
 *
 * Pure extraction (conventions.md §17) — no LLM/judgment step anywhere in
 * this pipeline, so no `modelUsed` is ever set on the records it writes.
 *
 * Usage:
 *   node youtubeTranscriptRefresh.js [--channel-handle @SOICfinance]
 *     [--channel-id UC...] [--only ID,ID] [--skip ID,ID] [--force]
 *     [--recheck-no-captions] [--limit N] [--request-delay-ms N]
 *     [--env-file <path>]
 *
 * A video with no usable captions is cached too (`captionKind: 'none'`), not
 * just skipped in-memory — so a channel with many caption-less videos (e.g.
 * shorts, music-only clips) doesn't re-probe them with yt-dlp on every run.
 * --force re-fetches everything; --recheck-no-captions re-probes ONLY the
 * previously-no-captions videos (e.g. YouTube processed auto-captions since
 * the last run) while still skipping already-successful ones.
 *
 * Config (env or --env-file): YOUTUBE_API_KEY (preferred, no OAuth) OR
 *   GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN (fallback —
 *   reuses the Drive OAuth2 credentials, requires youtube.readonly consent) —
 *   one of the two is required.
 *   YOUTUBE_CHANNEL_HANDLE (default SOICfinance), YOUTUBE_CAPTION_LANG
 *   (default en), YOUTUBE_ALLOW_AUTO_CAPTIONS (default true),
 *   YOUTUBE_REQUEST_DELAY_MS (default 4000), YOUTUBE_MAX_RETRIES (default 4),
 *   YOUTUBE_YTDLP_COOKIES_FROM_BROWSER (unset by default — set to e.g.
 *   "chrome" if you hit YouTube's "Sign in to confirm you're not a bot"
 *   block; see docs/youtube-api-schemas.md).
 */

const db = require('./lib/db');
const { loadEnv, hasFlag, argValue } = require('./lib/env');

// ── Config ───────────────────────────────────────────────────────────────────

function loadConfig() {
  return {
    apiKey: process.env.YOUTUBE_API_KEY,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN,
    channelHandle: process.env.YOUTUBE_CHANNEL_HANDLE || 'SOICfinance',
    captionLang: process.env.YOUTUBE_CAPTION_LANG || 'en',
    allowAutoCaptions: process.env.YOUTUBE_ALLOW_AUTO_CAPTIONS !== 'false',
    requestDelayMs: Number(process.env.YOUTUBE_REQUEST_DELAY_MS || 4000),
    maxRetries: Number(process.env.YOUTUBE_MAX_RETRIES || 4),
    ytDlpPath: process.env.YOUTUBE_YTDLP_PATH || 'yt-dlp',
    ytDlpImpersonate: process.env.YOUTUBE_YTDLP_IMPERSONATE || 'chrome',
    // yt-dlp reads cookies straight out of the named browser's own cookie
    // store (we never see or handle the values) — this is yt-dlp's own
    // documented fix for the escalated "Sign in to confirm you're not a
    // bot" block, distinct from plain 429 rate-limiting. Unset by default;
    // set to e.g. "chrome" to enable. Requires that browser to be logged
    // into youtube.com, and (on macOS/Chrome) usually needs the browser
    // closed while yt-dlp reads its cookie DB.
    ytDlpCookiesFromBrowser: process.env.YOUTUBE_YTDLP_COOKIES_FROM_BROWSER || null,
  };
}

let _google = null;
function getGoogle() {
  if (!_google) {
    try {
      _google = require('googleapis').google;
    } catch {
      throw new Error('googleapis package is required. Run: yarn add googleapis -W');
    }
  }
  return _google;
}

/**
 * Build a YouTube Data API v3 client. Prefers a plain API key
 * (`YOUTUBE_API_KEY`) when set — simplest, and sidesteps the OAuth2 scope
 * issue below. Falls back to OAuth2 with the existing Drive credentials
 * (same pattern as `createDriveClient` in cloud-utils/src/googleDriveApi.js)
 * only if no API key is configured — that path only works once the Cloud
 * project has YouTube Data API v3 enabled AND the refresh token's consent
 * grants `youtube.readonly` (the Drive-only token used in this repo does
 * NOT have that scope as of 2026-08-27 — see docs/youtube-api-schemas.md).
 */
function createYoutubeClient(cfg) {
  const google = getGoogle();
  if (cfg.apiKey) {
    return { youtube: google.youtube({ version: 'v3', auth: cfg.apiKey }), mode: 'apiKey' };
  }
  if (cfg.googleClientId && cfg.googleClientSecret && cfg.googleRefreshToken) {
    const auth = new google.auth.OAuth2(cfg.googleClientId, cfg.googleClientSecret);
    auth.setCredentials({ refresh_token: cfg.googleRefreshToken });
    return { youtube: google.youtube({ version: 'v3', auth }), mode: 'oauth2' };
  }
  throw new Error(
    'Missing YouTube auth: set YOUTUBE_API_KEY, or GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + ' +
      'GOOGLE_REFRESH_TOKEN with youtube.readonly consent (env or --env-file). See .env.example.'
  );
}

/** True if a googleapis error looks like a missing OAuth scope, not an expired/invalid token. */
function isInsufficientScopeError(err) {
  const msg = String((err && err.message) || err);
  return /insufficient.?(scope|permission)|insufficientPermissions/i.test(msg);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  return {
    channelHandle: argValue('--channel-handle', argv),
    channelId: argValue('--channel-id', argv),
    only: argValue('--only', argv)
      ? new Set(
          argValue('--only', argv)
            .split(',')
            .map((s) => s.trim())
        )
      : null,
    skip: argValue('--skip', argv)
      ? new Set(
          argValue('--skip', argv)
            .split(',')
            .map((s) => s.trim())
        )
      : null,
    force: hasFlag('--force', argv),
    recheckNoCaptions: hasFlag('--recheck-no-captions', argv),
    limit: argValue('--limit', argv) ? Number(argValue('--limit', argv)) : null,
    requestDelayMsOverride: argValue('--request-delay-ms', argv),
  };
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

async function withRetry(fn, { maxRetries, label }) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err.code || (err.response && err.response.status);
      // Auth/quota failures will not resolve on retry — fail fast with a
      // clear message rather than burning retries on it.
      if (status === 401 || status === 403 || /HTTP 401|HTTP 403/.test(err.message)) {
        if (isInsufficientScopeError(err)) {
          throw new Error(
            `${label}: OAuth token lacks the youtube.readonly scope (${err.message}). The existing ` +
              'GOOGLE_REFRESH_TOKEN was minted for Drive access only — re-run the OAuth consent for this ' +
              'Google Cloud project with the https://www.googleapis.com/auth/youtube.readonly scope added, ' +
              'or set YOUTUBE_API_KEY instead (see .env.example).'
          );
        }
        throw new Error(
          `${label}: authentication/quota failed (${err.message}). Check the Google/YouTube credentials ` +
            'in .env are valid and the YouTube Data API v3 is enabled on its Google Cloud project.'
        );
      }
      // yt-dlp's escalated bot-check ("Sign in to confirm you're not a
      // bot") is not transient — retrying with backoff wastes time. yt-dlp
      // itself says the fix is cookies from a real logged-in browser
      // session, so surface that immediately instead of burning retries.
      if (/Sign in to confirm you.{1,3}re not a bot/i.test(err.message)) {
        throw new Error(
          `${label}: YouTube is requiring sign-in verification (not a rate limit — retrying won't help). ` +
            'Set YOUTUBE_YTDLP_COOKIES_FROM_BROWSER=chrome (or your browser) in .env so yt-dlp authenticates ' +
            'with your logged-in browser session. Close that browser first if it errors that the cookie DB ' +
            'is locked. See docs/youtube-api-schemas.md.'
        );
      }
      if (attempt < maxRetries) {
        const backoff = 2000 * Math.pow(2, attempt);
        console.warn(
          `  ${label}: retry ${attempt + 1}/${maxRetries} after error: ${err.message} (waiting ${backoff}ms)`
        );
        await sleep(backoff);
      }
    }
  }
  throw lastErr;
}

/** channels.list(forHandle=...) -> {channelId, channelTitle, uploadsPlaylistId}. */
/** Shared channels.list call + response mapping for both lookup modes below. */
async function fetchChannel(cfg, youtube, query, label) {
  const data = await withRetry(
    async () => {
      const res = await youtube.channels.list({
        part: ['contentDetails', 'snippet', 'statistics'],
        ...query,
      });
      return res.data;
    },
    { maxRetries: cfg.maxRetries, label }
  );
  const item = (data.items || [])[0];
  if (!item) return null;
  return {
    channelId: item.id,
    channelTitle: item.snippet && item.snippet.title,
    uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
    // `statistics.videoCount` is the channel's total PUBLIC video count
    // (per YouTube Data API v3 docs).
    videoCount:
      item.statistics && item.statistics.videoCount ? Number(item.statistics.videoCount) : null,
  };
}

async function resolveChannel(cfg, youtube, handle) {
  const cleanHandle = handle.replace(/^@/, '');
  const channel = await fetchChannel(
    cfg,
    youtube,
    { forHandle: cleanHandle },
    `resolveChannel(@${cleanHandle})`
  );
  if (!channel) throw new Error(`No channel found for handle @${cleanHandle}`);
  return channel;
}

/** Same as resolveChannel but by known channel id (--channel-id), skipping the handle lookup. */
async function fetchChannelById(cfg, youtube, channelId) {
  const channel = await fetchChannel(
    cfg,
    youtube,
    { id: channelId },
    `fetchChannelById(${channelId})`
  );
  // Fall back to the synthesized uploads playlist id (UC -> UU prefix) if
  // the id lookup itself fails for some reason — still lets the run proceed.
  return (
    channel || {
      channelId,
      channelTitle: null,
      uploadsPlaylistId: `UU${channelId.slice(2)}`,
      videoCount: null,
    }
  );
}

/** Paginate playlistItems.list for a channel's uploads playlist -> full video list. */
async function fetchChannelVideos(cfg, youtube, uploadsPlaylistId, { limit } = {}) {
  const videos = [];
  let pageToken;
  do {
    const data = await withRetry(
      async () => {
        const res = await youtube.playlistItems.list({
          part: ['snippet', 'contentDetails'],
          playlistId: uploadsPlaylistId,
          maxResults: 50,
          pageToken,
        });
        return res.data;
      },
      { maxRetries: cfg.maxRetries, label: `fetchChannelVideos(page ${videos.length / 50 + 1})` }
    );
    for (const item of data.items || []) {
      videos.push({
        videoId: item.contentDetails.videoId,
        title: item.snippet.title,
        publishedAt: item.contentDetails.videoPublishedAt || item.snippet.publishedAt,
        position: item.snippet.position,
      });
    }
    pageToken = data.nextPageToken;
    if (limit && videos.length >= limit) return videos.slice(0, limit);
  } while (pageToken);
  return videos;
}

// ── Caption fetch via yt-dlp ─────────────────────────────────────────────────
//
// Direct, unauthenticated requests to YouTube's caption endpoints (a plain
// watch-page scrape + `timedtext` fetch) are blocked as of 2026-08 — YouTube
// returns HTTP 200 with an EMPTY body for every format, which is their
// current anti-bot behavior on that endpoint (confirmed live: valid signed
// URLs, not expired, not a language issue — just silently withheld from a
// plain Node `fetch`). `yt-dlp` (an actively-maintained, widely-used
// open-source downloader — NOT a bespoke bot-detection bypass written here)
// keeps up with this and reliably succeeds when invoked with
// `--impersonate chrome` (TLS/HTTP2 fingerprinting via the `curl_cffi`
// Python package). See docs/youtube-api-schemas.md §3/§4 for the full
// writeup and setup requirements (`brew install yt-dlp` +
// `<yt-dlp's python> -m pip install curl_cffi`).

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');
const execFileAsync = promisify(execFile);

/** Throws a clear, actionable error if the yt-dlp binary isn't on PATH. */
async function checkYtDlpAvailable(cfg) {
  try {
    await execFileAsync(cfg.ytDlpPath, ['--version']);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        `yt-dlp not found (looked for "${cfg.ytDlpPath}"). Install it: brew install yt-dlp. ` +
          'Caption downloads also need TLS impersonation support: after installing, run ' +
          '`$(brew --prefix yt-dlp)/libexec/bin/python3 -m pip install curl_cffi` (see docs/youtube-api-schemas.md).'
      );
    }
    throw err;
  }
}

/**
 * Download one video's captions to a temp dir via yt-dlp, preferring manual
 * (human-uploaded) subtitles over auto-generated ones, matching
 * `cfg.captionLang` (regex-matched, so "en" also picks up "en-US"/"en-orig").
 * Returns { captionKind, captionLang, cues, timestamped, plain } or
 * { captionKind: null } if the video has no usable captions.
 */
async function fetchTranscriptViaYtDlp(cfg, videoId) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytt-'));
  try {
    const attempts = [{ flag: '--write-subs', kind: 'manual' }];
    if (cfg.allowAutoCaptions) attempts.push({ flag: '--write-auto-sub', kind: 'asr' });

    for (const { flag, kind } of attempts) {
      const outTemplate = path.join(tmpDir, '%(id)s');
      const args = [
        '--skip-download',
        flag,
        '--sub-langs',
        `${cfg.captionLang}.*`,
        '--sub-format',
        'vtt',
        '--impersonate',
        cfg.ytDlpImpersonate,
      ];
      if (cfg.ytDlpCookiesFromBrowser) {
        args.push('--cookies-from-browser', cfg.ytDlpCookiesFromBrowser);
      }
      args.push('-o', outTemplate, `https://www.youtube.com/watch?v=${videoId}`);
      await withRetry(() => execFileAsync(cfg.ytDlpPath, args), {
        maxRetries: cfg.maxRetries,
        label: `yt-dlp(${videoId}, ${kind})`,
      });
      const vttFile = fs.readdirSync(tmpDir).find((f) => f.endsWith('.vtt'));
      if (!vttFile) continue; // no track of this kind — try the next
      const vttMatch = vttFile.match(/\.([a-zA-Z-]+)\.vtt$/);
      const captionLang = vttMatch ? vttMatch[1] : cfg.captionLang;
      const cues = parseVttCues(fs.readFileSync(path.join(tmpDir, vttFile), 'utf8'));
      const { timestamped, plain } = transcriptTexts(cues);
      return { captionKind: kind, captionLang, cues, timestamped, plain };
    }
    return { captionKind: null };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

const VTT_TIMESTAMP_RE = /^(\d{2}:\d{2}:\d{2})\.\d{3} --> /;

/**
 * Parse a YouTube auto-caption VTT file into deduped {start, text} cues.
 * YouTube's auto-caption VTT is a "rolling karaoke" format: each cue block
 * repeats the previous completed line, then appends the next growing line —
 * so only the LAST line of each cue block is new content, and consecutive
 * duplicate last-lines (the "hold" cues between growth steps) are dropped.
 */
function parseVttCues(vttText) {
  const lines = vttText.split(/\r?\n/);
  const cues = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(VTT_TIMESTAMP_RE);
    if (m) {
      const start = m[1];
      i++;
      // Per the WebVTT spec, a cue block ends at a truly EMPTY line — a
      // line containing a single space (as YouTube's auto-caption VTT uses
      // for its first cue line) is valid cue content, not a separator.
      // Checking `.trim() !== ''` here would wrongly end the block one line
      // early and silently drop that cue's real first line.
      const cueLines = [];
      while (i < lines.length && lines[i] !== '') {
        cueLines.push(lines[i]);
        i++;
      }
      cues.push({ start, cueLines });
    } else {
      i++;
    }
  }

  const out = [];
  let prevText = null;
  for (const cue of cues) {
    const cleaned = cue.cueLines.map((l) => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
    if (!cleaned.length) continue;
    const text = cleaned[cleaned.length - 1];
    if (!text || text === prevText) continue;
    out.push({ start: cue.start, text });
    prevText = text;
  }
  return out;
}

/** {start, text}[] -> timestamped ("[HH:MM:SS] text") + flowing plain text. */
function transcriptTexts(cues) {
  return {
    timestamped: cues.map((c) => `[${c.start}] ${c.text}`).join('\n'),
    plain: cues.map((c) => c.text).join(' '),
  };
}

// ── Persistence (youtube-transcripts collection — see db.js saveYoutubeTranscript) ──

/** Deterministic id: same video -> same id -> upsert, never a duplicate. */
function videoRecordId(channelId, videoId) {
  return db.makeId('ytt', 'youtube-transcript-refresh', channelId, undefined, videoId);
}

/**
 * Cache-first check: returns the existing record for this video, or null if
 * never fetched. A record with `captionKind: 'none'` means the video was
 * already checked and confirmed to have no usable captions (see
 * `buildTranscriptDto`'s `transcript: NO_CAPTIONS_TRANSCRIPT` case) — that's
 * cached too, so a video that will never have captions isn't re-probed with
 * yt-dlp on every run.
 */
function alreadyFetched(channelId, videoId) {
  return db.get('youtube-transcripts', videoRecordId(channelId, videoId)) || null;
}

const NO_CAPTIONS_TRANSCRIPT = { timestamped: null, plain: null, cues: null };

function buildTranscriptDto({
  channelId,
  channelHandle,
  channelTitle,
  video,
  captionKind,
  captionLang,
  transcript,
}) {
  return {
    id: videoRecordId(channelId, video.videoId),
    type: 'youtube-transcript',
    creator: 'youtube-transcript-refresh',
    channelId,
    channelHandle,
    channelTitle,
    videoId: video.videoId,
    videoTitle: video.title,
    publishedAt: video.publishedAt,
    captionLang,
    captionKind,
    fetchedAt: new Date().toISOString(),
    transcriptTimestamped: transcript.timestamped,
    transcriptPlain: transcript.plain,
    rawCues: transcript.cues,
  };
}

// ── Main orchestration ──────────────────────────────────────────────────────

async function main() {
  loadEnv(argValue('--env-file', process.argv));
  const cfg = loadConfig();

  let youtube, authMode;
  try {
    ({ youtube, mode: authMode } = createYoutubeClient(cfg));
    await checkYtDlpAvailable(cfg);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  const args = parseArgs(process.argv);
  if (args.requestDelayMsOverride) cfg.requestDelayMs = Number(args.requestDelayMsOverride);
  const handle = args.channelHandle || cfg.channelHandle;

  console.log(
    `Auth mode: ${authMode === 'oauth2' ? 'OAuth2 (Drive credentials reused)' : 'API key'}`
  );
  console.log(
    args.channelId
      ? `Resolving channel id ${args.channelId}...`
      : `Resolving channel handle @${handle.replace(/^@/, '')}...`
  );
  const channel = args.channelId
    ? await fetchChannelById(cfg, youtube, args.channelId)
    : await resolveChannel(cfg, youtube, handle);

  console.log(`Channel: ${channel.channelTitle || channel.channelId} (${channel.channelId})`);
  if (channel.videoCount != null) {
    console.log(`Total videos on channel: ${channel.videoCount}`);
  }
  console.log('Listing uploaded videos...');
  let videos = await fetchChannelVideos(cfg, youtube, channel.uploadsPlaylistId, {
    limit: args.limit,
  });
  if (args.only) videos = videos.filter((v) => args.only.has(v.videoId));
  if (args.skip) videos = videos.filter((v) => !args.skip.has(v.videoId));
  console.log(`${videos.length} video(s) to process.`);

  const summary = {
    videosFetched: 0,
    videosCachedSkipped: 0,
    videosNoCaptionsCachedSkipped: 0,
    videosNoCaptions: 0,
    videosFailed: [],
  };

  for (const [i, video] of videos.entries()) {
    const label = `[${i + 1}/${videos.length}] ${video.videoId} — ${video.title}`;

    const cached = alreadyFetched(channel.channelId, video.videoId);
    const cachedNoCaptions = cached && cached.captionKind === 'none';
    if (cached && !args.force && !(cachedNoCaptions && args.recheckNoCaptions)) {
      if (cachedNoCaptions) {
        console.log(`${label}: no captions (checked previously), skipping`);
        summary.videosNoCaptionsCachedSkipped++;
      } else {
        console.log(`${label}: already cached, skipping`);
        summary.videosCachedSkipped++;
      }
      continue;
    }

    try {
      console.log(`${label}: fetching...`);
      const result = await fetchTranscriptViaYtDlp(cfg, video.videoId);
      const dto = buildTranscriptDto({
        channelId: channel.channelId,
        channelHandle: handle,
        channelTitle: channel.channelTitle,
        video,
        captionKind: result.captionKind || 'none',
        captionLang: result.captionLang || null,
        transcript: result.captionKind ? result : NO_CAPTIONS_TRANSCRIPT,
      });
      db.saveYoutubeTranscript(dto);
      if (result.captionKind) {
        summary.videosFetched++;
        console.log(`${label}: OK (${result.captionKind})`);
      } else {
        summary.videosNoCaptions++;
        // Still cached (captionKind: 'none') so a future run skips this
        // video by default instead of re-probing it with yt-dlp — see
        // --recheck-no-captions to override.
        console.log(`${label}: no usable captions, cached as checked`);
      }
    } catch (err) {
      console.error(`${label}: FAILED — ${err.message}`);
      summary.videosFailed.push({ videoId: video.videoId, title: video.title, error: err.message });
    }

    if (i < videos.length - 1) await sleep(cfg.requestDelayMs);
  }

  console.log('\n=== Run summary ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log('\nFiles touched:');
  for (const f of db.touchedFiles()) console.log(`  ${f}`);

  if (summary.videosFailed.length) {
    process.exitCode = 1;
  }
}

module.exports = {
  loadConfig,
  createYoutubeClient,
  isInsufficientScopeError,
  parseArgs,
  resolveChannel,
  fetchChannelById,
  fetchChannelVideos,
  checkYtDlpAvailable,
  fetchTranscriptViaYtDlp,
  parseVttCues,
  transcriptTexts,
  videoRecordId,
  alreadyFetched,
  buildTranscriptDto,
  main,
  sleep,
};

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exitCode = 1;
  });
}
