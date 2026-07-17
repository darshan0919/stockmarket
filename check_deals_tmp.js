const { nse, bse } = require('@stock/api');

(async () => {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2,'0');
  const mm = String(today.getMonth()+1).padStart(2,'0');
  const yyyy = today.getFullYear();
  const nseDate = `${dd}-${mm}-${yyyy}`;
  const bseDate = `${dd}/${mm}/${yyyy}`;

  try {
    const nseLarge = await nse.getLargeDeals();
    const bulk = (nseLarge.BULK_DEALS_DATA||[]).filter(r => JSON.stringify(r).toUpperCase().includes('LASER'));
    const block = (nseLarge.BLOCK_DEALS_DATA||[]).filter(r => JSON.stringify(r).toUpperCase().includes('LASER'));
    console.log('NSE BULK matches:', JSON.stringify(bulk, null, 2));
    console.log('NSE BLOCK matches:', JSON.stringify(block, null, 2));
  } catch (e) {
    console.log('NSE error:', e.message);
  }

  try {
    const bseBulk = await bse.getBulkBlockDeals('bulk', bseDate, bseDate);
    const bseBlock = await bse.getBulkBlockDeals('block', bseDate, bseDate);
    const bBulk = bseBulk.filter(r => JSON.stringify(r).toUpperCase().includes('LASER'));
    const bBlock = bseBlock.filter(r => JSON.stringify(r).toUpperCase().includes('LASER'));
    console.log('BSE BULK matches:', JSON.stringify(bBulk, null, 2));
    console.log('BSE BLOCK matches:', JSON.stringify(bBlock, null, 2));
  } catch (e) {
    console.log('BSE error:', e.message);
  }
})();
