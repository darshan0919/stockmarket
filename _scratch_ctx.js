const { loadEnv } = require('./packages/jobs-runtime/lib/env');
loadEnv();
const { buildCompanyContext } = require('./packages/jobs-runtime/lib/companyContext');
const tickers = process.argv.slice(2);
(async () => {
  for (const t of tickers) {
    try {
      const ctx = await buildCompanyContext(t, { stockscans: true });
      const gc = ctx.stockscans && ctx.stockscans.growthCatalysts;
      const asOf = ctx.stockscans && ctx.stockscans.growthCatalystsAsOf;
      const cn = ctx.stockscans && ctx.stockscans.concallNotes;
      const cnQ = ctx.stockscans && ctx.stockscans.concallNotesQuarter;
      console.log('===', t, '===');
      console.log('growthCatalystsAsOf:', asOf);
      console.log('growthCatalysts:', gc ? JSON.stringify(gc).slice(0, 1200) : null);
      console.log('concallNotesQuarter:', cnQ);
      console.log('concallNotes:', cn ? JSON.stringify(cn).slice(0, 800) : null);
    } catch (e) {
      console.log('===', t, 'ERROR', e.message);
    }
  }
})();
