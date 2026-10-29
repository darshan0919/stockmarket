'use strict';

const {
  formatMarketCap,
  formatPct,
  fetchScan,
  sendEmptyScanEmail,
  sendReportEmail,
  pushJobAssets,
  analyzeScanCompanies,
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
