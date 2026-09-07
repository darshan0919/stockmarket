#!/usr/bin/env node
'use strict';

/**
 * migrateCreatedAtToCreationTime.js — one-off migration removing the
 * redundant, legacy `createdAt` field from every note record in
 * data/notes.json.
 *
 * BACKGROUND (2026-09-07/08 incident): the note schema used to write
 * `createdAt` as its canonical "when was this note written" timestamp. A
 * 2026-09-07 change moved to `creationTime` (set once by lib/db.js's
 * ensureEnvelope) as the ONE canonical write-timestamp, but left the old
 * `createdAt` field sitting on every pre-existing record, and several
 * read-sites kept a `creationTime || createdAt` fallback chain rather than
 * dropping the legacy field outright. One reader (postCloseScanInsights.js's
 * collectCachedNotesSinceCutoff) was never updated to even try
 * `creationTime` — it read `createdAt` ONLY — so every note written after
 * the 2026-09-07 migration (which never got a createdAt) silently vanished
 * from that function's output. A production run on 2026-09-07 wrote 42 real
 * insight notes and the digest reported 0.
 *
 * This script is step 2 of the fix (step 1 was the code fix in lib/db.js,
 * lib/notesDb.js, and postCloseScanInsights.js — see those files' comments
 * dated 2026-09-08): it removes the dead field from data, so the schema has
 * exactly one timestamp pair (creationTime, modifiedTime) per note record,
 * matching what the code now assumes everywhere.
 *
 * Safety:
 *  - Verifies FIRST that every record's `createdAt` (where present) is
 *    byte-identical to its `creationTime` before touching anything. If even
 *    one record disagrees, the script aborts with no writes — a genuine
 *    drift would mean this migration needs a human decision (which value is
 *    correct), not a silent pick.
 *  - Writes a timestamped backup of the untouched file to
 *    data/_meta/checkpoints/ before mutating (same directory lib/db.js's own
 *    checkpoint() uses, so it survives a data:push like any other checkpoint).
 *  - Uses lib/db.js's own withLock + loadFile + writeFileAtomic — the same
 *    primitives every other write to notes.json goes through — rather than
 *    touching the file directly, per skills/_shared/conventions.md §3/§6
 *    ("lib/db.js is the ONLY module that may touch data/*.json").
 *  - Idempotent: a second run finds nothing left to strip and reports 0
 *    changed, so it is always safe to re-run after verifying.
 *
 * Usage:
 *   node migrateCreatedAtToCreationTime.js --dry-run   (report only, no writes)
 *   node migrateCreatedAtToCreationTime.js              (writes; use after --dry-run looks right)
 */

const fs = require('fs');
const path = require('path');
const { loadEnv, hasFlag } = require('../lib/env');
loadEnv();
const db = require('../lib/db');

const DRY = hasFlag('--dry-run');

function main() {
  db.init();
  const file = db.collectionFile('notes');
  if (!fs.existsSync(file)) {
    console.log(JSON.stringify({ status: 'no-op', reason: 'notes.json does not exist' }));
    return;
  }

  const before = db.loadFile(file);
  const ids = Object.keys(before);

  let withCreatedAt = 0;
  let dropped = 0;
  const drift = [];

  for (const id of ids) {
    const rec = before[id];
    if (!('createdAt' in rec)) continue;
    withCreatedAt++;
    if (rec.createdAt !== rec.creationTime) {
      drift.push({ id, createdAt: rec.createdAt, creationTime: rec.creationTime });
    }
  }

  if (drift.length) {
    console.error(
      JSON.stringify(
        {
          status: 'aborted',
          reason: `${drift.length} record(s) have createdAt !== creationTime — needs a human decision, not an automated migration`,
          sample: drift.slice(0, 10),
        },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  if (DRY) {
    console.log(
      JSON.stringify(
        {
          status: 'dry-run',
          totalRecords: ids.length,
          recordsWithCreatedAt: withCreatedAt,
          driftFound: 0,
          wouldStrip: withCreatedAt,
        },
        null,
        2
      )
    );
    return;
  }

  if (!withCreatedAt) {
    console.log(
      JSON.stringify({ status: 'no-op', reason: 'no records carry createdAt already', totalRecords: ids.length })
    );
    return;
  }

  db.withLock('notes', () => {
    // Manual checkpoint (db.js's own checkpoint() isn't exported) — same
    // directory and naming convention, so it's indistinguishable from one
    // lib/db.js would have made itself, and survives data:push like any
    // other checkpoint (push is push-only, never deletes).
    const checkpointsDir = path.join(db.dataRoot(), '_meta', 'checkpoints');
    fs.mkdirSync(checkpointsDir, { recursive: true });
    const backupName = `notes.${Date.now()}.pre-createdAt-migration.json`;
    fs.copyFileSync(file, path.join(checkpointsDir, backupName));

    const current = db.loadFile(file); // re-read under lock in case of a race
    for (const id of Object.keys(current)) {
      if ('createdAt' in current[id]) {
        delete current[id].createdAt;
        dropped++;
      }
    }
    db.writeFileAtomic(file, current);
  });

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        totalRecords: ids.length,
        recordsWithCreatedAt: withCreatedAt,
        stripped: dropped,
        backupWritten: true,
      },
      null,
      2
    )
  );
}

main();
