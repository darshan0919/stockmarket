require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { fetchDocuments } = require('./src/fetchers/documentsFetcher');
(async () => {
  try {
    const res = await fetchDocuments('NSE:M&MFIN', { types: ['Transcript','PPT'], lastN: 1, listOnly: true });
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error('ERR', e.message);
  }
})();
