require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { resolveUniverse } = require('./src/analyzers/runScan');
(async () => {
  try {
    const universe = await resolveUniverse('https://www.stockscans.in/scans/saved/429918e3098ce660baec9f22', {
      jsonOut: '/tmp/pead_universe.json'
    });
    console.log('scanName:', universe.scanName);
    console.log('raw_total:', universe.raw_total);
    console.log('liquid companies:', universe.companies.length);
    console.log('excluded illiquid:', universe.excluded_illiquid.length);
    console.log(universe.companies.slice(0,5).map(c=>c.companyId || c['Symbol'] || Object.keys(c)));
  } catch (e) {
    console.error('ERR', e.message);
    console.error(e.stack);
  }
})();
