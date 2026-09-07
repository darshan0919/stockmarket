'use strict';

/**
 * cursorHealth.js — flags any windowCursor.js-backed job whose cursor hasn't
 * advanced when it should have (conventions.md §25, Task 5 of the
 * "lets track these too" instrumentation work).
 *
 * WHY THIS EXISTS: every job on the `windowCursor.js` pattern (see that
 * module's header) only does its expensive per-item work (PDF reads, LLM
 * judgment calls, notifications) once per committed window. If a job's
 * scheduler entry silently stops firing, or every run this week has errored
 * before reaching `commitWindow()`, the SYMPTOM the team actually notices is
 * downstream — a quiet digest, a coverage gap discovered days later reading
 * `document-preprocessing`'s own l1RejectionRatePct. The cursor file itself
 * is the earliest place this failure is visible: `lastCommittedAtMs` simply
 * stops moving. This script makes that visible directly instead of waiting
 * for a downstream symptom to be noticed by a human.
 *
 * HOW EXPECTED CADENCE IS DERIVED: there is no machine-readable cron
 * schedule anywhere in this repo (checked: no registry.json field, no cron
 * expression in any Scheduled/*\/SKILL.md — cadence is documented there only
 * as prose under a "## Cadence" heading, e.g. document-preprocessing's
 * "every 30 minutes between 09:00 and 23:30 IST"). Rather than parse that
 * prose (fragile — one rewrite of the cadence section silently breaks
 * detection), CURSOR_CADENCE_HOURS below is an explicit, hand-maintained map
 * from windowCursor jobName -> expected max hours between commits, sourced
 * from each job's own "## Cadence" section at the time this script was
 * written (2026-09-07). Keep it in sync the same day a job's cadence
 * changes — same discipline conventions.md already asks for with
 * PROFILE_SCHEMA_VERSIONS in docExtracts.js.
 *
 * A cursor file with no entry in CURSOR_CADENCE_HOURS is reported as
 * "unmapped" rather than silently skipped or silently assumed-fine — an
 * unmapped cursor is itself a coverage gap in THIS script, not a passing
 * result.
 */

const fs = require('fs');
const path = require('path');
const db = require('./lib/db');
const ist = require('./lib/ist');
const { hasFlag } = require('./lib/env');

/**
 * jobName (as embedded in the cursor filename) -> expected max hours between
 * commits before it's worth a human looking. Deliberately a bit looser than
 * the nominal cadence (e.g. 2x the documented interval) so a single missed
 * slot doesn't page anyone — only a genuinely stuck cursor should flag.
 */
const CURSOR_CADENCE_HOURS = {
  // document-preprocessing/SKILL.md "## Cadence": every 30 min, 09:00-23:30 IST,
  // guaranteed passes at 12:30/15:20/18:40/21:15 -> loosest guaranteed gap ~3h.
  'document-preprocessing': 6,
  // post-close-scan-insights runs once per trading day after close; allow a
  // full weekend/holiday gap before flagging.
  'post-close-scan-insights': 72,
  // watchlist-insights (watchlist-daily-insights-stockmarket)'s own
  // description: "daily digest ... at least back to the previous day's 8AM
  // IST" -> once/day, same weekend-gap allowance.
  'watchlist-insights': 72,
};

function listCursorFiles() {
  const cacheDir = db.cachePath('.');
  let names;
  try {
    names = fs.readdirSync(cacheDir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return names
    .filter((n) => /-cursor(-[^.]+)?\.json$/.test(n) && !n.includes('-TEST-'))
    .filter((n) => !/-pending-window/.test(n))
    .sort();
}

/** '<jobName>-cursor.json' -> 'jobName'; '<jobName>-cursor-<key>.json' -> {jobName, key}. */
function parseCursorFilename(filename) {
  const m = filename.match(/^(.+)-cursor(?:-([^.]+))?\.json$/);
  if (!m) return null;
  return { jobName: m[1], key: m[2] || null };
}

function checkOne(filename, { nowMs }) {
  const parsed = parseCursorFilename(filename);
  const cacheDir = db.cachePath('.');
  const raw = JSON.parse(fs.readFileSync(path.join(cacheDir, filename), 'utf8'));

  // watchlist-insights' cursor file is keyed by watchlist-combo instead of
  // being a single flat record (see windowCursor.js's per-key path scheme,
  // and watchlist-insights-cursor.json's own shape: top-level keys are
  // comma-joined watchlist ids, not lastCommittedAtMs directly). Detect that
  // shape and check every sub-cursor independently rather than mis-reading
  // the whole file as one record with no lastCommittedAtMs.
  const isKeyedRecord = raw && typeof raw === 'object' && !Number.isFinite(raw.lastCommittedAtMs);
  const subRecords = isKeyedRecord
    ? Object.entries(raw).map(([subKey, rec]) => ({ subKey, rec }))
    : [{ subKey: parsed.key || null, rec: raw }];

  const cadenceHours = CURSOR_CADENCE_HOURS[parsed.jobName];
  const results = [];
  for (const { subKey, rec } of subRecords) {
    const lastCommittedAtMs = rec && Number.isFinite(rec.lastCommittedAtMs) ? rec.lastCommittedAtMs : null;
    const ageHours = lastCommittedAtMs != null ? (nowMs - lastCommittedAtMs) / (60 * 60 * 1000) : null;
    let status;
    if (lastCommittedAtMs == null) {
      status = 'unreadable';
    } else if (cadenceHours == null) {
      status = 'unmapped';
    } else if (ageHours > cadenceHours) {
      status = 'stale';
    } else {
      status = 'ok';
    }
    results.push({
      file: filename,
      jobName: parsed.jobName,
      key: subKey,
      lastCommittedAtIso: rec && rec.lastCommittedAtIso ? rec.lastCommittedAtIso : null,
      ageHours: ageHours != null ? Math.round(ageHours * 10) / 10 : null,
      cadenceHours: cadenceHours != null ? cadenceHours : null,
      status,
    });
  }
  return results;
}

/**
 * A pending-window marker that's been sitting uncommitted for a long time
 * means a run started (savePendingWindow) but never reached commitWindow —
 * exactly the "confirmed healthy" gate windowCursor.js's header describes.
 * That's worth surfacing distinctly from cursor staleness: the cursor might
 * still look fine (last commit was on time) while the MOST RECENT run is
 * silently stuck partway through.
 */
function checkPendingWindows({ nowMs }) {
  const cacheDir = db.cachePath('.');
  let names;
  try {
    names = fs.readdirSync(cacheDir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const pendingFiles = names.filter(
    (n) => /-pending-window(-[^.]+)?\.json$/.test(n) && !n.includes('-TEST-')
  );
  return pendingFiles.map((filename) => {
    const raw = JSON.parse(fs.readFileSync(path.join(cacheDir, filename), 'utf8'));
    const windowEndMs = Number.isFinite(raw.windowEndMs) ? raw.windowEndMs : null;
    const ageHours = windowEndMs != null ? (nowMs - windowEndMs) / (60 * 60 * 1000) : null;
    return {
      file: filename,
      windowEndCreatedAtIso: raw.createdAtIso || null,
      ageHours: ageHours != null ? Math.round(ageHours * 10) / 10 : null,
      // A pending marker sitting uncommitted more than a day means the fetch
      // that wrote it never got followed by a healthy commitWindow — flag it
      // regardless of the owning job's own cadence, since this signals a
      // stuck/partial run, not just a slow one.
      status: ageHours != null && ageHours > 24 ? 'uncommitted' : 'ok',
    };
  });
}

function main() {
  const nowMs = ist.istDate().getTime();
  const jsonOut = hasFlag('--json');

  const cursorResults = listCursorFiles().flatMap((f) => checkOne(f, { nowMs }));
  const pendingResults = checkPendingWindows({ nowMs });

  const stale = cursorResults.filter((r) => r.status === 'stale' || r.status === 'unreadable');
  const unmapped = cursorResults.filter((r) => r.status === 'unmapped');
  const uncommittedPending = pendingResults.filter((r) => r.status === 'uncommitted');

  if (jsonOut) {
    console.log(JSON.stringify({ cursors: cursorResults, pendingWindows: pendingResults }, null, 2));
  } else {
    console.log('Cursor health check (conventions.md §25)');
    console.log('='.repeat(60));
    for (const r of cursorResults) {
      const label = r.key ? `${r.jobName} [${r.key}]` : r.jobName;
      const badge = { ok: 'OK', stale: 'STALE', unmapped: 'UNMAPPED', unreadable: 'UNREADABLE' }[r.status];
      console.log(
        `[${badge}] ${label} — last committed ${r.lastCommittedAtIso || 'never'}` +
          (r.ageHours != null ? ` (${r.ageHours}h ago${r.cadenceHours ? `, cadence cap ${r.cadenceHours}h` : ''})` : '')
      );
    }
    if (pendingResults.length) {
      console.log('');
      console.log('Pending (uncommitted) windows:');
      for (const r of pendingResults) {
        console.log(`[${r.status === 'ok' ? 'OK' : 'UNCOMMITTED'}] ${r.file} — opened ${r.windowEndCreatedAtIso || 'unknown'} (${r.ageHours}h ago)`);
      }
    }
    console.log('');
    console.log(
      `${stale.length} stale/unreadable, ${unmapped.length} unmapped, ${uncommittedPending.length} uncommitted pending window(s).`
    );
    if (unmapped.length) {
      console.log(
        `Add these jobs to CURSOR_CADENCE_HOURS in packages/jobs-runtime/cursorHealth.js (sourced from their SKILL.md "## Cadence" section): ${unmapped.map((r) => r.jobName).join(', ')}`
      );
    }
  }

  const failing = stale.length > 0 || uncommittedPending.length > 0;
  if (failing && !hasFlag('--no-fail')) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { listCursorFiles, parseCursorFilename, checkOne, checkPendingWindows, CURSOR_CADENCE_HOURS };
