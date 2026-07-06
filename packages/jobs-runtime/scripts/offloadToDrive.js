#!/usr/bin/env node
'use strict';

/**
 * offloadToDrive.js
 *
 * Synchronizes the local jobs/data/ folder (generated reports, notes, entities,
 * events, documents, agent-outputs) to Google Drive via the `jobs` sync mechanism.
 * Upon successful sync, it removes the SYNCED files locally so nothing is stored
 * long-term.
 *
 * SAFETY CONTRACT: this script deletes ONLY files that were indexed by
 * classifyLocalDocument() and confirmed copied to Drive. It never blanket-wipes
 * the data root — an earlier version did, and silently deleted files the
 * classifier didn't recognize (they were wiped without ever being uploaded).
 * Unclassified files are left in place and reported loudly so the classifier
 * can be extended instead.
 */

const fs = require('fs');
const path = require('path');
const { loadEnv } = require('../lib/env');
loadEnv();
const { syncToDrive, resolveDataRoot, localDocuments } = require('../lib/driveDataStore');

/** Recursively list all regular files under root (skips symlinks). */
function listFiles(root) {
  const out = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(abs);
      else if (entry.isFile()) out.push(abs);
    }
  };
  if (fs.existsSync(root)) visit(root);
  return out;
}

/** Delete the given absolute file paths, then prune now-empty directories. */
function removeSyncedFiles(dataRoot, absPaths) {
  const skipped = [];
  let removed = 0;

  for (const abs of absPaths) {
    try {
      fs.rmSync(abs, { force: true });
      removed += 1;
    } catch (e) {
      skipped.push(`${path.relative(dataRoot, abs)} (${e.code || e.message})`);
    }
  }

  // Prune empty directories bottom-up (never the data root itself).
  const pruneEmpty = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) pruneEmpty(path.join(dir, entry.name));
    }
    if (dir !== dataRoot && fs.readdirSync(dir).length === 0) {
      try {
        fs.rmdirSync(dir);
      } catch (_) {
        /* leave it */
      }
    }
  };
  pruneEmpty(dataRoot);

  return { removed, skipped };
}

async function run() {
  try {
    console.log('[Offload] Starting sync to Google Drive...');

    const dataRoot = resolveDataRoot();

    // Snapshot what the classifier will sync BEFORE syncing, so we delete
    // exactly (and only) that set afterwards.
    const docs = localDocuments(dataRoot);
    const allFiles = listFiles(dataRoot);
    const syncedSet = new Set(docs.map((d) => d.abs));
    const unclassified = allFiles.filter(
      (abs) => !syncedSet.has(abs) && path.basename(abs) !== '.env'
    );

    // syncToDrive handles both local-mount and api transports based on environment configuration.
    const result = await syncToDrive({ dryRun: false });

    if (!result.enabled) {
      console.log('[Offload] Sync is disabled or not configured. Cache NOT wiped.');
      return;
    }

    console.log(`[Offload] Sync complete via ${result.transport}. Copied ${result.copied}/${result.indexed} files.`);

    if (result.copied !== result.indexed) {
      console.error('[Offload] WARNING: Not all files were copied successfully. Local cache will NOT be wiped to prevent data loss.');
      process.exit(1);
    }

    if (fs.existsSync(dataRoot)) {
      console.log(`[Offload] Removing ${syncedSet.size} synced files from ${dataRoot}...`);
      const { removed, skipped } = removeSyncedFiles(dataRoot, [...syncedSet]);
      console.log(`[Offload] Removed ${removed} synced files. Offload complete.`);
      if (skipped.length) {
        console.log(`[Offload] Skipped (could not remove): ${skipped.join(', ')}`);
      }
    } else {
      console.log('[Offload] Local cache already empty.');
    }

    if (unclassified.length) {
      console.error(
        `[Offload] WARNING: ${unclassified.length} file(s) under the data root were NOT recognized by classifyLocalDocument() and were neither uploaded nor deleted:`
      );
      for (const abs of unclassified.slice(0, 50)) {
        console.error(`  - ${path.relative(dataRoot, abs)}`);
      }
      console.error('[Offload] Extend classifyLocalDocument() in lib/driveDataStore.js to cover these paths.');
      process.exit(2);
    }
  } catch (err) {
    console.error('[Offload] Error during offload process:', err);
    process.exit(1);
  }
}

run();
