const { loadEnv } = require('./packages/jobs-runtime/lib/env');
loadEnv();
const { fetchDocuments } = require('./stock-api/src/fetchers/documentsFetcher');
const tickers = process.argv.slice(2);
(async () => {
  for (const t of tickers) {
    try {
      const r = await fetchDocuments(t, {
        types: ['Transcript', 'Result', 'PPT'],
        lastN: 4,
        listOnly: true,
      });
      console.log('===', t, '===');
      console.log(
        JSON.stringify(
          r.matched.map((d) => ({ type: d.documentType, date: d.date, ssUrl: d.ssUrl })),
          null,
          0
        )
      );
    } catch (e) {
      console.log('===', t, 'ERROR', e.message);
    }
  }
})();
