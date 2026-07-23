const { fetchDocuments } = require('./src/fetchers/documentsFetcher.js');
(async () => {
  try {
    const res = await fetchDocuments('NSE:E2E', { types: ['PPT'], lastN: 2, outputDir: '/tmp/E2E_diff_docs' });
    console.log(JSON.stringify(res.manifest || res, null, 2));
  } catch (e) {
    console.error('ERR', e);
  }
})();
