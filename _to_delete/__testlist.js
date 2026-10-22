const { loadEnv } = require('./lib/env');
loadEnv();
const { createDriveClient, listAllFiles } = require('@stock/cloud-utils/src/googleDriveApi');
const DRIVE_ROOT = process.env.DATA_V2_DRIVE_ROOT || 'StockMarket/data/v2';
(async () => {
  const t0 = Date.now();
  const { drive } = createDriveClient();
  console.log('client created', Date.now() - t0, 'ms');
  const t1 = Date.now();
  const files = await listAllFiles(drive, DRIVE_ROOT);
  console.log('listAllFiles done', Date.now() - t1, 'ms, count=', files.length);
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
