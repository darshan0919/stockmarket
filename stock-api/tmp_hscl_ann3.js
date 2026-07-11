require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { stockscans } = require('./src/index');
(async () => {
  try {
    const data = await stockscans.companyAnnouncements({
      companyIds: ['NSE:HSCL'],
      offset: 0,
      keywords: [],
      quarterDate: '202603',
      allTime: true,
      announcementType: 'All',
      searchMode: 'full'
    }, { referer: 'https://www.stockscans.in/company/NSE%3AHSCL' });
    console.log(JSON.stringify(data).slice(0, 1500));
  } catch (e) {
    console.error('ERR', e.message);
    if (e.response) console.error('DATA:', JSON.stringify(e.response.data));
  }
})();
