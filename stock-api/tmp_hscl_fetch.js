require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { fetchDocuments } = require('./src/fetchers/documentsFetcher');
(async () => {
  try {
    const res = await fetchDocuments('NSE:HSCL', { types: ['Transcript','PPT','Result'], lastN: 4, outputDir: '/sessions/youthful-zealous-clarke/mnt/outputs/pead_docs' });
    console.log(JSON.stringify(res.fetched.map(d=>({date:d.date,type:d.documentType,filename:d.filename,size:d.size_bytes})), null, 2));
    console.log('skipped:', JSON.stringify(res.skipped));
  } catch (e) {
    console.error('ERR', e.message);
    console.error(e.stack);
  }
})();
