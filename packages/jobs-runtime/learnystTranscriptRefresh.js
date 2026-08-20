#!/usr/bin/env node
'use strict';

/**
 * Learnyst Transcript Refresh — fetches AI-generated transcripts for every
 * video lesson across a Learnyst membership bundle (Darshan's SOIC
 * Membership, school 110998, bundle 97666), storing them in the
 * `learnyst-lessons` collection (docs/DATA_ECOSYSTEM.md §1).
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
 *   node learnystTranscriptRefresh.js [--only ID,ID] [--skip ID,ID]
 *     [--force] [--module-delay-ms N] [--lesson-delay-ms N] [--lesson-limit N]
 *     [--env-file <path>]
 *
 * Config (env or --env-file): LEARNYST_AUTH_TOKEN (required),
 *   LEARNYST_SCHOOL_ID (default 110998), LEARNYST_BUNDLE_ID (default 97666),
 *   LEARNYST_GRAPHQL_URL, LEARNYST_COURSES_API_BASE, LEARNYST_TRANSCRIPT_API_BASE,
 *   LEARNYST_ORIGIN, LEARNYST_REFERER, LEARNYST_REQUEST_DELAY_MS (default 1500),
 *   LEARNYST_MODULE_DELAY_MS (default 10000), LEARNYST_MAX_RETRIES (default 4).
 */

const db = require('./lib/db');
const { loadEnv, hasFlag, argValue } = require('./lib/env');

// ── Config ───────────────────────────────────────────────────────────────────

function loadConfig() {
  return {
    authToken: process.env.LEARNYST_AUTH_TOKEN,
    schoolId: process.env.LEARNYST_SCHOOL_ID || '110998',
    bundleId: process.env.LEARNYST_BUNDLE_ID || '97666',
    graphqlUrl: process.env.LEARNYST_GRAPHQL_URL || 'https://apig.learnyst.com/learn',
    coursesApiBase:
      process.env.LEARNYST_COURSES_API_BASE || 'https://apig.learnyst.com/learner/v17/courses',
    transcriptApiBase:
      process.env.LEARNYST_TRANSCRIPT_API_BASE || 'https://ai-api.learnyst.com/api/transcript-data',
    origin: process.env.LEARNYST_ORIGIN || 'https://learn.soic.in',
    referer: process.env.LEARNYST_REFERER || 'https://learn.soic.in/',
    userAgent:
      process.env.LEARNYST_USER_AGENT ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    requestDelayMs: Number(process.env.LEARNYST_REQUEST_DELAY_MS || 1500),
    moduleDelayMs: Number(process.env.LEARNYST_MODULE_DELAY_MS || 10000),
    maxRetries: Number(process.env.LEARNYST_MAX_RETRIES || 4),
  };
}

// Non-course product types in bundleCourses (e.g. 11 = Telegram community
// link) carry no lessons — only courseType 1 is a real module to crawl.
const VIDEO_COURSE_TYPE = 1;
// Only lesson_type 1 (video) lessons have a transcript to fetch; quizzes (5),
// article/HTML lessons (9), etc. are recorded as skipped, never errored.
const VIDEO_LESSON_TYPE = 1;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  return {
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
          `${label}: authentication failed (${err.message}). LEARNYST_AUTH_TOKEN is likely expired — ` +
            'get a fresh one from Chrome DevTools while logged into learn.soic.in (see docs/learnyst-api-schemas.md).'
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
    { maxRetries: cfg.maxRetries, label: 'fetchBundleModules' }
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
    { maxRetries: cfg.maxRetries, label: `fetchModuleLessons(${courseId})` }
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
  if (!videoEntry.content_path) return { error: 'no content_path on video entry' };
  return { contentPath: videoEntry.content_path };
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
    { maxRetries: cfg.maxRetries, label: 'fetchTranscript' }
  );
}

// ── Persistence (learnyst-lessons collection — see db.js saveLearnystTranscript) ──

/** Deterministic id: same lesson -> same id -> upsert, never a duplicate. */
function lessonRecordId(courseId, lessonId) {
  return db.makeId(
    'lyt',
    'learnyst-transcript-refresh',
    String(courseId),
    undefined,
    String(lessonId)
  );
}

/** Cache-first check: has this lesson already been fetched and stored? */
function alreadyFetched(courseId, lessonId) {
  return !!db.get('learnyst-lessons', lessonRecordId(courseId, lessonId));
}

/**
 * Build the DTO for db.saveLearnystTranscript() — the actual write goes
 * through that db.js helper (only db.js may touch collection files), which
 * splits it into a full body (learnyst-lessons/<id>.json) + slim index
 * record (learnyst-lessons.json), mirroring saveReport()'s two-file pattern.
 */
function buildTranscriptDto({
  courseId,
  courseTitle,
  sectionId,
  lesson,
  contentPath,
  apiResponse,
}) {
  const { timestamped, plain } = transcriptTexts(apiResponse);
  return {
    id: lessonRecordId(courseId, lesson.id),
    type: 'learnyst-transcript',
    creator: 'learnyst-transcript-refresh',
    courseId: String(courseId),
    courseTitle,
    sectionId: sectionId || null,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    lessonType: lesson.lesson_type,
    durationSeconds: lesson.duration,
    contentPath,
    fetchedAt: new Date().toISOString(),
    transcriptTimestamped: timestamped,
    transcriptPlain: plain,
    rawResponse: apiResponse,
  };
}

// ── Main orchestration ──────────────────────────────────────────────────────

async function main() {
  loadEnv(argValue('--env-file', process.argv));
  const cfg = loadConfig();
  if (!cfg.authToken) {
    console.error('Missing LEARNYST_AUTH_TOKEN (env or --env-file). See .env.example.');
    process.exitCode = 1;
    return;
  }

  const args = parseArgs(process.argv);
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
    lessonsCachedSkipped: 0,
    lessonsNonVideoSkipped: 0,
    lessonsFailed: [],
  };

  for (const [i, mod] of modules.entries()) {
    console.log(`\n=== [${i + 1}/${modules.length}] Module ${mod.id} — ${mod.title} ===`);
    try {
      const courseData = await fetchModuleLessons(cfg, mod.id);
      let videoLessons = courseData.lessons.filter((l) => l.lesson_type === VIDEO_LESSON_TYPE);
      const nonVideoLessons = courseData.lessons.filter((l) => l.lesson_type !== VIDEO_LESSON_TYPE);
      summary.lessonsNonVideoSkipped += nonVideoLessons.length;
      if (args.lessonLimit) videoLessons = videoLessons.slice(0, args.lessonLimit);

      for (const [j, lesson] of videoLessons.entries()) {
        const label = `  [${j + 1}/${videoLessons.length}] ${lesson.id} — ${lesson.title}`;

        if (!args.force && alreadyFetched(mod.id, lesson.id)) {
          console.log(`${label}: already cached, skipping`);
          summary.lessonsCachedSkipped++;
          continue;
        }

        const { contentPath, error } = extractContentPath(lesson);
        if (error) {
          console.error(`${label}: FAILED to extract content_path — ${error}`);
          summary.lessonsFailed.push({ courseId: mod.id, lessonId: lesson.id, error });
          continue;
        }

        try {
          console.log(`${label}: fetching...`);
          const apiResponse = await fetchTranscript(cfg, contentPath);
          const dto = buildTranscriptDto({
            courseId: mod.id,
            courseTitle: mod.title,
            sectionId: lesson.section_id,
            lesson,
            contentPath,
            apiResponse,
          });
          db.saveLearnystTranscript(dto);
          summary.lessonsFetched++;
          console.log(`${label}: OK`);
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

    if (i < modules.length - 1) {
      console.log(`Cooling down ${cfg.moduleDelayMs}ms before next module...`);
      await sleep(cfg.moduleDelayMs);
    }
  }

  console.log('\n=== Run summary ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log('\nFiles touched:');
  for (const f of db.touchedFiles()) console.log(`  ${f}`);

  if (summary.modulesFailed.length || summary.lessonsFailed.length) {
    process.exitCode = 1;
  }
}

module.exports = {
  loadConfig,
  parseArgs,
  fetchBundleModules,
  fetchModuleLessons,
  extractContentPath,
  transcriptTexts,
  fetchTranscript,
  lessonRecordId,
  alreadyFetched,
  buildTranscriptDto,
  main,
  VIDEO_COURSE_TYPE,
  VIDEO_LESSON_TYPE,
  sleep,
};

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exitCode = 1;
  });
}
