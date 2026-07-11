require('dotenv').config();
const { fetchDocuments } = require('./stock-api/src/fetchers/documentsFetcher.js');
(async () => {
  const r = await fetchDocuments('NSE:GRANULES', { types: ['Transcript','PPT','Result'], lastN: 3, outputDir: '/tmp/granules_docs' });
  console.log(JSON.stringify(r.fetched.map(d=>({type:d.documentType,date:d.date,path:d.path})), null, 2));
  console.log('SKIPPED', JSON.stringify(r.skipped));
})().catch(e=>{console.error('ERR',e.message); process.exit(1);});
