const { stockscans } = require('@stock/api');
(async () => {
  const id = '9493efc2c969d602c5dedbe2';
  const m = await stockscans.getScanMetadata(id);
  console.log(JSON.stringify(m, null, 1).slice(0, 4000));
  const r = await stockscans.runScan(
    { filters: m.filters, index: m.index, industry: m.industry, offset: 0 },
    id
  );
  console.log('KEYS', Object.keys(r), 'total', r.total || r.count || (r.data && r.data.length));
  console.log(JSON.stringify(r).slice(0, 1500));
})().catch((e) => console.log('ERR', e.message));
