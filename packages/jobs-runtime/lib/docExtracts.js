'use strict';

/**
 * docExtracts.js — the store for Filing Extracts (Product A of
 * docs/PREPROCESSING_PIPELINE_PLAN.md).
 *
 * One JSON per source document per profile, written once and never recomputed:
 * a filed document does not change, so its extract is immutable. That immutability
 * is the whole economic argument for pre-processing — the cost is paid once, at
 * filing time, off the daily critical path, and every skill that later asks about
 * that document gets a file read.
 *
 * Layout: data/cache/doc-extracts/<profile>/<sha256(sourceUrl)[0:32]>.json
 *
 * The key is a hash of the SOURCE URL, deliberately matching
 * `watchlistInsights.js`'s `pdfCachePath()` — same document, same hash, in both
 * caches. That is what lets `verifyExtracts.js` find an extract's source text
 * without being told where it is, and it means the two caches can never disagree
 * about which document they are describing (conventions §17(a)).
 *
 * Scoped by profile because an `announcement` extract and a `result` extract of
 * the same PDF answer different questions with different schemas — the same
 * reasoning that scopes note caching by `usecase`.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const extractionQualityCounter = require('./extractionQualityCounter');
const { resolveJobName } = require('./scriptJobName');

const SCHEMA_VERSION = 1;

/** Profiles, in the order they are meant to ship (plan §4 P1). */
const PROFILES = ['announcement', 'result', 'transcript', 'ppt', 'annual_report'];

/**
 * Per-profile schema versions (docs/REUSE_ARCHITECTURE_PLAN.md §4.5).
 *
 * `SCHEMA_VERSION` above is a leftover flat stamp from before any profile's
 * schema had actually changed after launch; it still gets written for
 * backward compatibility, but staleness rejection reads THIS map instead,
 * because a schema change to one profile (e.g. annual_report's `sourceUnit`/
 * `consolidated` fields, added 2026-09-06 following calibration) must not
 * silently invalidate every OTHER profile's cache too.
 *
 * Bump a profile's number here whenever `profiles.md`'s schema for it
 * changes in a way that adds/renames a field a consumer would rely on —
 * the same day you edit profiles.md, not later. `resolveFilingContent()`
 * treats any stored record whose `profileSchemaVersions[profile]` is older
 * than the number here as a miss, forcing re-extraction rather than serving
 * a shape that no longer matches what the profile promises.
 *
 * Versions start at 1 as of 2026-09-06 for every profile, INCLUDING
 * annual_report — the two schema changes made to it during calibration
 * (both before this map existed) were handled manually via `__invalidated`,
 * which was the correct tool for a pre-launch calibration cycle. This map
 * is what replaces that manual step going forward.
 */
const PROFILE_SCHEMA_VERSIONS = {
  announcement: 1,
  result: 1,
  transcript: 1,
  ppt: 1,
  // Bumped 2026-09-06 (docs/REUSE_ARCHITECTURE_PLAN.md §4.2): profiles.md's
  // `auditor` schema gained `firm`/`appointedDate` for forensic-accounting's
  // Manpasand-pattern (sudden auditor change) check. Every annual_report
  // extract stored before this bump lacks those two fields — this bump is
  // what makes resolveFilingContent() correctly treat them as stale rather
  // than silently handing a caller an `auditor` object two fields short of
  // what profiles.md now promises. Direct docExtracts.get() callers are
  // UNAFFECTED (that lookup has no staleness check) — only the
  // resolveFilingContent() path enforces this, by design.
  annual_report: 2,
};

function declaredSchemaVersion(profile) {
  return PROFILE_SCHEMA_VERSIONS[profile] ?? 1;
}

// ── TWO SWITCHES, NOT ONE: SHADOW vs SERVED ──────────────────────────────
//
// A profile has to be EXTRACTING before it can be calibrated — the gate compares
// a cheap agent's extracts against a flagship read of the same documents, so the
// extracts must already exist. But "extracting" and "trusted by the daily skills"
// must not be the same switch, or the calibration window itself would feed
// uncalibrated numbers straight into post-close's notes and the signal scorer —
// precisely what the gate exists to prevent.
//
// An earlier version of this file had one switch and therefore exactly that
// circularity: you could not calibrate a profile without first enabling it for
// production use.
//
//   PREPROCESS_SHADOW_PROFILES — queued and extracted, NEVER served.
//   PREPROCESS_PROFILES        — served to consuming skills (and also queued).
//
// The guard lives in `get()`, not in a skill's instructions: a consuming skill
// physically cannot read a shadow extract, so no amount of forgetting can leak
// one into a thesis. Calibration tooling opts in explicitly with
// `{ includeShadow: true }`, which is the only place that flag should ever appear.
//
// Lifecycle: shadow -> calibrate -> PASS -> move to PREPROCESS_PROFILES + backfill.
const { loadEnv } = require('./env');
loadEnv();

function parseList(v, fallback) {
  return new Set(
    String(v == null ? fallback : v)
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
  );
}

function servedProfiles() {
  return parseList(process.env.PREPROCESS_PROFILES, 'announcement');
}

function shadowProfiles() {
  return parseList(process.env.PREPROCESS_SHADOW_PROFILES, '');
}

/** Served to consuming skills — has passed its calibration gate. */
function isServed(profile) {
  if (process.env.PREPROCESS_ENABLED === 'false') return false;
  return servedProfiles().has(profile);
}

/** Extracting for calibration only — must never reach a consuming skill. */
function isShadow(profile) {
  if (process.env.PREPROCESS_ENABLED === 'false') return false;
  return !servedProfiles().has(profile) && shadowProfiles().has(profile);
}

/** Queued by preprocessQueue.js — either state means "extract this". */
function isQueued(profile) {
  return isServed(profile) || isShadow(profile);
}

/** @deprecated ambiguous — say which question you mean. */
function isEnabled(profile) {
  return isServed(profile);
}

/** Same hash as watchlistInsights.js pdfCachePath() — see the note above. */
function sourceHash(sourceUrl) {
  return crypto.createHash('sha256').update(String(sourceUrl)).digest('hex').slice(0, 32);
}

/** Path to the cached raw PDF text for a URL, if any skill has ever read it. */
function pdfTextPath(sourceUrl, full = false) {
  return path.join(
    db.cachePath(full ? 'pdf-text-full' : 'pdf-text'),
    `${sourceHash(sourceUrl)}.json`
  );
}

/**
 * The source text an extract's quotes are checked against, WITH the provenance
 * needed to know whether checking them means anything.
 *
 * Prefers the full-text cache (`read-pdf-with-meta --full`) and falls back to the
 * default 8000-char excerpt. `truncated` is the field that matters: L1 verifies
 * quotes against this text, so if the text is an excerpt then L1 confirms only
 * that the extractor quoted the excerpt accurately — it says nothing about the
 * 99% of the document neither of them saw.
 *
 * That is not hypothetical. On 2026-09-04, 40 heavy-document extracts passed L1
 * with `confidence: high` while every one had been produced from the first 8,000
 * characters of documents up to 951,309 characters long. Their schemas came back
 * almost entirely null — contingent liabilities 0/24, remuneration 0/24 — because
 * those sections were never in the text. Nothing flagged it, and a calibration run
 * would have CERTIFIED the profile, because both readers would have agreed
 * perfectly about the same covering letter.
 */
function sourceTextMeta(sourceUrl) {
  for (const full of [true, false]) {
    try {
      const raw = JSON.parse(fs.readFileSync(pdfTextPath(sourceUrl, full), 'utf8'));
      if (typeof raw.text !== 'string') continue;
      return {
        text: raw.text,
        full,
        // A pre-existing cache entry predates these fields; infer from the marker
        // the old code left in the text rather than defaulting to "complete".
        truncated:
          raw.truncated != null ? Boolean(raw.truncated) : /\[\.\.\. truncated —/.test(raw.text),
        originalChars: raw.originalChars ?? null,
      };
    } catch (_) {
      /* try the next cache */
    }
  }
  return null;
}

/**
 * The source text an extract's quotes must be found in (L1). Returns null when
 * the document has never been parsed — which means L1 CANNOT run, a different
 * outcome from L1 failing, and one the verifier must report rather than treat as
 * a pass.
 */
function sourceText(sourceUrl) {
  const m = sourceTextMeta(sourceUrl);
  return m ? m.text : null;
}

function dir(profile) {
  return db.cachePath(path.join('doc-extracts', String(profile)));
}

function file(profile, sourceUrl) {
  return path.join(dir(profile), `${sourceHash(sourceUrl)}.json`);
}

function has(profile, sourceUrl) {
  return fs.existsSync(file(profile, sourceUrl));
}

/**
 * True only for a record that exists AND is still marked `__invalidated`
 * (e.g. extracted under a schema/instruction set later found to be wrong —
 * see docs re: the truncation bug and the 2026-09-06 annual_report calibration
 * FAIL). The queue treats an invalidated record as "not yet extracted" so a
 * bad batch can be re-queued and overwritten by `put()` without needing a
 * file delete, which the Cowork mount forbids anyway.
 */
function isInvalidated(profile, sourceUrl) {
  try {
    const rec = JSON.parse(fs.readFileSync(file(profile, sourceUrl), 'utf8'));
    return !!(rec && rec.__invalidated);
  } catch (_) {
    return false;
  }
}

/**
 * Read an extract. A SHADOW profile's extracts are invisible here by design —
 * they exist for calibration and nothing else, so a consuming skill asking for
 * one gets `null` (an ordinary cache miss it already knows how to handle) rather
 * than an unvalidated number it would treat as fact.
 *
 * `{ includeShadow: true }` is for the calibration tooling only.
 */
function get(profile, sourceUrl, { includeShadow = false, includeInvalidated = false } = {}) {
  if (!includeShadow && isShadow(profile)) return null;
  try {
    const rec = JSON.parse(fs.readFileSync(file(profile, sourceUrl), 'utf8'));
    // An invalidated record stays on disk (the mount forbids unlink, and the
    // history is worth keeping) but must never be served or calibrated against.
    if (!includeInvalidated && rec && rec.__invalidated) return null;
    return rec;
  } catch (_) {
    return null;
  }
}

/**
 * Persist an extract. `verification` is REQUIRED and must carry an L1 verdict:
 * an unverified extract is exactly the artifact this design exists to prevent
 * (plan §2), so the store refuses one rather than trusting the caller to have
 * remembered. Rejected extracts go to `_rejected/` — kept, not discarded, because
 * a rising rejection rate is the earliest signal of prompt regression and you
 * cannot diagnose it from a count alone.
 */
function put(profile, sourceUrl, extract) {
  if (!extract || typeof extract !== 'object') throw new Error('put: extract must be an object');
  if (!extract.verification || !extract.verification.l1) {
    throw new Error(
      `put: refusing to store an unverified extract for ${sourceUrl} — run verifyExtract() first`
    );
  }
  const { isL1Rejection } = require('./verifyExtract');
  const rejected = isL1Rejection(extract.verification.l1);
  extractionQualityCounter.record(resolveJobName('unknown-job'), {
    profile,
    l1Status: extract.verification.l1.status,
    confidence: extract.confidence,
  });
  const target = rejected
    ? path.join(
        db.cachePath(path.join('doc-extracts', '_rejected', String(profile))),
        `${sourceHash(sourceUrl)}.json`
      )
    : file(profile, sourceUrl);

  const record = {
    schemaVersion: SCHEMA_VERSION,
    // Per-profile version at write time — see PROFILE_SCHEMA_VERSIONS above.
    // Stamped even though today's value is 1 for every profile, so the very
    // next profiles.md schema bump has a baseline to compare against instead
    // of every already-stored record silently reading as "version undefined".
    profileSchemaVersion: declaredSchemaVersion(profile),
    profile,
    sourceUrl,
    sourceHash: sourceHash(sourceUrl),
    extractedAt: new Date().toISOString(),
    ...extract,
  };
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2));
  fs.renameSync(tmp, target);
  return { path: target, rejected };
}

/** Count what's on disk per profile — the numerator for the plan's §6 metrics. */
function stats() {
  const out = {};
  for (const p of PROFILES) {
    const d = dir(p);
    const r = db.cachePath(path.join('doc-extracts', '_rejected', p));
    // `__testArtifact` records are excluded from the counts: the rejection rate
    // is a prompt-health signal, and a deliberate fabrication control from a
    // pipeline test would sit in it forever inflating the number it exists to
    // make readable. (The Cowork mount forbids unlink, so such records are marked
    // rather than deleted.)
    const count = (dd) => {
      try {
        return fs
          .readdirSync(dd)
          .filter((f) => f.endsWith('.json'))
          .filter((f) => {
            try {
              const r = JSON.parse(fs.readFileSync(path.join(dd, f), 'utf8'));
              return !r.__testArtifact && !r.__invalidated;
            } catch (_) {
              return true;
            }
          }).length;
      } catch (_) {
        return 0;
      }
    };
    out[p] = {
      stored: count(d),
      rejected: count(r),
      state: isServed(p) ? 'served' : isShadow(p) ? 'shadow' : 'off',
    };
  }
  return out;
}

module.exports = {
  SCHEMA_VERSION,
  PROFILES,
  PROFILE_SCHEMA_VERSIONS,
  declaredSchemaVersion,
  isEnabled,
  isServed,
  isShadow,
  isQueued,
  sourceHash,
  sourceText,
  sourceTextMeta,
  pdfTextPath,
  dir,
  file,
  has,
  isInvalidated,
  get,
  put,
  stats,
};
