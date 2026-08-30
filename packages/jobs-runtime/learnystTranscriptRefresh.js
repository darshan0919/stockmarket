#!/usr/bin/env node
'use strict';

/**
 * Learnyst Transcript Refresh — fetches AI-generated transcripts for every
 * video lesson across one or more Learnyst membership bundles (Darshan's
 * SOIC Membership, school 110998, bundle 97666; Chartitude Membership at
 * learn.chartitude.com; any future Learnyst-hosted course), storing them in
 * the `learnyst-lessons` collection (docs/DATA_ECOSYSTEM.md §1).
 *
 * Multi-site, config-driven (see `loadSiteConfig`/`loadSites` below): each
 * "site" is a distinct Learnyst-hosted school/membership, identified by a
 * short key (e.g. `soic`, `chartitude`) and configured entirely through
 * `LEARNYST_<KEY>_*` env vars — adding a new course/membership tomorrow is a
 * config change (new env vars + the key added to `LEARNYST_SITE_KEYS` or
 * `DEFAULT_SITE_KEYS`), never a code change. A site with no auth token
 * configured is skipped with a one-line notice rather than erroring, so
 * partial config (e.g. only SOIC set up) still runs cleanly.
 *
 * This is unrelated to stock-research data (personal course content, not
 * company-scoped) — no `companyId`/`buildCompanyContext` involvement.
 *
 * Three reverse-engineered Learnyst endpoints, documented in full at
 * docs/learnyst-api-schemas.md (read that before changing any request shape
 * here — same token, three different auth header conventions):
 *   1. POST apig.learnyst.com/learn (GraphQL ShowBundleCourses) — lists
 *      every module ("course") in the bundle. header: authorization.
 *   2. GET apig.learnyst.com/learner/v17/courses/{course_id} — lists a
 *      module's sections + lessons. header: lystauthorization (different
 *      name). Response body is base64-encoded JSON.
 *   3. GET ai-api.learnyst.com/api/transcript-data?content_path=... — the
 *      actual per-lesson transcript fetch. header: authorization.
 *
 * Some lessons have no `content_path` at all — their video is hosted
 * externally on YouTube (a `src_type: 5` entry, plain YouTube URL in `src`,
 * confirmed live 2026-08-27 across several lessons), so Learnyst's AI
 * transcript API (#3) has nothing to fetch. For those, `extractYoutubeVideoId()`
 * pulls the video id and the lesson falls back to youtubeTranscriptRefresh.js's
 * `fetchTranscriptViaYtDlp()` (reused, not reimplemented — same yt-dlp +
 * `--impersonate chrome` pipeline, see docs/youtube-api-schemas.md), storing
 * the result in the same `learnyst-lessons` collection with
 * `transcriptSource: 'youtube'` on the record. Needs `yt-dlp` installed (see
 * youtubeTranscriptRefresh.js's header) — if it isn't, YouTube-hosted lessons
 * are skipped (recorded as failed) rather than aborting the whole run.
 *
 * Cache-first (mandatory, per user requirement): a lesson already present in
 * the `learnyst-lessons` collection (by deterministic id) is skipped on every
 * subsequent run unless --force is passed. Only genuinely new lessons (new
 * ids not yet in the collection) or newly-added modules get fetched. This is
 * what makes the weekly scheduled job cheap — see jobs/Scheduled/
 * learnyst-transcript-refresh/SKILL.md.
 *
 * Pure extraction (conventions.md §17) — no LLM/judgment step anywhere in
 * this pipeline, so no `modelUsed` is ever set on the records it writes.
 *
 * Usage:
 *   node learnystTranscriptRefresh.js [--site KEY] [--only ID,ID] [--skip ID,ID]
 *     [--force] [--recheck-no-captions] [--module-delay-ms N]
 *     [--lesson-delay-ms N] [--lesson-limit N] [--env-file <path>]
 *
 * A YouTube-hosted lesson with no usable captions is cached too
 * (`captionKind: 'none'`), not just skipped in-memory — so it isn't
 * re-probed with yt-dlp on every run. --force re-fetches everything;
 * --recheck-no-captions re-probes ONLY the previously-no-captions lessons.
 *
 * --site KEY runs only that one site (e.g. `--site chartitude`); with no
 * --site flag every configured site in LEARNYST_SITE_KEYS (or
 * DEFAULT_SITE_KEYS if that's unset) is processed in turn, each getting its
 * own module/lesson loop, cooldown, and run-summary tally, all rolled up
 * into one combined summary at the end.
 *
 * Per-site config (env or --env-file), where KEY is the uppercased site key
 * (e.g. SOIC, CHARTITUDE): LEARNYST_<KEY>_AUTH_TOKEN (required — a site with
 * no token set is skipped), LEARNYST_<KEY>_SCHOOL_ID, LEARNYST_<KEY>_BUNDLE_ID,
 * LEARNYST_<KEY>_GRAPHQL_URL, LEARNYST_<KEY>_COURSES_API_BASE,
 * LEARNYST_<KEY>_TRANSCRIPT_API_BASE, LEARNYST_<KEY>_ORIGIN, LEARNYST_<KEY>_REFERER,
 * LEARNYST_<KEY>_REQUEST_DELAY_MS (default 1500), LEARNYST_<KEY>_MODULE_DELAY_MS
 * (default 10000), LEARNYST_<KEY>_MAX_RETRIES (default 4). SCHOOL_ID/
 * BUNDLE_ID/ORIGIN are baked in per site as `SITE_DEFAULTS` below (they
 * identify a fixed membership, not something that varies per deployment) —
 * only LEARNYST_<KEY>_AUTH_TOKEN is a required env var for a site already in
 * `SITE_DEFAULTS`; a brand-new site must set SCHOOL_ID/BUNDLE_ID via env
 * until its defaults are added to the code. See docs/learnyst-api-schemas.md
 * for how to discover a new site's school/bundle id and auth token from
 * DevTools.
 */

const db = require('./lib/db');
const { loadEnv, hasFlag, argValue } = require('./lib/env');
// Reused, not reimplemented (conventions.md §7/§17): the yt-dlp caption
// pipeline for a lesson whose video is externally hosted on YouTube.
const youtubeRefresh = require('./youtubeTranscriptRefresh');

// ── Config ───────────────────────────────────────────────────────────────────

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

// Sites processed when neither --site nor LEARNYST_SITE_KEYS is given. Add a
// new key here (or just set LEARNYST_SITE_KEYS) once its env vars exist —
// loadSiteConfig() below reads everything else from LEARNYST_<KEY>_* env, no
// further code change needed for a new Learnyst-hosted course/membership.
const DEFAULT_SITE_KEYS = ['soic', 'chartitude'];

// A site's school id / bundle id / origin identify a specific fixed
// membership, not something that varies per deployment or expires like the
// auth token — so they're baked in here once discovered (via the DevTools
// steps in docs/learnyst-api-schemas.md) instead of duplicated in every
// .env. Only LEARNYST_<KEY>_AUTH_TOKEN is a required env var; SCHOOL_ID/
// BUNDLE_ID/ORIGIN env overrides are still honored (see `env(...) ||
// defaults...` below) for a site not listed here, or to override one that is.
const SITE_DEFAULTS = {
  soic: { schoolId: '110998', bundleId: '97666', origin: 'https://learn.soic.in' },
  chartitude: { schoolId: '166281', bundleId: '189631', origin: 'https://learn.chartitude.com' },
};

/**
 * Build one site's config from its known `SITE_DEFAULTS` entry (if any),
 * overridable by `LEARNYST_<KEY>_*` env vars (KEY = `key.toUpperCase()`,
 * e.g. `LEARNYST_SOIC_AUTH_TOKEN`). Returns `{ error }` if the site has no
 * auth token, or no schoolId/bundleId (from SITE_DEFAULTS or env) — the
 * caller skips it rather than erroring, so a repo with only some sites fully
 * set up still runs cleanly. Otherwise returns `{ config }`.
 */
function loadSiteConfig(key) {
  const upperKey = key.toUpperCase();
  const env = (suffix) => process.env[`LEARNYST_${upperKey}_${suffix}`];
  const defaults = SITE_DEFAULTS[key] || {};

  const authToken = env('AUTH_TOKEN');
  if (!authToken) return { error: `no LEARNYST_${upperKey}_AUTH_TOKEN configured` };

  const schoolId = env('SCHOOL_ID') || defaults.schoolId;
  const bundleId = env('BUNDLE_ID') || defaults.bundleId;
  if (!schoolId || !bundleId) {
    return {
      error:
        `missing ${!schoolId ? 'schoolId' : 'bundleId'} — not in SITE_DEFAULTS and ` +
        `no LEARNYST_${upperKey}_${!schoolId ? 'SCHOOL_ID' : 'BUNDLE_ID'} set`,
    };
  }

  const origin = env('ORIGIN') || defaults.origin;
  return {
    config: {
      key,
      authToken,
      schoolId,
      bundleId,
      graphqlUrl: env('GRAPHQL_URL') || 'https://apig.learnyst.com/learn',
      coursesApiBase: env('COURSES_API_BASE') || 'https://apig.learnyst.com/learner/v17/courses',
      transcriptApiBase:
        env('TRANSCRIPT_API_BASE') || 'https://ai-api.learnyst.com/api/transcript-data',
      origin,
      referer: env('REFERER') || (origin ? `${origin}/` : undefined),
      userAgent: process.env.LEARNYST_USER_AGENT || DEFAULT_USER_AGENT,
      requestDelayMs: Number(env('REQUEST_DELAY_MS') || 1500),
      moduleDelayMs: Number(env('MODULE_DELAY_MS') || 10000),
      maxRetries: Number(env('MAX_RETRIES') || 4),
    },
  };
}

/**
 * Resolve the ordered list of site configs to process this run: `--site KEY`
 * restricts to one site; otherwise LEARNYST_SITE_KEYS (comma-separated) or
 * DEFAULT_SITE_KEYS is used. A site that isn't fully configured (missing
 * auth token, or missing schoolId/bundleId) is reported (via `onSkipped(key,
 * reason)`) and left out of the returned list.
 */
function loadSites(args, onSkipped) {
  const keys = args.site
    ? [args.site]
    : (process.env.LEARNYST_SITE_KEYS || DEFAULT_SITE_KEYS.join(','))
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  const sites = [];
  for (const key of keys) {
    const { config, error } = loadSiteConfig(key);
    if (config) sites.push(config);
    else if (onSkipped) onSkipped(key, error);
  }
  return sites;
}

// Non-course product types in bundleCourses (e.g. 11 = Telegram community
// link) carry no lessons — only courseType 1 is a real module to crawl.
const VIDEO_COURSE_TYPE = 1;
// A lesson_data entry with src_type 5 is an externally-hosted video (a plain
// YouTube URL in `src`, no `content_path` — Learnyst's AI transcript API has
// nothing to fetch for these). Confirmed live 2026-08-27 across several
// lessons: src looks like youtube.com/watch?v=, youtu.be/, or
// youtube.com/embed/. `extractYoutubeVideoId()` below handles this case by
// falling back to youtubeTranscriptRefresh.js's yt-dlp pipeline instead.
const YOUTUBE_LESSON_SRC_TYPE = 5;
// A lesson_data entry with src_type 2 is a Learnyst-hosted video.
const LEARNYST_VIDEO_SRC_TYPE = 2;

/**
 * True if this lesson has a video to fetch a transcript for — a Learnyst-
 * hosted video (src_type 2) or an externally-hosted YouTube one (src_type
 * 5). Deliberately content-shape based rather than keying off `lesson_type`:
 * that numeric code is NOT consistent across Learnyst schools — SOIC uses
 * lesson_type 1 for video, but Chartitude uses lesson_type 7 for video and 6
 * for PDF lessons (confirmed live 2026-08-29, fetching real module data from
 * both schools). Relying on a fixed lesson_type number silently skipped
 * every Chartitude video on the first real run.
 */
function isVideoLesson(lesson) {
  let parsed;
  try {
    parsed = JSON.parse(lesson.lesson_data || '[]');
  } catch {
    return false;
  }
  if (!Array.isArray(parsed)) return false;
  return parsed.some(
    (e) => e.src_type === LEARNYST_VIDEO_SRC_TYPE || e.src_type === YOUTUBE_LESSON_SRC_TYPE
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  return {
    site: argValue('--site', argv) || null,
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
    moduleDelayMsOverride: argValue('--module-delay-ms', argv),
    lessonDelayMsOverride: argValue('--lesson-delay-ms', argv),
    lessonLimit: argValue('--lesson-limit', argv) ? Number(argValue('--lesson-limit', argv)) : null,
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
      // Auth failures will not resolve on retry — the token is expired/invalid,
      // fail fast with a clear message rather than burning 4 retries on it.
      if (/HTTP 401|HTTP 403/.test(err.message)) {
        throw new Error(
          `${label}: authentication failed (${err.message}). Its LEARNYST_<KEY>_AUTH_TOKEN is likely ` +
            'expired — get a fresh one from Chrome DevTools while logged into that site (see docs/learnyst-api-schemas.md).'
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

async function fetchBundleModules(cfg) {
  const query = `query ShowBundleCourses {\n  showBundleCourses(schoolId: "${cfg.schoolId}", id: "${cfg.bundleId}") {\n    seoTitle\n    title\n    courseType\n    bundleCourses {\n      title\n      id\n      status\n      courseType\n      lessonCount\n      seoTitle\n      imageUrl\n      trialLessonsCount\n      startTime\n      endTime\n      __typename\n    }\n    __typename\n  }\n}`;
  const body = {
    operationName: 'ShowBundleCourses',
    variables: {},
    extensions: { clientLibrary: { name: '@apollo/client', version: '4.0.4' } },
    query,
  };
  return withRetry(
    async () => {
      const res = await fetch(cfg.graphqlUrl, {
        method: 'POST',
        headers: {
          accept: 'application/graphql-response+json,application/json;q=0.9',
          authorization: `Bearer ${cfg.authToken}`,
          'content-type': 'application/json',
          origin: cfg.origin,
          referer: cfg.referer,
          'user-agent': cfg.userAgent,
          'x-lyst-rls': 'prod',
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      const json = JSON.parse(text);
      if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
      return json.data.showBundleCourses;
    },
    { maxRetries: cfg.maxRetries, label: `${cfg.key}:fetchBundleModules` }
  );
}

async function fetchModuleLessons(cfg, courseId) {
  const params = new URLSearchParams({
    is_from_classroom: 'true',
    school_id: cfg.schoolId,
    device_type: '4',
    is_id: 'true',
    bundle_id: cfg.bundleId,
    vl: '1',
  });
  const url = `${cfg.coursesApiBase}/${courseId}?${params.toString()}`;
  return withRetry(
    async () => {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          accept: 'application/json, text/plain, */*',
          lystauthorization: `Bearer ${cfg.authToken}`, // different header name from the other two endpoints
          origin: cfg.origin,
          referer: cfg.referer,
          'user-agent': cfg.userAgent,
        },
      });
      const rawText = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${rawText.slice(0, 300)}`);
      let data;
      try {
        data = JSON.parse(Buffer.from(rawText, 'base64').toString('utf8'));
      } catch {
        data = JSON.parse(rawText); // tolerate a future API version returning plain JSON
      }
      // Discard the ~55 account/billing-specific fields (completed_lesson_ids,
      // esign_status, next_payment_date, user_course_id, etc.) — genuinely
      // user-specific state, not needed to enumerate lessons/transcripts.
      return {
        id: data.id,
        title: data.title,
        seoTitle: data.seo_title,
        sections: data.sections || [],
        lessons: data.lessons || [],
      };
    },
    { maxRetries: cfg.maxRetries, label: `${cfg.key}:fetchModuleLessons(${courseId})` }
  );
}

/** Extract the video track's content_path from a lesson's lesson_data JSON string. */
function extractContentPath(lesson) {
  let parsed;
  try {
    parsed = JSON.parse(lesson.lesson_data || '[]');
  } catch (err) {
    return { error: `lesson_data is not valid JSON: ${err.message}` };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return { error: 'lesson_data has no entries' };
  const videoEntry = parsed.find((e) => e.src_type === 2) || parsed[0];
  if (!videoEntry.content_path) {
    return { error: 'no content_path on video entry' };
  }
  return { contentPath: videoEntry.content_path };
}

const YOUTUBE_VIDEO_ID_PATTERNS = [
  /youtube\.com\/watch\?(?:.*&)?v=([\w-]{11})/,
  /youtu\.be\/([\w-]{11})/,
  /youtube\.com\/embed\/([\w-]{11})/,
  /youtube\.com\/shorts\/([\w-]{11})/,
];

function parseYoutubeVideoId(url) {
  if (!url) return null;
  for (const re of YOUTUBE_VIDEO_ID_PATTERNS) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/**
 * Fallback for a lesson with no `content_path` (Learnyst's AI transcript API
 * has nothing to fetch): if the lesson_data entry is externally-hosted on
 * YouTube (src_type 5), extract the video id so the caller can fetch its
 * transcript via youtubeTranscriptRefresh.js's yt-dlp pipeline instead.
 * Returns null if lesson_data doesn't parse or isn't a YouTube entry.
 */
function extractYoutubeVideoId(lesson) {
  let parsed;
  try {
    parsed = JSON.parse(lesson.lesson_data || '[]');
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const entry =
    parsed.find((e) => e.src_type === YOUTUBE_LESSON_SRC_TYPE && e.src) ||
    parsed.find((e) => e.src && parseYoutubeVideoId(e.src));
  return entry ? parseYoutubeVideoId(entry.src) : null;
}

const TIMESTAMP_KEY_RE = /^\d{1,2}:\d{2}:\d{2}$/;

/** {"00:00:00": "text", ...} -> ordered "[HH:MM:SS] text" lines + flowing plain text. */
function transcriptTexts(apiResponse) {
  const data = apiResponse && apiResponse.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const keys = Object.keys(data);
    if (keys.length && keys.every((k) => TIMESTAMP_KEY_RE.test(k))) {
      const sorted = keys.sort(); // "HH:MM:SS" strings sort correctly lexicographically
      return {
        timestamped: sorted.map((ts) => `[${ts}] ${data[ts]}`).join('\n'),
        plain: sorted.map((ts) => data[ts]).join(' '),
      };
    }
  }
  return { timestamped: null, plain: null };
}

async function fetchTranscript(cfg, contentPath) {
  const url = `${cfg.transcriptApiBase}?content_type=video&content_path=${encodeURIComponent(contentPath)}`;
  return withRetry(
    async () => {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          accept: '*/*',
          authorization: `Bearer ${cfg.authToken}`,
          'content-type': 'application/json',
          origin: cfg.origin,
          referer: cfg.referer,
          'user-agent': cfg.userAgent,
        },
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Response was not valid JSON: ${text.slice(0, 300)}`);
      }
    },
    { maxRetries: cfg.maxRetries, label: `${cfg.key}:fetchTranscript` }
  );
}

// ── Persistence (learnyst-lessons collection — see db.js saveLearnystTranscript) ──

/**
 * Deterministic id: same lesson -> same id -> upsert, never a duplicate.
 * `siteKey` namespaces the scope for every site except `soic` (the original,
 * pre-multi-site default) so ids already cached for SOIC before multi-site
 * support was added stay valid — a course/lesson id pair is namespaced by
 * site only when it isn't the legacy default.
 */
function lessonRecordId(courseId, lessonId, siteKey = 'soic') {
  const scope = siteKey === 'soic' ? String(courseId) : `${siteKey}:${courseId}`;
  return db.makeId('lyt', 'learnyst-transcript-refresh', scope, undefined, String(lessonId));
}

/**
 * Cache-first check: returns the existing record for this lesson, or null.
 * A YouTube-sourced record with `captionKind: 'none'` means the video was
 * already checked and confirmed to have no usable captions — cached too, so
 * it isn't re-probed with yt-dlp on every run (see --recheck-no-captions).
 */
function alreadyFetched(courseId, lessonId, siteKey = 'soic') {
  return db.get('learnyst-lessons', lessonRecordId(courseId, lessonId, siteKey)) || null;
}

/**
 * Build the DTO for db.saveLearnystTranscript() — the actual write goes
 * through that db.js helper (only db.js may touch collection files), which
 * splits it into a full body (learnyst-lessons/<id>.json) + slim index
 * record (learnyst-lessons.json), mirroring saveReport()'s two-file pattern.
 *
 * Pass `apiResponse` for a Learnyst-hosted lesson (contentPath was
 * resolved), or `youtubeVideoId` + `captionKind` + `captionLang` +
 * `youtubeTranscript` (from youtubeTranscriptRefresh.js's
 * `fetchTranscriptViaYtDlp()`) for a lesson whose video is externally hosted
 * on YouTube (no content_path — see `extractYoutubeVideoId()`).
 * `captionKind: 'none'` (with a null `youtubeTranscript`'s
 * timestamped/plain) records "checked, no captions available" so it's
 * cached too, not just skipped in-memory.
 */
function buildTranscriptDto({
  siteKey = 'soic',
  courseId,
  courseTitle,
  sectionId,
  lesson,
  contentPath,
  apiResponse,
  youtubeVideoId,
  captionKind,
  captionLang,
  youtubeTranscript,
}) {
  const isYoutube = !!youtubeVideoId;
  const { timestamped, plain } = isYoutube
    ? youtubeTranscript || { timestamped: null, plain: null }
    : transcriptTexts(apiResponse);
  return {
    id: lessonRecordId(courseId, lesson.id, siteKey),
    type: 'learnyst-transcript',
    creator: 'learnyst-transcript-refresh',
    site: siteKey,
    courseId: String(courseId),
    courseTitle,
    sectionId: sectionId || null,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    lessonType: lesson.lesson_type,
    durationSeconds: lesson.duration,
    contentPath: contentPath || null,
    transcriptSource: isYoutube ? 'youtube' : 'learnyst',
    youtubeVideoId: youtubeVideoId || null,
    captionKind: captionKind || null,
    captionLang: captionLang || null,
    fetchedAt: new Date().toISOString(),
    transcriptTimestamped: timestamped,
    transcriptPlain: plain,
    rawResponse: isYoutube ? null : apiResponse,
    rawCues: isYoutube && youtubeTranscript ? youtubeTranscript.cues : null,
  };
}

// ── Main orchestration ──────────────────────────────────────────────────────

async function main() {
  loadEnv(argValue('--env-file', process.argv));
  const args = parseArgs(process.argv);

  const sites = loadSites(args, (key, reason) => console.log(`Skipping site "${key}": ${reason}.`));
  if (!sites.length) {
    console.error(
      args.site
        ? `Site "${args.site}" is not fully configured. See .env.example.`
        : 'No Learnyst sites fully configured. See .env.example.'
    );
    process.exitCode = 1;
    return;
  }

  const combinedSummary = {
    sitesProcessed: [],
    modulesProcessed: 0,
    modulesFailed: [],
    lessonsFetched: 0,
    lessonsFetchedViaYoutube: 0,
    lessonsCachedSkipped: 0,
    lessonsNonVideoSkipped: 0,
    lessonsYoutubeNoCaptions: 0,
    lessonsYoutubeNoCaptionsCachedSkipped: 0,
    lessonsFailed: [],
  };

  for (const cfg of sites) {
    console.log(`\n############ Site: ${cfg.key} ############`);
    const summary = await runSite(cfg, args);
    combinedSummary.sitesProcessed.push(cfg.key);
    combinedSummary.modulesProcessed += summary.modulesProcessed;
    combinedSummary.modulesFailed.push(
      ...summary.modulesFailed.map((m) => ({ site: cfg.key, ...m }))
    );
    combinedSummary.lessonsFetched += summary.lessonsFetched;
    combinedSummary.lessonsFetchedViaYoutube += summary.lessonsFetchedViaYoutube;
    combinedSummary.lessonsCachedSkipped += summary.lessonsCachedSkipped;
    combinedSummary.lessonsNonVideoSkipped += summary.lessonsNonVideoSkipped;
    combinedSummary.lessonsYoutubeNoCaptions += summary.lessonsYoutubeNoCaptions;
    combinedSummary.lessonsYoutubeNoCaptionsCachedSkipped +=
      summary.lessonsYoutubeNoCaptionsCachedSkipped;
    combinedSummary.lessonsFailed.push(
      ...summary.lessonsFailed.map((l) => ({ site: cfg.key, ...l }))
    );
  }

  console.log('\n=== Run summary (all sites) ===');
  console.log(JSON.stringify(combinedSummary, null, 2));
  console.log('\nFiles touched:');
  for (const f of db.touchedFiles()) console.log(`  ${f}`);

  if (combinedSummary.modulesFailed.length || combinedSummary.lessonsFailed.length) {
    process.exitCode = 1;
  }
}

/** Runs the module/lesson fetch loop for one site config, returning its summary. */
async function runSite(cfg, args) {
  if (args.moduleDelayMsOverride) cfg.moduleDelayMs = Number(args.moduleDelayMsOverride);
  if (args.lessonDelayMsOverride) cfg.requestDelayMs = Number(args.lessonDelayMsOverride);

  console.log(`Fetching bundle ${cfg.bundleId} module list (school ${cfg.schoolId})...`);
  const bundle = await fetchBundleModules(cfg);
  let modules = (bundle.bundleCourses || []).filter((m) => m.courseType === VIDEO_COURSE_TYPE);
  const skippedModules = (bundle.bundleCourses || []).filter(
    (m) => m.courseType !== VIDEO_COURSE_TYPE
  );

  if (args.only) modules = modules.filter((m) => args.only.has(String(m.id)));
  if (args.skip) modules = modules.filter((m) => !args.skip.has(String(m.id)));

  console.log(
    `Bundle: ${bundle.title} — ${modules.length} module(s) to process ` +
      `(${skippedModules.length} non-course module(s) skipped, e.g. community links).`
  );

  const summary = {
    modulesProcessed: 0,
    modulesFailed: [],
    lessonsFetched: 0,
    lessonsFetchedViaYoutube: 0,
    lessonsCachedSkipped: 0,
    lessonsNonVideoSkipped: 0,
    lessonsYoutubeNoCaptions: 0,
    lessonsYoutubeNoCaptionsCachedSkipped: 0,
    lessonsFailed: [],
  };

  // Lazy, once-per-run check: only probe for yt-dlp if a lesson actually
  // needs it (most bundles are all Learnyst-hosted). If it's unavailable,
  // every subsequent YouTube-sourced lesson is skipped with one warning each
  // rather than retrying a doomed check per lesson.
  let ytCfg = null;
  let ytDlpReady = null;
  async function ensureYoutubeReady() {
    if (ytDlpReady !== null) return ytDlpReady;
    ytCfg = youtubeRefresh.loadConfig();
    try {
      await youtubeRefresh.checkYtDlpAvailable(ytCfg);
      ytDlpReady = true;
    } catch (err) {
      console.error(`YouTube-hosted lesson(s) found but yt-dlp is not ready: ${err.message}`);
      ytDlpReady = false;
    }
    return ytDlpReady;
  }

  for (const [i, mod] of modules.entries()) {
    console.log(`\n=== [${i + 1}/${modules.length}] Module ${mod.id} — ${mod.title} ===`);
    let moduleHadFetches = false;
    try {
      const courseData = await fetchModuleLessons(cfg, mod.id);
      let videoLessons = courseData.lessons.filter(isVideoLesson);
      const nonVideoLessons = courseData.lessons.filter((l) => !isVideoLesson(l));
      summary.lessonsNonVideoSkipped += nonVideoLessons.length;
      if (args.lessonLimit) videoLessons = videoLessons.slice(0, args.lessonLimit);

      for (const [j, lesson] of videoLessons.entries()) {
        const label = `  [${j + 1}/${videoLessons.length}] ${lesson.id} — ${lesson.title}`;

        const cached = alreadyFetched(mod.id, lesson.id, cfg.key);
        const cachedNoCaptions = cached && cached.captionKind === 'none';
        if (cached && !args.force && !(cachedNoCaptions && args.recheckNoCaptions)) {
          if (cachedNoCaptions) {
            console.log(`${label}: no captions (checked previously), skipping`);
            summary.lessonsYoutubeNoCaptionsCachedSkipped++;
          } else {
            console.log(`${label}: already cached, skipping`);
            summary.lessonsCachedSkipped++;
          }
          continue;
        }

        moduleHadFetches = true;

        const { contentPath, error } = extractContentPath(lesson);
        const youtubeVideoId = contentPath ? null : extractYoutubeVideoId(lesson);

        if (!contentPath && !youtubeVideoId) {
          console.error(`${label}: FAILED to extract content_path — ${error}`);
          summary.lessonsFailed.push({ courseId: mod.id, lessonId: lesson.id, error });
          continue;
        }

        if (youtubeVideoId) {
          const ready = await ensureYoutubeReady();
          if (!ready) {
            console.error(
              `${label}: YouTube-hosted (video ${youtubeVideoId}), skipping — yt-dlp not ready`
            );
            summary.lessonsFailed.push({
              courseId: mod.id,
              lessonId: lesson.id,
              error: 'yt-dlp not ready for YouTube-hosted lesson',
            });
            continue;
          }
        }

        try {
          let dto;
          if (youtubeVideoId) {
            console.log(`${label}: fetching via YouTube (${youtubeVideoId})...`);
            const result = await youtubeRefresh.fetchTranscriptViaYtDlp(ytCfg, youtubeVideoId);
            dto = buildTranscriptDto({
              siteKey: cfg.key,
              courseId: mod.id,
              courseTitle: mod.title,
              sectionId: lesson.section_id,
              lesson,
              youtubeVideoId,
              captionKind: result.captionKind || 'none',
              captionLang: result.captionLang || null,
              youtubeTranscript: result.captionKind ? result : null,
            });
            if (result.captionKind) {
              summary.lessonsFetchedViaYoutube++;
            } else {
              // Still cached (captionKind: 'none') below, so a future run
              // skips this lesson by default instead of re-probing yt-dlp.
              summary.lessonsYoutubeNoCaptions++;
            }
          } else {
            console.log(`${label}: fetching...`);
            const apiResponse = await fetchTranscript(cfg, contentPath);
            dto = buildTranscriptDto({
              siteKey: cfg.key,
              courseId: mod.id,
              courseTitle: mod.title,
              sectionId: lesson.section_id,
              lesson,
              contentPath,
              apiResponse,
            });
          }
          db.saveLearnystTranscript(dto);
          if (dto.captionKind === 'none') {
            console.log(`${label}: no usable captions, cached as checked`);
          } else {
            summary.lessonsFetched++;
            console.log(`${label}: OK`);
          }
        } catch (err) {
          console.error(`${label}: FAILED — ${err.message}`);
          summary.lessonsFailed.push({ courseId: mod.id, lessonId: lesson.id, error: err.message });
        }

        if (j < videoLessons.length - 1) await sleep(cfg.requestDelayMs);
      }

      summary.modulesProcessed++;
    } catch (err) {
      console.error(`Module ${mod.id} FAILED: ${err.message}`);
      summary.modulesFailed.push({ courseId: mod.id, title: mod.title, error: err.message });
    }

    if (i < modules.length - 1 && moduleHadFetches) {
      console.log(`Cooling down ${cfg.moduleDelayMs}ms before next module...`);
      await sleep(cfg.moduleDelayMs);
    }
  }

  console.log(`\n=== Run summary (site: ${cfg.key}) ===`);
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

module.exports = {
  loadSiteConfig,
  loadSites,
  DEFAULT_SITE_KEYS,
  parseArgs,
  fetchBundleModules,
  fetchModuleLessons,
  extractContentPath,
  extractYoutubeVideoId,
  parseYoutubeVideoId,
  transcriptTexts,
  fetchTranscript,
  lessonRecordId,
  alreadyFetched,
  buildTranscriptDto,
  runSite,
  main,
  VIDEO_COURSE_TYPE,
  isVideoLesson,
  YOUTUBE_LESSON_SRC_TYPE,
  sleep,
};

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exitCode = 1;
  });
}
