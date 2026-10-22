const { loadEnv } = require('../lib/env');
loadEnv();
const { createDriveClient, listAllFiles } = require('@stock/cloud-utils/src/googleDriveApi');
(async () => {
  const t0 = Date.now();
  const { drive } = createDriveClient();
  console.log('client created', Date.now() - t0, 'ms');
  const files = await listAllFiles(drive, 'StockMarket/data/v2');
  console.log('listed', files.length, 'files in', Date.now() - t0, 'ms');
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
