require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { fetchDocuments } = require('./src/fetchers/documentsFetcher');
(async () => {
  const res = await fetchDocuments('NSE:JSFB', { types: ['Transcript','PPT','Result'], lastN: 4, outputDir: '/tmp/pead/JSFB_docs' });
  console.log((res.fetched||[]).map(d=>d.documentType+':'+d.date).join(', '));
  console.log('skipped:', JSON.stringify(res.skipped));
})();
