const { stockscans } = require('@stock/api');
(async () => {
  const md = await stockscans.scanMetadata();
  for (const [k, v] of Object.entries(md))
    console.log(
      k,
      Array.isArray(v) ? v.length : typeof v,
      Array.isArray(v) && k !== 'indexList' ? JSON.stringify(v).slice(0, 1800) : ''
    );
})().catch((e) => console.log('ERR', e.message));
