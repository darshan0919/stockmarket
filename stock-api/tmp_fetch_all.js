require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { fetchDocuments } = require('./src/fetchers/documentsFetcher');
const tickers = ['NSE:M&MFIN','NSE:POONAWALLA','NSE:ITCHOTELS','NSE:ANGELONE','NSE:TATATECH','NSE:KARURVYSYA','NSE:SHYAMMETL','NSE:CARBORUNIV'];
(async () => {
  for (const t of tickers) {
    const safe = t.replace(/[:&]/g, '_');
    try {
      const res = await fetchDocuments(t, { types: ['Transcript','PPT'], lastN: 1, outputDir: `/tmp/pead/${safe}_docs` });
      console.log(t, '->', (res.documents||[]).map(d=>d.documentType+':'+d.date).join(', '), '| skipped:', (res.skipped||[]).length);
    } catch (e) {
      console.log(t, 'ERR', e.message);
    }
  }
})();
