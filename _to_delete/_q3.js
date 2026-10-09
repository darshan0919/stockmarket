const { stockscans } = require('@stock/api');
(async () => {
  const id = '9493efc2c969d602c5dedbe2';
  const scan = await stockscans.getScanMetadata(id);
  const r = await stockscans.runScan(
    {
      ratiosType: 'Ratios',
      timePeriod: 'Latest',
      scan,
      watchlistIds: [],
      order: 'desc',
      orderBy: 'Market Capitalization',
      offset: 0,
    },
    id
  );
  console.log('total', r.total, 'end', r.end, 'tablekeys', Object.keys(r.table || {}).slice(0, 3));
  console.log(JSON.stringify(r.table).slice(0, 900));
  // try other filters
  const tests = {
    ma: [{ left: 'Close Price', sign: '>', right: 'EMA 10D' }],
    rs: [{ left: 'RS Rating', sign: '>', right: '90' }],
    rs2: [{ left: 'Relative Strength', sign: '>', right: '90' }],
    ondate: [{ left: '52WH Distance', sign: '<', right: '20' }],
  };
  for (const [k, f] of Object.entries(tests)) {
    try {
      const x = await stockscans.runScan(
        {
          ratiosType: 'Ratios',
          timePeriod: 'Latest',
          scan: { ...scan, filters: f },
          watchlistIds: [],
          order: 'desc',
          orderBy: 'Market Capitalization',
          offset: 0,
        },
        id
      );
      console.log(k, 'OK total', x.total, x.status, x.message || '');
    } catch (e) {
      console.log(k, 'ERR', e.response && JSON.stringify(e.response.data).slice(0, 200));
    }
  }
  try {
    const md = await stockscans.scanMetadata();
    console.log('META', JSON.stringify(md).slice(0, 3000));
  } catch (e) {
    console.log('metaerr', e.message);
  }
})().catch((e) => console.log('ERR', e.message));
