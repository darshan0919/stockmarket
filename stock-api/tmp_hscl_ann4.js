require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { stockscans } = require('./src/index');
const variants = [
  { companyId: 'NSE:HSCL', offset: 0 },
  { companyIds: ['NSE:HSCL'], offset: 0, limit: 30 },
  { companyIds: ['NSE:HSCL'], page: 0 },
  { ticker: 'NSE:HSCL', offset: 0 },
];
(async () => {
  for (const payload of variants) {
    try {
      const data = await stockscans.companyAnnouncements(payload, { referer: 'https://www.stockscans.in/company/NSE%3AHSCL' });
      console.log('SUCCESS', JSON.stringify(payload), JSON.stringify(data).slice(0,300));
    } catch (e) {
      console.log('FAIL', JSON.stringify(payload), e.response ? JSON.stringify(e.response.data) : e.message);
    }
  }
})();
