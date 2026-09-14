#!/usr/bin/env node
'use strict';

/**
 * pruneRemoteOrphans.js — Safely prune migrated legacy loose files from Google Drive.
 *
 * Requirements:
 *  - Whitelist-only: Only touches candidate migrated folders (reports, conversations,
 *    learnyst, youtube, and sharded cache stores).
 *  - Target Replacement Verification: Only trashes a remote loose file if its
 *    corresponding consolidated .jsonl replacement is confirmed uploaded to Drive.
 *  - Safe Deletion: Moves files to Drive Trash (trashed: true), never permanent delete.
 *  - Dry-run by default: Requires `--execute` to perform changes.
 *
 * Usage:
 *   node pruneRemoteOrphans.js [--dry-run] [--execute]
 */

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const { extractQuarter, extractYear } = require('../lib/jsonlStore');
const { loadEnv, hasFlag } = require('../lib/env');
loadEnv();

const {
  createDriveClient,
  listAllFiles,
  isApiConfigured,
} = require('@stock/cloud-utils/src/googleDriveApi');

const DRIVE_ROOT = process.env.DATA_V2_DRIVE_ROOT || 'StockMarket/data/v2';

const CANDIDATE_PATTERNS = [
  /^reports\/rpt_.*\.json$/,
  /^reports\/reports-\d{4}-\d{2}\.jsonl$/,
  /^conversations\/conv_.*\.json$/,
  /^conversations\/conversations-\d{4}-\d{2}\.jsonl$/,
  /^events-\d{4}-\d{2}\.json$/,
  /^learnyst-lessons\/lyt_.*\.json$/,
  /^learnyst-lessons\/course_.*\.jsonl$/,
  /^learnyst-lessons\/soic\.jsonl$/,
  /^youtube-transcripts\/ytt_.*\.json$/,
  /^youtube-transcripts\/.*_\d{4}\.jsonl$/,
  /^youtube-transcripts\/(soicfinance|anillamba)\.jsonl$/,
  /^cache\/pdf-text\/[0-9a-fA-F]+\.json$/,
  /^cache\/pdf-text-full\/[0-9a-fA-F]+\.json$/,
  /^cache\/monthly-updates-text\/[0-9a-fA-F]+\.json$/,
  /^cache\/monthly-updates-parsed\/[0-9a-fA-F]+\.json$/,
  /^cache\/monthly-updates-parsed\/shard_.*\.jsonl$/,
  /^cache\/doc-extracts\/[^/]+\/[0-9a-fA-F]+\.json$/,
  /^cache\/doc-extracts\/[^/]+\/shard_.*\.jsonl$/,
  /^cache\/(stockscans-context|company-baselines|event-reaction)\/[^/]+\.json$/,
  /^cache\/rerating-catalysts\/[^/]+\/[^/]+\.json$/,
  /^cache\/order-announcements\/[^/]+\/[^/]+\.json$/,
  /^cache\/order-announcements\/[A-Z0-9_:-]+\.jsonl$/,
  /^cache\/concall-notes\/[^/]+\/[^/]+\.json$/,
  /^cache\/concall-notes\/[A-Z0-9_:-]+\.jsonl$/,
  /^cache\/(stockscans-context|company-baselines|event-reaction|order-announcements|concall-notes)\/shard_.*\.jsonl$/,
  /^cache\/rerating-catalysts\/[^/]+\/shard_.*\.jsonl$/,
  /^cache\/gainers-scanner\/[^/]+\.json$/,
  /^cache\/monthly-updates-scan\/[^/]+\.json$/,
  /^runs\/(gainers_raw|gainers_insights|gainers_why|volume_rocketing_raw|volume_rocketing_insights|digest|ipo_subscription)_\d{8}\.json$/,
  /^runs\/monthly-updates-batches\/batch_.*$/,
];

function isCandidateOrphan(driveRel) {
  // Heavy 16-hex sharded stores are permanent:
  if (driveRel.startsWith('cache/pdf-text/shard_')) return false;
  if (driveRel.startsWith('cache/pdf-text-full/shard_')) return false;
  if (driveRel.startsWith('cache/monthly-updates-text/shard_')) return false;
  if (driveRel.startsWith('learnyst-lessons/shard_')) return false;
  if (driveRel.startsWith('youtube-transcripts/shard_')) return false;

  // Single JSONLs are target replacements:
  if (driveRel === 'cache/monthly-updates-parsed/parsed.jsonl') return false;
  if (/^cache\/doc-extracts\/[^/]+\.jsonl$/.test(driveRel)) return false;
  if (/^reports\/reports-\d{4}-Q\d\.jsonl$/.test(driveRel)) return false;
  if (/^conversations\/conversations-\d{4}\.jsonl$/.test(driveRel)) return false;
  if (/^events-\d{4}\.json$/.test(driveRel)) return false;
  if (/^(reports|conversations|learnyst-lessons|youtube-transcripts)\.json$/.test(driveRel))
    return false;
  if (driveRel === 'runs/monthly-updates-batches/batches.json') return false;
  if (driveRel === 'cache/stockscans-context/context.jsonl') return false;
  if (driveRel === 'cache/company-baselines/baselines.jsonl') return false;
  if (driveRel === 'cache/event-reaction/reactions.jsonl') return false;
  if (driveRel === 'cache/order-announcements/announcements.jsonl') return false;
  if (driveRel === 'cache/concall-notes/notes.jsonl') return false;
  if (driveRel === 'cache/rerating-catalysts/briefs.jsonl') return false;
  if (driveRel === 'cache/rerating-catalysts/filings.jsonl') return false;
  if (driveRel === 'cache/gainers-scanner/scanner.jsonl') return false;
  if (driveRel === 'cache/monthly-updates-scan/scans.jsonl') return false;

  return CANDIDATE_PATTERNS.some((re) => re.test(driveRel));
}

function expectedReplacement(driveRel) {
  if (driveRel.startsWith('reports/')) {
    const q = extractQuarter(driveRel) || '2026-Q3';
    return `reports/reports-${q}.jsonl`;
  }
  if (driveRel.startsWith('conversations/')) {
    const yr = extractYear(driveRel) || '2026';
    return `conversations/conversations-${yr}.jsonl`;
  }
  if (/^events-\d{4}-\d{2}\.json$/.test(driveRel)) {
    const yr = driveRel.slice(7, 11);
    return `events-${yr}.json`;
  }
  if (driveRel.startsWith('learnyst-lessons/')) {
    return 'learnyst-lessons/shard_0.jsonl';
  }
  if (driveRel.startsWith('youtube-transcripts/')) {
    return 'youtube-transcripts/shard_0.jsonl';
  }
  if (driveRel.startsWith('cache/doc-extracts/')) {
    const m = driveRel.match(/^cache\/doc-extracts\/([^/]+)/);
    return m ? `cache/doc-extracts/${m[1]}.jsonl` : null;
  }
  if (driveRel.startsWith('cache/stockscans-context/')) {
    return 'cache/stockscans-context/context.jsonl';
  }
  if (driveRel.startsWith('cache/company-baselines/')) {
    return 'cache/company-baselines/baselines.jsonl';
  }
  if (driveRel.startsWith('cache/event-reaction/')) {
    return 'cache/event-reaction/reactions.jsonl';
  }
  if (driveRel.startsWith('cache/rerating-catalysts/')) {
    if (driveRel.includes('brief')) return 'cache/rerating-catalysts/briefs.jsonl';
    if (driveRel.includes('filing')) return 'cache/rerating-catalysts/filings.jsonl';
    return 'cache/rerating-catalysts/briefs.jsonl';
  }
  if (driveRel.startsWith('cache/order-announcements/')) {
    return 'cache/order-announcements/announcements.jsonl';
  }
  if (driveRel.startsWith('cache/concall-notes/')) {
    return 'cache/concall-notes/notes.jsonl';
  }
  if (driveRel.startsWith('cache/gainers-scanner/')) {
    return 'cache/gainers-scanner/scanner.jsonl';
  }
  if (driveRel.startsWith('cache/monthly-updates-scan/')) {
    return 'cache/monthly-updates-scan/scans.jsonl';
  }
  if (driveRel.startsWith('runs/')) {
    const m = driveRel.match(
      /^runs\/(gainers_raw|gainers_insights|gainers_why|volume_rocketing_raw|volume_rocketing_insights|digest|ipo_subscription)_(\d{4})\d{4}\.json$/
    );
    if (m) {
      const type = m[1].replace(/_/g, '-');
      const yr = m[2];
      return `runs/${type}-${yr}.jsonl`;
    }
  }
  if (driveRel.startsWith('cache/pdf-text/')) {
    const hex = path.basename(driveRel, '.json')[0].toLowerCase();
    return `cache/pdf-text/shard_${hex}.jsonl`;
  }
  if (driveRel.startsWith('cache/pdf-text-full/')) {
    const hex = path.basename(driveRel, '.json')[0].toLowerCase();
    return `cache/pdf-text-full/shard_${hex}.jsonl`;
  }
  if (driveRel.startsWith('cache/monthly-updates-text/')) {
    const hex = path.basename(driveRel, '.json')[0].toLowerCase();
    return `cache/monthly-updates-text/shard_${hex}.jsonl`;
  }
  if (driveRel.startsWith('cache/monthly-updates-parsed/')) {
    return 'cache/monthly-updates-parsed/parsed.jsonl';
  }
  if (driveRel.startsWith('runs/monthly-updates-batches/')) {
    return 'runs/monthly-updates-batches/batches.jsonl';
  }
  return null;
}

async function run() {
  const isExecute = hasFlag('--execute');
  const isDryRun = hasFlag('--dry-run') || !isExecute;

  console.log(
    `[data:prune-remote] Mode: ${isDryRun ? 'DRY-RUN (audit only)' : 'EXECUTE (trashing remote orphans)'}`
  );

  if (isApiConfigured && !isApiConfigured()) {
    console.log('[data:prune-remote] Google Drive API is not configured. Aborting.');
    return;
  }

  const { drive } = createDriveClient();
  console.log(`[data:prune-remote] Listing remote files under ${DRIVE_ROOT}...`);
  const remoteFiles = await listAllFiles(drive, DRIVE_ROOT);
  const remoteByRel = new Map(remoteFiles.map((f) => [f.driveRel, f]));

  console.log(`[data:prune-remote] Total remote files on Drive: ${remoteFiles.length}`);

  // Check which candidate files are orphans
  const orphans = [];
  const missingReplacement = [];

  for (const f of remoteFiles) {
    if (!isCandidateOrphan(f.driveRel)) continue;

    // Check if local replacement exists
    const replacement = expectedReplacement(f.driveRel);
    let replacementReady = false;

    if (replacement && replacement.includes('*')) {
      // Wildcard check (e.g. course_*.jsonl or channel_*.jsonl)
      const folder = replacement.split('/')[0];
      const matchingRemote = remoteFiles.some(
        (rf) => rf.driveRel.startsWith(`${folder}/`) && rf.driveRel.endsWith('.jsonl')
      );
      replacementReady = matchingRemote;
    } else if (replacement) {
      // Exact replacement check on Drive
      replacementReady = remoteByRel.has(replacement);
    }

    if (replacementReady) {
      orphans.push(f);
    } else {
      missingReplacement.push({ file: f.driveRel, expected: replacement });
    }
  }

  console.log(`\n[data:prune-remote] Analysis:`);
  console.log(`  - Candidate remote orphans verified for pruning: ${orphans.length}`);
  if (missingReplacement.length > 0) {
    console.warn(
      `  - SKIPPED (replacement .jsonl not yet confirmed on Drive): ${missingReplacement.length}`
    );
    missingReplacement
      .slice(0, 5)
      .forEach((m) => console.warn(`      * ${m.file} (needs ${m.expected})`));
  }

  if (orphans.length === 0) {
    console.log('[data:prune-remote] No remote orphans found. Drive is clean.');
    return;
  }

  // Print sample of orphans
  console.log('\n[data:prune-remote] Sample remote orphans to trash:');
  orphans.slice(0, 10).forEach((f) => console.log(`  🗑 ${f.driveRel} (${f.id})`));
  if (orphans.length > 10) console.log(`  ... and ${orphans.length - 10} more`);

  if (isDryRun) {
    console.log(
      '\n[data:prune-remote] DRY RUN COMPLETE. Run with `--execute` to trash remote orphans.'
    );
    return;
  }

  // Execute trashing
  console.log(`\n[data:prune-remote] Trashing ${orphans.length} remote orphans...`);
  let trashedCount = 0;
  let errorCount = 0;

  const CONCURRENCY = 8;
  let idx = 0;

  async function worker() {
    while (idx < orphans.length) {
      const cur = idx++;
      const f = orphans[cur];
      try {
        await drive.files.update({
          fileId: f.id,
          requestBody: { trashed: true },
        });
        trashedCount++;
        if (trashedCount % 100 === 0 || trashedCount === orphans.length) {
          console.log(`  Progress: ${trashedCount}/${orphans.length} trashed...`);
        }
      } catch (e) {
        console.error(`  Error trashing ${f.driveRel}: ${e.message}`);
        errorCount++;
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, orphans.length) }, () => worker());
  await Promise.all(workers);

  console.log(
    `\n[data:prune-remote] Remote pruning complete: ${trashedCount} trashed, ${errorCount} errors.`
  );

  // Purge sync-state.json entries
  const statePath = path.join(db.dataRoot(), '_meta', 'sync-state.json');
  if (fs.existsSync(statePath)) {
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      for (const f of orphans) {
        delete state.files[f.driveRel];
      }
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
      console.log(`[data:prune-remote] Cleaned ${trashedCount} entries from sync-state.json.`);
    } catch (_) {}
  }
}

run().catch((e) => {
  console.error('[data:prune-remote] FAILED:', e);
  process.exit(1);
});
