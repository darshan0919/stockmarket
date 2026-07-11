require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { fetchAnnouncements } = require('./src/fetchers/announcementsFetcher');
(async () => {
  try {
    const res = await fetchAnnouncements('NSE:HSCL', {
      search: ['press release','order','commissioning','commencement','capacity','expansion','anode','carbon','plant','SEZ','battery'],
      start: '20250101', end: '20260710', maxPages: 15, maxResults: 80, listOnly: true
    });
    console.log(JSON.stringify(res.matched.map(a=>({date:a.date,title:a.title})), null, 2));
  } catch (e) {
    console.error('ERR', e.message); console.error(e.stack);
  }
})();
