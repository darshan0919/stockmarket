const { nse } = require('@stock/api');
const {
  loadEnv,
} = require('/sessions/rcw-016hgvwbkp28ew2gquxzmswl/mnt/stockmarket/packages/jobs-runtime/lib/env');
(async () => {
  loadEnv('../../.env');
  for (const [f, t] of [
    ['01-10-2026', '09-10-2026'],
    ['09-09-2026', '09-10-2026'],
    ['26-08-2026', '09-10-2026'],
  ]) {
    const b = await nse.getHistoricalBulkDeals(f, t),
      k = await nse.getHistoricalBlockDeals(f, t);
    const dts = (a) => [...new Set(a.map((r) => r.BD_DT_DATE))].slice(0, 12);
    console.log(f, t, 'bulk', b.length, dts(b).join(','), '| block', k.length, dts(k).join(','));
  }
})().catch((e) => console.log('ERR', e.message));
