require('./lib/env').loadEnv();
const { createDriveClient, isApiConfigured } = require('@stock/cloud-utils/src/googleDriveApi');
console.log('configured:', isApiConfigured ? isApiConfigured() : 'n/a');
const t0 = Date.now();
try {
  const { drive } = createDriveClient();
  console.log('client created in', Date.now() - t0, 'ms');
  drive.files
    .list({ pageSize: 1 })
    .then((r) => {
      console.log('list ok in', Date.now() - t0, 'ms, files:', r.data.files.length);
    })
    .catch((e) => console.error('list ERR', Date.now() - t0, 'ms', e.message));
} catch (e) {
  console.error('createDriveClient ERR', e.message);
}
