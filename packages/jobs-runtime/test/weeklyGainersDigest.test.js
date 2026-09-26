'use strict';

const {
  topGainersTableHtml,
  tableHtml,
  makeLink,
  scanSourceHtml,
} = require('../weeklyGainersDigest');

describe('weeklyGainersDigest helpers', () => {
  describe('topGainersTableHtml', () => {
    test('returns empty string if gainers array is empty or null', () => {
      expect(topGainersTableHtml([])).toBe('');
      expect(topGainersTableHtml(null)).toBe('');
      expect(topGainersTableHtml(undefined)).toBe('');
    });

    test('renders top gainers table with linkified company names, returns, and mcap', () => {
      const mockGainers = [
        {
          companyId: 'NSE:TIRUPATIFL',
          name: 'Tirupati Forge Ltd',
          returns1W: 22.67,
          mcap: 1028.62,
          sector: 'Castings, Forgings & Fastners',
          industry: 'Castings, Forgings & Fastners',
        },
        {
          companyId: 'NSE:CARBORUNIV',
          name: 'Carborundum Universal Ltd',
          returns1W: -2.5,
          mcap: 25081.94,
          sector: 'Capital Goods-Non Electrical Equipment',
          industry: 'Abrasives & Grinding Wheels',
        },
        {
          companyId: 'NSE:NODATA',
          name: 'No Data Co',
          returns1W: null,
          mcap: null,
          sector: null,
          industry: null,
        },
      ];

      const html = topGainersTableHtml(mockGainers);

      // Table structure
      expect(html).toContain('Top 50 Weekly Gainers');
      expect(html).toContain('<table');
      expect(html).toContain('Company');
      expect(html).toContain('1W Return');
      expect(html).toContain('Market Cap (₹ Cr)');
      expect(html).toContain('Sector');

      // Linkified company name
      expect(html).toContain('https://www.stockscans.in/company/NSE:TIRUPATIFL');
      expect(html).toContain('Tirupati Forge Ltd');

      // Returns formatted
      expect(html).toContain('+22.67%');
      expect(html).toContain('#2e7d32'); // Green for positive
      expect(html).toContain('-2.50%');
      expect(html).toContain('#c62828'); // Red for negative

      // Market Cap formatted
      expect(html).toContain('1,029'); // 1028.62 rounded with comma
      expect(html).toContain('25,082');

      // Sector / Industry fallback
      expect(html).toContain('Castings, Forgings & Fastners');
      expect(html).toContain('Capital Goods-Non Electrical Equipment');

      // Null handling
      expect(html).toContain('No Data Co');
      expect(html).toContain('-');
    });
  });

  describe('makeLink', () => {
    test('creates industry link', () => {
      const link = makeLink('Pharma - API & CRAMS', 'industry');
      expect(link).toContain('https://www.stockscans.in/scans/new?industry=Pharma');
      expect(link).toContain('Pharma - API & CRAMS');
    });

    test('creates sector link', () => {
      const link = makeLink('Steel', 'sector');
      expect(link).toContain('https://www.stockscans.in/scans/new?sector=Steel');
      expect(link).toContain('Steel');
    });
  });

  describe('tableHtml', () => {
    test('renders count table with streaks', () => {
      const counts = [{ name: 'Steel', count: 15 }];
      const streakMap = { Steel: 3 };
      const streakScoreMap = { Steel: 45 };
      const html = tableHtml('Sector vs Count', counts, streakMap, streakScoreMap, 'sector');
      expect(html).toContain('Sector vs Count');
      expect(html).toContain('Steel');
      expect(html).toContain('15');
      expect(html).toContain('3');
      expect(html).toContain('45');
    });
  });

  describe('scanSourceHtml', () => {
    test('renders source link and filters', () => {
      const scan = {
        scanId: '2fe3e39accd614d970a335bc',
        scanName: 'Weekly Gainers',
        filters: [{ left: 'Returns 1W', sign: '>=', right: '3' }],
      };
      const html = scanSourceHtml(scan);
      expect(html).toContain('https://www.stockscans.in/scans/saved/2fe3e39accd614d970a335bc');
      expect(html).toContain('Weekly Gainers');
      expect(html).toContain('Returns 1W >= 3');
    });
  });
});
