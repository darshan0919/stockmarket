// scripts/migrate-drive-deals-digest.js
'use strict';

const fs = require('fs');
const path = require('path');
const { loadEnv } = require('../../packages/jobs-runtime/lib/env');
const { StorageService, ...driveApi } = require('@stock/cloud-utils');

async function main() {
  loadEnv(path.join(__dirname, '../.env'));

  if (!driveApi.isApiConfigured()) {
    console.error('Google Drive API is not configured. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.');
    return;
  }

  const { drive } = driveApi.createDriveClient();
  const rootPath = process.env.COWORK_DRIVE_PATH || driveApi.DEFAULT_ROOT_PATH;

  console.log(`Listing files under Drive root: ${rootPath}...`);
  const allFiles = await driveApi.listAllFiles(drive, rootPath);
  
  // Find legacy deals digest files (e.g. deals_digest/DD-MM-YYYY_deals.json or similar)
  const legacyFiles = allFiles.filter(f => 
    f.driveRel.includes('deals_digest') && f.name.endsWith('.json') && !f.driveRel.includes('documents/')
  );

  console.log(`Found ${legacyFiles.length} legacy deals digest files on Drive.`);
  if (legacyFiles.length === 0) {
    console.log('No legacy files found on Drive to migrate.');
    return;
  }

  StorageService.init();
  const tempDir = path.join(__dirname, '../temp_migration');
  fs.mkdirSync(tempDir, { recursive: true });

  for (const file of legacyFiles) {
    console.log(`Processing remote file: ${file.driveRel} (ID: ${file.id})`);
    
    // Download to a temp local file
    const tempLocalPath = path.join(tempDir, file.name);
    try {
      await driveApi.downloadFile(drive, rootPath, file.driveRel, tempLocalPath);
      
      // Parse date from filename
      // Filename format: DD-MM-YYYY_deals.json
      const dateStr = file.name.replace('_deals.json', '');
      const parts = dateStr.split('-');
      if (parts.length !== 3) {
        console.warn(`Skipping file with unexpected name format: ${file.name}`);
        continue;
      }
      
      const day = parts[0];
      const month = parts[1];
      const year = parts[2];
      const date = new Date(Number(year), Number(month) - 1, Number(day));
      if (isNaN(date.getTime())) {
        console.warn(`Invalid date parsed for file: ${file.name}`);
        continue;
      }

      const digest = JSON.parse(fs.readFileSync(tempLocalPath, 'utf8'));
      
      // Get new paths
      const dtoPaths = StorageService.getEventDtoPaths('digest', date, 'documents/deals_digest');
      digest.assets = dtoPaths.assetsMap;
      
      console.log(`Uploading migrated content to: ${dtoPaths.jsonPath}`);
      // Save locally and sync/upload to Drive (await the upload)
      await StorageService.saveJson(dtoPaths.jsonPath, digest, true);

      // Clean up the old file on Google Drive
      console.log(`Deleting legacy file from Drive: ${file.driveRel}`);
      await drive.files.delete({ fileId: file.id });
      
      // Clean up temp local file
      fs.unlinkSync(tempLocalPath);
      
      console.log(`Successfully migrated ${file.name}\n`);
    } catch (err) {
      console.error(`Failed to migrate ${file.name}:`, err.message);
    }
  }

  // Cleanup temp directory
  if (fs.existsSync(tempDir)) {
    fs.rmdirSync(tempDir);
  }

  console.log('Drive migration complete.');
}

main().catch(console.error);
