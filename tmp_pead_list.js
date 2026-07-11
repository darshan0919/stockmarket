require('dotenv').config();
const { fetchDocuments } = require('./stock-api/src/fetchers/documentsFetcher.js');
(async () => {
  const r = await fetchDocuments('NSE:GRANULES', { types: ['Transcript','PPT','Result'], lastN: 4, listOnly: true });
  console.log(JSON.stringify(r.matched.map(d=>({type:d.documentType,date:d.date,ssUrl:d.ssUrl})), null, 2));
})().catch(e=>{console.error('ERR',e.message); process.exit(1);});
