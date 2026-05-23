/**
 * Unit tests for StockScans saved scan helpers
 * @file backend/services/__tests__/stockscansSavedScan.test.js
 * @see docs/API_REFERENCE.md#download-latest-concall-transcripts-zip
 */

const {
  parseScanIdFromUrl,
  extractScanFromSavedPageHtml,
  companyIdsFromScanTable,
  runScanAndCollectCompanyIds,
  fetchCompanyIdsFromSavedScanUrl,
} = require('../stockscansSavedScan');

jest.mock('../stockscansAuth', () => ({
  getAuthToken: jest.fn(() => 'test-token'),
  createAuthenticatedClient: jest.fn(),
}));

jest.mock('axios', () => ({
  get: jest.fn(),
  create: jest.fn(),
}));

const axios = require('axios');
const { createAuthenticatedClient } = require('../stockscansAuth');

const SCAN_ID = 'c29a98ebbb568f073162ba24';
const SCAN_HTML_SNIPPET = `prefix"scan":{"scanId":"${SCAN_ID}","scanName":"Pre PEAD Candidates","scanDescription":"Pre PEAD Candidates","industry":[],"index":[],"sector":[],"tags":[],"watchlistIds":[],"filters":[{"left":"Market Capitalization","sign":">=","right":"300"}],"alertFrequency":null},"frequency":nullsuffix`;

describe('stockscansSavedScan', () => {
  describe('parseScanIdFromUrl', () => {
    it('parses full saved scan URL', () => {
      expect(parseScanIdFromUrl(`https://www.stockscans.in/scans/saved/${SCAN_ID}`)).toBe(SCAN_ID);
    });

    it('parses bare scan id', () => {
      expect(parseScanIdFromUrl(SCAN_ID)).toBe(SCAN_ID);
    });

    it('returns null for invalid input', () => {
      expect(parseScanIdFromUrl('not-a-scan')).toBeNull();
    });
  });

  describe('extractScanFromSavedPageHtml', () => {
    it('extracts scan definition from embedded page payload', () => {
      const scan = extractScanFromSavedPageHtml(SCAN_HTML_SNIPPET, SCAN_ID);
      expect(scan.scanId).toBe(SCAN_ID);
      expect(scan.scanName).toBe('Pre PEAD Candidates');
      expect(scan.filters).toHaveLength(1);
    });
  });

  describe('companyIdsFromScanTable', () => {
    it('reads companyId column from matrix table', () => {
      const table = [
        ['companyId', 'Name'],
        ['NSE:RELIANCE', 'Reliance'],
        ['NSE:TCS', 'TCS'],
        ['NSE:RELIANCE', 'Dup'],
      ];
      expect(companyIdsFromScanTable(table)).toEqual(['NSE:RELIANCE', 'NSE:TCS']);
    });
  });

  describe('runScanAndCollectCompanyIds', () => {
    let postMock;

    beforeEach(() => {
      postMock = jest.fn();
      createAuthenticatedClient.mockReturnValue({ post: postMock });
    });

    it('paginates until end >= total', async () => {
      postMock
        .mockResolvedValueOnce({
          data: {
            total: 3,
            start: 1,
            end: 2,
            table: [
              ['companyId', 'Name'],
              ['NSE:A', 'A'],
              ['NSE:B', 'B'],
            ],
          },
        })
        .mockResolvedValueOnce({
          data: {
            total: 3,
            start: 3,
            end: 3,
            table: [
              ['companyId', 'Name'],
              ['NSE:C', 'C'],
            ],
          },
        });

      const { companyIds, meta } = await runScanAndCollectCompanyIds({
        scanId: SCAN_ID,
        scanName: 'Test',
        filters: [],
        industry: [],
        index: [],
        sector: [],
        tags: [],
        watchlistIds: [],
        alertFrequency: null,
      });

      expect(companyIds).toEqual(['NSE:A', 'NSE:B', 'NSE:C']);
      expect(meta.pages).toBe(2);
      expect(postMock).toHaveBeenCalledTimes(2);
      expect(postMock.mock.calls[1][1].offset).toBe(2);
    });
  });

  describe('fetchCompanyIdsFromSavedScanUrl', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      axios.get.mockResolvedValue({ data: SCAN_HTML_SNIPPET });
      createAuthenticatedClient.mockReturnValue({
        post: jest.fn().mockResolvedValue({
          data: {
            total: 1,
            start: 1,
            end: 1,
            table: [
              ['companyId', 'Name'],
              ['NSE:BELRISE', 'Belrise'],
            ],
          },
        }),
      });
    });

    it('loads scan from page then runs scans/run', async () => {
      const { companyIds, meta } = await fetchCompanyIdsFromSavedScanUrl(
        `https://www.stockscans.in/scans/saved/${SCAN_ID}`
      );

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining(`/scans/saved/${SCAN_ID}`),
        expect.any(Object)
      );
      expect(companyIds).toEqual(['NSE:BELRISE']);
      expect(meta.scanId).toBe(SCAN_ID);
    });
  });
});
