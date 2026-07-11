require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { fetchDocuments } = require('./src/fetchers/documentsFetcher');
(async () => {
  try {
    const res = await fetchDocuments('NSE:HSCL', { types: ['Result','Transcript','PPT'], lastN: 20, listOnly: true });
    console.log(JSON.stringify(res.matched.map(d => ({date: d.date, type: d.documentType, ssUrl: d.ssUrl})), null, 2));
  } catch (e) {
    console.error('ERR', e.message);
    console.error(e.stack);
  }
})();
