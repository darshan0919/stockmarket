require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { stockscans } = require('./src/index');
(async () => {
  try {
    const data = await stockscans.companyAnnouncements({ companyIds: ['NSE:HSCL'], offset: 0 }, { referer: 'https://www.stockscans.in/company/NSE%3AHSCL' });
    console.log(JSON.stringify(data, null, 2).slice(0, 2000));
  } catch (e) {
    console.error('ERR', e.message);
    if (e.response) console.error('DATA:', JSON.stringify(e.response.data));
  }
})();
