#!/usr/bin/env node
'use strict';

/**
 * offloadToDrive.js
 * 
 * Synchronizes the local data/ folder (including generated reports, notes, and agent-outputs)
 * to Google Drive via the `jobs` sync mechanism.
 * Upon successful sync, it completely removes the local data/ directory to ensure nothing
 * is stored locally long-term.
 */

const fs = require('fs');
const path = require('path');
const { loadEnv } = require('../lib/env');
loadEnv();
const { syncToDrive, resolveDataRoot } = require('../lib/driveDataStore');

/**
 * Wipe the contents of dataRoot, but never follow or delete symlinks.
 *
 * The data/ folder is meant to hold only generated reports/notes/agent-outputs,
 * but stray symlinks (e.g. a convenience `data/.env -> ../../../.env` some
 * local setup created) can end up inside it. Blindly `rm -rf`-ing the whole
 * tree would unlink those too - harmless in principle (unlink never touches
 * the symlink's target), but we skip them anyway: it's safer to never let an
 * automated wipe touch anything named/pointing at `.env` or other dotfiles
 * that look like config/secrets, and it keeps this step from aborting
 * halfway through when a sandbox or filesystem refuses to remove them.
 *
 * @param {string} dataRoot
 * @returns {{removed: number, skipped: string[]}}
 */
function wipeDataRootSafely(dataRoot) {
  const skipped = [];
  let removed = 0;

  for (const entry of fs.readdirSync(dataRoot, { withFileTypes: true })) {
    const abs = path.join(dataRoot, entry.name);

    if (entry.isSymbolicLink()) {
      skipped.push(entry.name);
      continue;
    }

    try {
      fs.rmSync(abs, { recursive: true, force: true });
      removed += 1;
    } catch (e) {
      // Don't let one stubborn entry abort the whole wipe - report and move on.
      skipped.push(`${entry.name} (${e.code || e.message})`);
    }
  }

  return { removed, skipped };
}

async function run() {
  try {
    console.log('[Offload] Starting sync to Google Drive...');

    // syncToDrive handles both local-mount and api transports based on environment configuration.
    // It is asynchronous when using the API transport.
    const result = await syncToDrive({ dryRun: false });

    if (result.enabled) {
      console.log(`[Offload] Sync complete via ${result.transport}. Copied ${result.copied}/${result.indexed} files.`);

      if (result.copied === result.indexed) {
        const dataRoot = resolveDataRoot();
        if (fs.existsSync(dataRoot)) {
          console.log(`[Offload] Wiping local cache at ${dataRoot}...`);
          const { removed, skipped } = wipeDataRootSafely(dataRoot);
          console.log(`[Offload] Local cache wiped (${removed} top-level entries removed). Offload complete.`);
          if (skipped.length) {
            console.log(`[Offload] Skipped (left in place, not part of synced report data): ${skipped.join(', ')}`);
          }
        } else {
          console.log('[Offload] Local cache already empty.');
        }
      } else {
        console.error('[Offload] WARNING: Not all files were copied successfully. Local cache will NOT be wiped to prevent data loss.');
        process.exit(1);
      }
    } else {
      console.log('[Offload] Sync is disabled or not configured. Cache NOT wiped.');
    }
  } catch (err) {
    console.error('[Offload] Error during offload process:', err);
    process.exit(1);
  }
}

run();
