const { loadEnv } = require('../lib/env');
loadEnv();
const { createDriveClient } = require('@stock/cloud-utils/src/googleDriveApi');
(async () => {
  const t0 = Date.now();
  const { drive } = createDriveClient();
  console.log('client created', Date.now() - t0, 'ms');
  try {
    const res = await drive.files.list({
      q: "name = 'StockMarket' and trashed = false",
      fields: 'files(id,name)',
      pageSize: 5,
    });
    console.log('got response', Date.now() - t0, 'ms', JSON.stringify(res.data).slice(0, 300));
  } catch (e) {
    console.log('ERR', e.message, Date.now() - t0, 'ms');
  }
})();
