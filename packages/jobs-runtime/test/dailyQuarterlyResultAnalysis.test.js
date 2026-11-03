'use strict';

const {
  formatMarketCap,
  formatPct,
  fetchScan,
  sendEmptyScanEmail,
  sendReportEmail,
  pushJobAssets,
  analyzeScanCompanies,
  resolveSlot,
  loadCursor,
  saveCursor,
  isCompanyProcessed,
  markCompanyProcessed,
  getCombinedMorningCompanies,
  SCAN_ID,
} = require('../dailyQuarterlyResultAnalysis');

jest.mock('@stock/api', () => ({
  stockscans: {
    getScanMetadata: jest.fn(),
    runScan: jest.fn(),
    setJobName: jest.fn(),
  },
}));

jest.mock('@stock/cloud-utils', () => {
  const actual = jest.requireActual('@stock/cloud-utils');
  return {
    ...actual,
    sendHtmlEmail: jest.fn(),
  };
});

jest.mock('../lib/db', () => ({
  dataRoot: jest.fn(() => '/tmp/mock-data-root'),
  resolveDriveUrl: jest.fn((rel) =>
    rel ? `https://drive.google.com/file/d/mockDriveId/view` : null
  ),
  touchedFiles: jest.fn(() => []),
  trackTouched: jest.fn(),
}));

jest.mock('../scripts/batchQuarterlyResultAnalysis', () => ({
  processCompany: jest.fn(),
}));

jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

const { stockscans } = require('@stock/api');
const { sendHtmlEmail } = require('@stock/cloud-utils');
const dataScript = require('../scripts/data');
const fs = require('fs');

describe('dailyQuarterlyResultAnalysis formatting helpers', () => {
  test('formatMarketCap formats positive amounts and handles null/empty', () => {
    expect(formatMarketCap(4086.04)).toBe('₹4,086 Cr');
    expect(formatMarketCap(25527.62)).toBe('₹25,528 Cr');
    expect(formatMarketCap(null)).toBe('—');
    expect(formatMarketCap('')).toBe('—');
  });

  test('formatPct formats positive, negative and zero percentages with sign', () => {
    expect(formatPct(103.52)).toBe('+103.5%');
    expect(formatPct(-12.64)).toBe('-12.6%');
    expect(formatPct(0)).toBe('0.0%');
    expect(formatPct(null)).toBe('—');
  });
});

describe('fetchScan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('paginates scan results to completion and maps columns in order', () => {
    stockscans.getScanMetadata.mockResolvedValueOnce({
      scanId: SCAN_ID,
      scanName: 'Quality Result - DND',
      watchlistIds: [],
    });

    // Page 1 with 2 rows, total = 3
    stockscans.runScan.mockResolvedValueOnce({
      total: 3,
      table: [
        [
          'companyId',
          'Name',
          'Market Capitalization',
          'PAT Growth YoY',
          'Revenue Growth YoY',
          'PAT Growth TTM',
        ],
        ['NSE:SWSOLAR', 'Sterling & Wilson', 4086.04, 103.52, -12.64, 158.14],
        ['NSE:IIFL', 'IIFL Finance', 25527.62, 92.61, 28.48, 157.78],
      ],
    });

    // Page 2 with 1 row, total = 3
    stockscans.runScan.mockResolvedValueOnce({
      total: 3,
      table: [
        [
          'companyId',
          'Name',
          'Market Capitalization',
          'PAT Growth YoY',
          'Revenue Growth YoY',
          'PAT Growth TTM',
        ],
        ['NSE:SBC', 'SBC Exports', 3057.62, 37.11, 94.01, 105.92],
      ],
    });

    jest.spyOn(fs, 'mkdirSync').mockReturnValue(true);
    jest.spyOn(fs, 'writeFileSync').mockReturnValue(true);

    return fetchScan({ date: '2026-10-16' }).then((res) => {
      expect(res.count).toBe(3);
      expect(res.companies[0].companyId).toBe('NSE:SWSOLAR');
      expect(res.companies[0].patTtm).toBe(158.14);
      expect(res.companies[1].companyId).toBe('NSE:IIFL');
      expect(res.companies[2].companyId).toBe('NSE:SBC');
      expect(stockscans.runScan).toHaveBeenCalledTimes(2);
    });
  });

  test('applies days filter when opts.days is provided', async () => {
    stockscans.getScanMetadata.mockResolvedValueOnce({
      scanId: SCAN_ID,
      scanName: 'Quality Result - DND',
      watchlistIds: [],
      filters: [{ left: 'Days From Result', sign: '=', right: '-1' }],
    });

    stockscans.runScan.mockResolvedValueOnce({
      total: 1,
      table: [
        [
          'companyId',
          'Name',
          'Market Capitalization',
          'PAT Growth YoY',
          'Revenue Growth YoY',
          'PAT Growth TTM',
        ],
        ['NSE:PVRINOX', 'PVR Inox Ltd', 14192.84, 149.38, 16.98, 1650],
      ],
    });

    jest.spyOn(fs, 'mkdirSync').mockReturnValue(true);
    jest.spyOn(fs, 'writeFileSync').mockReturnValue(true);

    const res = await fetchScan({ date: '2026-10-28', days: 0 });
    expect(res.count).toBe(1);
    expect(res.companies[0].companyId).toBe('NSE:PVRINOX');
    expect(stockscans.runScan).toHaveBeenCalledWith(
      expect.objectContaining({
        scan: expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({ left: 'Days From Result', right: '0' }),
          ]),
        }),
      }),
      SCAN_ID
    );
  });
});

describe('sendEmptyScanEmail', () => {
  test('sends email when zero companies in scan', async () => {
    sendHtmlEmail.mockResolvedValueOnce({ status: 'sent', to: 'test@example.com' });

    const res = await sendEmptyScanEmail({
      date: '2026-10-16',
      scanId: SCAN_ID,
      scanName: 'Quality Result - DND',
      count: 0,
    });

    expect(res.status).toBe('sent');
    expect(sendHtmlEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('0 companies in scan'),
        htmlBody: expect.stringContaining('Quality Result - DND'),
      })
    );
  });
});

describe('sendReportEmail', () => {
  test('generates table with required columns in original PAT Growth TTM order', async () => {
    sendHtmlEmail.mockResolvedValueOnce({ status: 'sent', to: 'test@example.com' });

    const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const readSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({
        date: '2026-10-16',
        scanId: SCAN_ID,
        scanName: 'Quality Result - DND',
        count: 2,
        companies: [
          {
            companyId: 'NSE:SWSOLAR',
            name: 'Sterling & Wilson Renewable Energy Ltd',
            marketCap: 4086.04,
            revenueYoY: -12.64,
            patYoY: 103.52,
            patTtm: 158.14,
          },
          {
            companyId: 'NSE:IIFL',
            name: 'IIFL Finance Ltd',
            marketCap: 25527.62,
            revenueYoY: 28.48,
            patYoY: 92.61,
            patTtm: 157.78,
          },
        ],
      })
    );

    const res = await sendReportEmail({ date: '2026-10-16' });

    expect(res.sent).toBe(true);
    expect(res.count).toBe(2);
    expect(sendHtmlEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('2 companies analyzed'),
        htmlBody: expect.stringMatching(/Sterling &amp; Wilson|Sterling & Wilson/),
      })
    );
    existsSpy.mockRestore();
    readSpy.mockRestore();
  });
});

describe('pushJobAssets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calls targeted data.push with only the job files and run manifest', async () => {
    const pushSpy = jest.spyOn(dataScript, 'push').mockResolvedValueOnce({
      uploadedRels: ['runs/daily-quarterly-result-analysis-2026-10-16.json'],
      skipped: 0,
      errors: [],
    });

    const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const readSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({
        date: '2026-10-16',
        scanId: SCAN_ID,
        count: 1,
        companies: [
          {
            companyId: 'NSE:SWSOLAR',
            name: 'Sterling & Wilson Renewable Energy Ltd',
          },
        ],
      })
    );

    const res = await pushJobAssets({ date: '2026-10-16' });
    expect(pushSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        files: expect.arrayContaining([expect.stringContaining('daily-quarterly-result-analysis')]),
      })
    );
    expect(res.pushed).toContain('runs/daily-quarterly-result-analysis-2026-10-16.json');
    pushSpy.mockRestore();
    existsSpy.mockRestore();
    readSpy.mockRestore();
  });
});

describe('analyzeScanCompanies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('filters by companyId and processes company', async () => {
    const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const readSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({
        date: '2026-10-16',
        scanId: SCAN_ID,
        count: 2,
        companies: [
          { companyId: 'NSE:SWSOLAR', name: 'Sterling & Wilson' },
          { companyId: 'NSE:IIFL', name: 'IIFL Finance' },
        ],
      })
    );

    const { processCompany } = require('../scripts/batchQuarterlyResultAnalysis');
    processCompany.mockResolvedValueOnce({
      pdfPath: '/tmp/test.pdf',
      generated: true,
    });

    const res = await analyzeScanCompanies({
      date: '2026-10-16',
      companyId: 'NSE:SWSOLAR',
    });

    expect(res.status).toBe('ok');
    expect(res.count).toBe(1);
    expect(res.processed[0].companyId).toBe('NSE:SWSOLAR');
    expect(processCompany).toHaveBeenCalledTimes(1);

    existsSpy.mockRestore();
    readSpy.mockRestore();
  });
});

describe('resolveSlot and evening days=0 filter', () => {
  test('resolves explicit slot flags and options correctly', () => {
    expect(resolveSlot({ slot: 'evening' })).toBe('evening');
    expect(resolveSlot({ slot: 'morning' })).toBe('morning');
    expect(resolveSlot({}, ['node', 'script.js', '--slot', 'evening'])).toBe('evening');
    expect(resolveSlot({}, ['node', 'script.js', '--slot', 'morning'])).toBe('morning');
    expect(resolveSlot({}, ['node', 'script.js', '--evening'])).toBe('evening');
    expect(resolveSlot({}, ['node', 'script.js', '--morning'])).toBe('morning');
    expect(resolveSlot({ days: 0 })).toBe('evening');
    expect(resolveSlot({}, ['node', 'script.js', '--days', '0'])).toBe('evening');
  });

  test('fetchScan defaults days to 0 when slot is evening', async () => {
    stockscans.getScanMetadata.mockResolvedValueOnce({
      scanId: SCAN_ID,
      scanName: 'Quality Result - DND',
      watchlistIds: [],
      filters: [{ left: 'Days From Result', sign: '=', right: '-1' }],
    });

    stockscans.runScan.mockResolvedValueOnce({
      total: 1,
      table: [
        [
          'companyId',
          'Name',
          'Market Capitalization',
          'PAT Growth YoY',
          'Revenue Growth YoY',
          'PAT Growth TTM',
        ],
        ['NSE:TCS', 'Tata Consultancy Services', 1400000, 15.2, 8.5, 45.0],
      ],
    });

    const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockReturnValue(true);
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockReturnValue(true);

    const res = await fetchScan({ date: '2026-11-03', slot: 'evening' });
    expect(res.count).toBe(1);
    expect(res.slot).toBe('evening');
    expect(res.days).toBe(0);
    expect(stockscans.runScan).toHaveBeenCalledWith(
      expect.objectContaining({
        scan: expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({ left: 'Days From Result', right: '0' }),
          ]),
        }),
      }),
      SCAN_ID
    );

    existsSpy.mockRestore();
    mkdirSpy.mockRestore();
    writeSpy.mockRestore();
  });
});

describe('shared cursor and filing deduplication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('loadCursor and saveCursor read and persist cursor file', () => {
    const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const readSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({
        lastCommittedAtMs: 123456789,
        lastEveningRun: { date: '2026-11-03' },
        processedCompanies: { 'NSE:INFY': { companyId: 'NSE:INFY' } },
      })
    );
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockReturnValue(true);
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockReturnValue(true);

    const loaded = loadCursor();
    expect(loaded.lastCommittedAtMs).toBe(123456789);
    expect(loaded.processedCompanies['NSE:INFY'].companyId).toBe('NSE:INFY');

    saveCursor(loaded);
    expect(writeSpy).toHaveBeenCalled();

    existsSpy.mockRestore();
    readSpy.mockRestore();
    mkdirSpy.mockRestore();
    writeSpy.mockRestore();
  });

  test('isCompanyProcessed and markCompanyProcessed track filings accurately', () => {
    const cursor = { processedCompanies: {} };
    expect(isCompanyProcessed('NSE:INFY', cursor, '2026-11-03')).toBe(false);

    markCompanyProcessed(
      cursor,
      { companyId: 'NSE:INFY', name: 'Infosys Ltd', patTtm: 50 },
      {
        date: '2026-11-03',
        slot: 'evening',
        pdfPath: '/path/to/infy.pdf',
      }
    );

    expect(isCompanyProcessed('NSE:INFY', cursor, '2026-11-03')).toBe(true);
    expect(cursor.processedCompanies['NSE:INFY'].slot).toBe('evening');
    expect(cursor.processedCompanies['NSE:INFY'].pdfPath).toBe('/path/to/infy.pdf');
  });

  test('fetchScan skips companies already processed in shared cursor', async () => {
    stockscans.getScanMetadata.mockResolvedValueOnce({
      scanId: SCAN_ID,
      scanName: 'Quality Result - DND',
      watchlistIds: [],
    });

    stockscans.runScan.mockResolvedValueOnce({
      total: 2,
      table: [
        [
          'companyId',
          'Name',
          'Market Capitalization',
          'PAT Growth YoY',
          'Revenue Growth YoY',
          'PAT Growth TTM',
        ],
        ['NSE:ALREADY_DONE', 'Already Processed Co', 5000, 50, 20, 100],
        ['NSE:FRESH_CO', 'Fresh Co', 6000, 60, 25, 120],
      ],
    });

    const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const readSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({
        lastCommittedAtMs: Date.now(),
        processedCompanies: {
          'NSE:ALREADY_DONE': {
            companyId: 'NSE:ALREADY_DONE',
            date: '2026-11-03',
            slot: 'evening',
          },
        },
      })
    );
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockReturnValue(true);
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockReturnValue(true);

    const res = await fetchScan({ date: '2026-11-04', slot: 'morning' });

    expect(res.count).toBe(1);
    expect(res.companies[0].companyId).toBe('NSE:FRESH_CO');
    expect(res.alreadyProcessed).toHaveLength(1);
    expect(res.alreadyProcessed[0].companyId).toBe('NSE:ALREADY_DONE');

    existsSpy.mockRestore();
    readSpy.mockRestore();
    mkdirSpy.mockRestore();
    writeSpy.mockRestore();
  });
});

describe('morning consolidated report email', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getCombinedMorningCompanies merges previous evening and morning companies sorted by patTtm', () => {
    const mockCursor = {
      lastEveningRun: {
        date: '2026-11-03',
        slot: 'evening',
        completedAt: new Date().toISOString(),
        companies: [
          { companyId: 'NSE:EVENING1', name: 'Evening Co 1', patTtm: 80, marketCap: 1000 },
          { companyId: 'NSE:SHARED', name: 'Shared Co', patTtm: 150, marketCap: 3000 },
        ],
      },
    };

    const morningCompanies = [
      { companyId: 'NSE:MORNING1', name: 'Morning Co 1', patTtm: 200, marketCap: 2000 },
      { companyId: 'NSE:SHARED', name: 'Shared Co Updated', patTtm: 150, marketCap: 3000 },
    ];

    const { combined, eveningCount, morningCount } = getCombinedMorningCompanies(morningCompanies, {
      date: '2026-11-04',
      cursor: mockCursor,
    });

    expect(eveningCount).toBe(2);
    expect(morningCount).toBe(2);
    expect(combined).toHaveLength(3); // Deduplicated
    // Ordered descending by patTtm: 200 (Morning 1), 150 (Shared), 80 (Evening 1)
    expect(combined[0].companyId).toBe('NSE:MORNING1');
    expect(combined[1].companyId).toBe('NSE:SHARED');
    expect(combined[2].companyId).toBe('NSE:EVENING1');
  });

  test('sendReportEmail in morning slot includes previous evening results in consolidated table', async () => {
    sendHtmlEmail.mockResolvedValueOnce({ status: 'sent', to: 'test@example.com' });

    const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
      if (String(filePath).includes('cursor')) {
        return JSON.stringify({
          lastCommittedAtMs: Date.now(),
          lastEveningRun: {
            date: '2026-11-03',
            slot: 'evening',
            completedAt: new Date().toISOString(),
            count: 1,
            companies: [
              {
                companyId: 'NSE:EVENING_STAR',
                name: 'Evening Star Ltd',
                marketCap: 10000,
                revenueYoY: 25.0,
                patYoY: 45.0,
                patTtm: 95.0,
              },
            ],
          },
          processedCompanies: {},
        });
      }
      return JSON.stringify({
        date: '2026-11-04',
        scanId: SCAN_ID,
        scanName: 'Quality Result - DND',
        slot: 'morning',
        count: 1,
        companies: [
          {
            companyId: 'NSE:MORNING_GLORY',
            name: 'Morning Glory Ltd',
            marketCap: 8000,
            revenueYoY: 30.0,
            patYoY: 55.0,
            patTtm: 110.0,
          },
        ],
      });
    });

    const res = await sendReportEmail({ date: '2026-11-04', slot: 'morning' });

    expect(res.sent).toBe(true);
    expect(res.count).toBe(2); // Consolidated count
    expect(sendHtmlEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('2 companies analyzed (Full Day)'),
        htmlBody: expect.stringContaining('Evening Star Ltd'),
      })
    );
    expect(sendHtmlEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        htmlBody: expect.stringContaining('Morning Glory Ltd'),
      })
    );

    existsSpy.mockRestore();
    readSpy.mockRestore();
  });
});
