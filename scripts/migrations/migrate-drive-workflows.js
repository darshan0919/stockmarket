// scripts/migrate-drive-workflows.js
'use strict';

const fs = require('fs');
const path = require('path');
const { loadEnv } = require('../../packages/jobs-runtime/lib/env');
const { StorageService, ...driveApi } = require('@stock/cloud-utils');

async function main() {
  loadEnv(path.join(__dirname, '../.env'));

  if (!driveApi.isApiConfigured()) {
    console.error('Google Drive API is not configured.');
    return;
  }

  const { drive } = driveApi.createDriveClient();
  const rootPath = process.env.COWORK_DRIVE_PATH || driveApi.DEFAULT_ROOT_PATH;

  console.log(`Listing files under Drive root: ${rootPath}...`);
  const allFiles = await driveApi.listAllFiles(drive, rootPath);
  
  StorageService.init();
  const tempDir = path.join(__dirname, '../temp_migration_workflows');
  fs.mkdirSync(tempDir, { recursive: true });

  const processFile = async (file, newRelPath, isContent = false) => {
    const tempLocalPath = path.join(tempDir, file.name);
    try {
      console.log(`Migrating ${file.driveRel} -> ${newRelPath}`);
      await driveApi.downloadFile(drive, rootPath, file.driveRel, tempLocalPath);
      
      if (isContent) {
        const content = fs.readFileSync(tempLocalPath, 'utf8');
        await StorageService.saveContent(newRelPath, content, true);
      } else {
        const data = JSON.parse(fs.readFileSync(tempLocalPath, 'utf8'));
        if (newRelPath.startsWith('entities/')) {
          // If it's an entity, we can just use saveJson to meta.json directly for migration
          // to preserve history correctly without triggering a new version unless we want to.
          // Or we can just use saveEntity. saveJson is simpler.
          await StorageService.saveJson(newRelPath, data, true);
        } else {
          await StorageService.saveJson(newRelPath, data, true);
        }
      }

      console.log(`Deleting legacy file: ${file.driveRel}`);
      await drive.files.delete({ fileId: file.id });
      fs.unlinkSync(tempLocalPath);
    } catch (e) {
      console.error(`Failed to migrate ${file.name}:`, e.message);
    }
  };

  // 1. Gainers Scanner
  const gainers = allFiles.filter(f => f.driveRel.startsWith('daily_gainers/') && f.name.endsWith('_gainers_raw.json'));
  for (const f of gainers) {
    const match = f.name.match(/(\d{4})-(\d{2})-(\d{2})_gainers_raw\.json/);
    if (match) {
      const [_, yyyy, mm, dd] = match;
      const d = new Date(parseInt(yyyy), parseInt(mm)-1, parseInt(dd));
      const dto = StorageService.getEventDtoPaths('gainers_raw', d, 'events/gainers');
      await processFile(f, dto.jsonPath);
    }
  }

  // 2. Insight Validator - Sector Context
  const sectorContext = allFiles.filter(f => f.driveRel.startsWith('validation/sector_context_'));
  for (const f of sectorContext) {
    const match = f.name.match(/sector_context_(\d{4})(\d{2})(\d{2})\.json/);
    if (match) {
      const [_, yyyy, mm, dd] = match;
      const d = new Date(Date.UTC(parseInt(yyyy), parseInt(mm)-1, parseInt(dd)));
      const dto = StorageService.getEventDtoPaths('sector_context', d, 'events/validation/sector-context');
      await processFile(f, dto.jsonPath);
    }
  }

  // 3. Insight Validator - Ignored Logs
  const ignoredLogs = allFiles.filter(f => f.driveRel.startsWith('validation/ignored_log_'));
  for (const f of ignoredLogs) {
    const match = f.name.match(/ignored_log_(\d{4})(\d{2})(\d{2})\.json/);
    if (match) {
      const [_, yyyy, mm, dd] = match;
      const p = `events/validation/ignored-log/${yyyy}/${mm}/${dd}_log.json`;
      await processFile(f, p);
    }
  }

  // 4. Insight Validator - Ledger & Proposals
  const ledger = allFiles.find(f => f.driveRel === 'validation/ledger.json');
  if (ledger) await processFile(ledger, 'entities/validation/main/ledger/meta.json');
  
  const proposals = allFiles.find(f => f.driveRel === 'validation/proposals.md');
  if (proposals) await processFile(proposals, 'documents/validation/proposals/proposals.md', true);

  // 5. Market Data Delivery Cache
  const delivery = allFiles.filter(f => f.driveRel.startsWith('delivery_cache/sec_bhavdata_full_'));
  for (const f of delivery) {
    const match = f.name.match(/sec_bhavdata_full_(\d{2})(\d{2})(\d{4})\.csv/);
    if (match) {
      const [_, dd, mm, yyyy] = match;
      const p = `events/market-data/nse-delivery/${yyyy}/${mm}/sec_bhavdata_full_${yyyy}${mm}${dd}.csv`;
      await processFile(f, p, true);
    }
  }

  // 6. BSE Scrip Cache
  const scrip = allFiles.find(f => f.driveRel === 'delivery_cache/bse_scrip_codes.json');
  if (scrip) await processFile(scrip, 'entities/reference/bse/scrip_codes/meta.json');

  // 7. Watchlist Notes
  const notes = allFiles.filter(f => f.driveRel.startsWith('notes/notes_') && f.name.endsWith('.json'));
  if (notes.length > 0) {
    notes.sort((a, b) => b.name.localeCompare(a.name)); // sort descending
    const latest = notes[0];
    await processFile(latest, 'entities/watchlist-notes/main/current/meta.json');
    // Delete older notes
    for (let i = 1; i < notes.length; i++) {
      console.log(`Deleting old legacy note file: ${notes[i].driveRel}`);
      await drive.files.delete({ fileId: notes[i].id });
    }
  }

  // Cleanup temp directory
  if (fs.existsSync(tempDir)) {
    fs.rmdirSync(tempDir);
  }

  console.log('Drive migration complete.');
}

main().catch(console.error);
