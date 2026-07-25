const { bseGetJson } = require('./packages/stock-api/src/http/bseHttp.js');

async function test() {
  try {
    const bseBM = await bseGetJson('BoardMeeting/w', {
      params: { scripcode: '', FDate: '01/07/2026', TDate: '30/07/2026' },
    });
    console.log('BSE BM keys:', Object.keys(bseBM || {}));
    if (bseBM && bseBM.Table) {
      console.log('BSE BM sample:', JSON.stringify(bseBM.Table[0], null, 2));
    }
  } catch (e) {
    console.log(`Failed BSE BM:`, e.message);
  }
}

test();
