'use strict';

const { render } = require('../monthlyUpdates/renderApp');
const { buildDigestHtml } = require('../monthlyUpdates/notify');

describe('monthlyUpdates recency and date features', () => {
  const mockDto = {
    summary: {
      companies: 2,
      companiesWith12m: 1,
      filingsParsed: 4,
      latestPeriod: '2026-08',
      units: ['units', 'Rs cr'],
    },
    companies: [
      {
        companyId: 'NSE:FORCEMOT',
        name: 'Force Motors',
        unit: 'units',
        latestValue: 3802,
        latestPeriod: '2026-08',
        latestFiledOn: '2026-09-01',
        momPct: 0.85,
        qoqPct: 15.2,
        yoyPct: 58.22,
        months: 11,
        isMonthly: true,
        confidence: 'high',
        periodType: 'month-flow',
        series: [{ period: '2026-08', value: 3802, ssUrl: 'abc123doc' }],
      },
      {
        companyId: 'NSE:V2RETAIL',
        name: 'V2 Retail',
        unit: 'Rs cr',
        latestValue: 997,
        latestPeriod: '2026-06',
        latestFiledOn: '2026-07-02',
        momPct: null,
        qoqPct: 24.94,
        yoyPct: 58.25,
        months: 5,
        isMonthly: false,
        confidence: 'high',
        periodType: 'quarter-flow',
        series: [{ period: '2026-06', value: 997, ssUrl: 'xyz789doc' }],
      },
    ],
  };

  test('renderApp includes Last Update column and recency sort control', () => {
    const html = render(mockDto);
    expect(html).toContain('data-k="latestFiledOn"');
    expect(html).toContain('Last Update');
    expect(html).toContain('id="sortby"');
    expect(html).toContain('value="latestFiledOn"');
    expect(html).toContain('2026-09-01');
    expect(html).toContain('2026-07-02');
  });

  test('notify buildDigestHtml renders Last Update date in mover tables and recent updates section', () => {
    const emailHtml = buildDigestHtml(mockDto);
    expect(emailHtml).toContain('Last Update');
    expect(emailHtml).toContain('5. Latest Company Updates (Sorted by Recency)');
    expect(emailHtml).toContain('2026-09-01');
    expect(emailHtml).toContain('2026-07-02');
    expect(emailHtml).toContain('https://www.stockscans.in/company/NSE:FORCEMOT');
  });

  test('extractMonthlyUpdates retains non-cohort days and filters noise keywords', async () => {
    const { extractMonthlyUpdates } = require('../monthlyUpdates/fetchUpdates');
    const mockClient = {
      scanAnnouncements: jest.fn().mockResolvedValue({
        announcements: [
          {
            companyId: 'NSE:INFY',
            title: 'Notice of AGM',
            description: 'Annual general meeting details',
            date: '2026-09-01',
            ssUrl: 'agm1',
          },
          {
            companyId: 'NSE:TCS',
            title: 'Investor Presentation Q1',
            description: 'Presentation for analysts',
            date: '2026-09-02',
            ssUrl: 'ppt1',
          },
          {
            companyId: 'NSE:ASHOKLEY',
            title: 'Monthly Business Update - August 2026',
            description: 'Commercial vehicle sales volume',
            date: '2026-09-14', // Day 14 (outside day 1-3 cohort)
            ssUrl: 'sales1',
          },
        ],
      }),
      fetchPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 test')),
      s3PdfUrl: (url) => `https://s3.example.com/${url}`,
    };

    const res = await extractMonthlyUpdates(mockClient, {
      quarters: ['202609'],
      months: 1,
    });

    // AGM and Investor Presentation should be dropped by noise filter
    expect(res.stats.noiseFiltered).toBe(2);
    // Sales update filed on day 14 should be kept (reporting day cohort filter removed)
    expect(res.announcements.length).toBe(1);
    expect(res.announcements[0].companyId).toBe('NSE:ASHOKLEY');
  });

  test('renderApp renders Executive Overview tab and elements', () => {
    const html = render(mockDto);
    expect(html).toContain('data-p="p0"');
    expect(html).toContain('Executive Overview');
    expect(html).toContain('id="yoy-list"');
    expect(html).toContain('id="qoq-list"');
    expect(html).toContain('id="consistent-list"');
    expect(html).toContain('id="recent-list"');
    expect(html).toContain('Institutional Signal Assessment — Signal vs. Noise');
  });

  test('scanQuarter caching stores and reuses results for closed quarters', async () => {
    const fs = require('fs');
    const {
      getFilterHash,
      writeScanCache,
      readScanCache,
      isClosedQuarter,
      scanCacheFile,
    } = require('../monthlyUpdates/fetchUpdates');

    const filtersA = ['Business Update', 'Monthly Sales'];
    const filtersB = ['Business Update', 'Quarterly Update'];
    const hashA = getFilterHash(filtersA);
    const hashB = getFilterHash(filtersB);

    expect(hashA).not.toBe(hashB);
    expect(isClosedQuarter('202403')).toBe(true);

    const testQuarter = '202306';
    const dummyItems = [{ ssUrl: 'dummy1', title: 'Test 1' }];

    writeScanCache(testQuarter, hashA, dummyItems);
    const cached = readScanCache(testQuarter, hashA);
    expect(cached).toEqual(dummyItems);

    // Filter mismatch should return null
    expect(readScanCache(testQuarter, hashB)).toBeNull();

    // Clean up
    const file = scanCacheFile(testQuarter, hashA);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });
});
