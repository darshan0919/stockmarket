require('dotenv').config();
const { createDriveClient, DEFAULT_ROOT_PATH } = require('@stock/cloud-utils');

async function cleanupDrive() {
  try {
    const { drive } = createDriveClient();
    console.log('Connected to Google Drive API.');

    // 1. Find the StockMarket/jobs/v1/market-data/nse-delivery folder
    // Since 'nse-delivery' is likely uniquely named, we can search directly for it,
    // but to be safe we'll find 'market-data' first.
    
    console.log('Searching for nse-delivery folder...');
    const res = await drive.files.list({
      q: "name = 'nse-delivery' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: 'files(id, name, parents)',
    });

    const files = res.data.files;
    if (!files || files.length === 0) {
      console.log('Could not find nse-delivery folder. It may have already been deleted.');
      return;
    }

    // If there are multiple, delete all of them (assuming they are all the caches)
    for (const folder of files) {
      console.log(`Deleting folder ID: ${folder.id} (${folder.name})`);
      await drive.files.delete({ fileId: folder.id });
      console.log(`Successfully deleted folder ID: ${folder.id}`);
    }

    console.log('Cleanup complete!');
  } catch (error) {
    console.error('Error cleaning up Drive:', error.message);
  }
}

cleanupDrive();
