// scripts/migrate-deals-digest.js
'use strict';

const fs = require('fs');
const path = require('path');
const { loadEnv } = require('../../packages/jobs-runtime/lib/env');
const { StorageService } = require('@stock/cloud-utils');

async function main() {
  loadEnv(path.join(__dirname, '../.env'));
  
  const legacyDir = path.join(__dirname, '../jobs/data/deals_digest');
  if (!fs.existsSync(legacyDir)) {
    console.log(`Legacy directory ${legacyDir} does not exist. Nothing to migrate.`);
    return;
  }

  const files = fs.readdirSync(legacyDir);
  console.log(`Found ${files.length} files in legacy directory.`);

  StorageService.init();

  for (const file of files) {
    if (!file.endsWith('_deals.json')) continue;
    
    // Filename format: DD-MM-YYYY_deals.json (produced by fmt(target, '-'))
    const dateStr = file.replace('_deals.json', '');
    const parts = dateStr.split('-');
    if (parts.length !== 3) continue;
    
    const day = parts[0];
    const month = parts[1];
    const year = parts[2];
    
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (isNaN(date.getTime())) {
      console.warn(`Invalid date format for file: ${file}`);
      continue;
    }

    const legacyFilePath = path.join(legacyDir, file);
    try {
      const digest = JSON.parse(fs.readFileSync(legacyFilePath, 'utf8'));
      
      // Calculate new DTO paths
      const dtoPaths = StorageService.getEventDtoPaths('digest', date, 'documents/deals_digest');
      digest.assets = dtoPaths.assetsMap;
      
      console.log(`Migrating ${file} -> ${dtoPaths.jsonPath}`);
      // Save locally and sync to Drive
      await StorageService.saveJson(dtoPaths.jsonPath, digest, true); // sync = true to await upload
      
      // Cleanup legacy file
      fs.unlinkSync(legacyFilePath);
    } catch (err) {
      console.error(`Failed to migrate ${file}:`, err.message);
    }
  }

  // Cleanup empty legacy directory
  if (fs.readdirSync(legacyDir).length === 0) {
    fs.rmdirSync(legacyDir);
    console.log('Removed empty legacy deals_digest directory.');
  }

  console.log('Migration complete.');
}

main().catch(console.error);
