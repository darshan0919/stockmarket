#!/usr/bin/env node
'use strict';

/**
 * offloadToDrive.js
 * 
 * Synchronizes the local data/ folder (including generated reports, notes, and agent-outputs)
 * to Google Drive via the `cowork-jobs` sync mechanism.
 * Upon successful sync, it completely removes the local data/ directory to ensure nothing
 * is stored locally long-term.
 */

const fs = require('fs');
const path = require('path');
const { loadEnv } = require('../lib/env');
loadEnv();
const { syncToDrive, resolveDataRoot } = require('../lib/driveDataStore');

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
          fs.rmSync(dataRoot, { recursive: true, force: true });
          console.log('[Offload] Local cache wiped successfully. Offload complete.');
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
