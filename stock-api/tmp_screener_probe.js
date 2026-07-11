require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { ScreenerClient } = require('./src/clients/ScreenerClient');
const { parseScreenerInsights, detectAuthState } = require('./src/analyzers/screenerInsights');
(async () => {
  try {
    const client = new ScreenerClient();
    const resp = await client.companyPageWithFallback('HSCL');
    const auth = detectAuthState(resp);
    console.log('auth:', JSON.stringify(auth));
    const insights = parseScreenerInsights(resp);
    console.log(JSON.stringify(insights, null, 2));
  } catch (e) {
    console.error('ERR', e.message);
    console.error(e.stack);
  }
})();
