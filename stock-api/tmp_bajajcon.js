require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { fetchDocuments } = require('./src/fetchers/documentsFetcher');
(async () => {
  const res = await fetchDocuments('NSE:BAJAJCON', { types: ['Transcript','PPT'], lastN: 4, outputDir: '/tmp/pead/BAJAJCON_docs' });
  console.log((res.fetched||[]).map(d=>d.documentType+':'+d.date).join(', '));
  console.log('skipped:', JSON.stringify(res.skipped));
})();
