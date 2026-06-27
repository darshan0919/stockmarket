/**
 * Unit tests for StockScans Screener service
 */

const mockGetAuthToken = jest.fn(() => 'test-token');
const mockCreateAuthenticatedClient = jest.fn();

jest.mock('../stockscansAuth', () => ({
  getAuthToken: (...args) => mockGetAuthToken(...args),
  createAuthenticatedClient: (...args) => mockCreateAuthenticatedClient(...args),
}));

const {
  fetchSavedScans,
  runScan,
  parseTableBody,
  headerToLabel,
} = require('../stockscansScreener');

const makeScan = (overrides = {}) => ({
  scanId: 'abc123',
  scanName: 'Test Scan',
  scanDescription: null,
  filters: [],
  industry: [],
  index: [],
  sector: [],
  tags: [],
  watchlistIds: [],
  alertFrequency: null,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthToken.mockReturnValue('test-token');
});

describe('headerToLabel', () => {
  it('applies override labels', () => {
    expect(headerToLabel('Market Capitalization')).toBe('Mkt Cap (Cr)');
    expect(headerToLabel('P/E')).toBe('P/E');
  });
  it('passes through unknown keys', () => {
    expect(headerToLabel('Some Custom Column')).toBe('Some Custom Column');
  });
});

describe('parseTableBody', () => {
  it('returns empty when table is missing', () => {
    expect(parseTableBody({})).toEqual({ columns: [], rows: [] });
  });

  it('returns empty when table has only a header row', () => {
    expect(parseTableBody({ table: [['companyId', 'Name']] })).toEqual({ columns: [], rows: [] });
  });

  it('parses header, builds columns and rows', () => {
    const body = {
      table: [
        ['companyId', 'Market Capitalization', 'P/E'],
        ['NSE:RELIANCE', 50000, 24.5],
        ['NSE:TCS', 120000, 30.1],
        ['NSE:RELIANCE', 50000, 24.5], // duplicate — should be skipped
      ],
    };
    const { columns, rows } = parseTableBody(body);
    expect(columns).toHaveLength(2);
    expect(columns[0]).toMatchObject({ key: 'Market Capitalization', label: 'Mkt Cap (Cr)', type: 'number' });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      companyId: 'NSE:RELIANCE',
      symbol: 'RELIANCE',
      exchange: 'NSE',
      metrics: { 'Market Capitalization': 50000, 'P/E': 24.5 },
    });
  });

  it('handles non-NSE companyId formats gracefully', () => {
    const body = {
      table: [
        ['companyId', 'Name'],
        ['BSE:500325', 'Reliance BSE'],
      ],
    };
    const { rows } = parseTableBody(body);
    expect(rows[0].exchange).toBe('BSE');
    expect(rows[0].symbol).toBe('500325');
  });
});

describe('fetchSavedScans', () => {
  it('normalizes a bare-array response', async () => {
    const getMock = jest.fn().mockResolvedValue({
      data: [
        { scanId: 'id1', scanName: 'Scan One', scanDescription: 'desc', filters: [] },
      ],
    });
    mockCreateAuthenticatedClient.mockReturnValue({ get: getMock });

    const scans = await fetchSavedScans();
    expect(scans).toHaveLength(1);
    expect(scans[0].scanId).toBe('id1');
    expect(scans[0].scanName).toBe('Scan One');
  });

  it('normalizes a { scans: [...] } response', async () => {
    const getMock = jest.fn().mockResolvedValue({
      data: { scans: [{ scanId: 'id2', scanName: 'Scan Two', filters: [] }] },
    });
    mockCreateAuthenticatedClient.mockReturnValue({ get: getMock });

    const scans = await fetchSavedScans();
    expect(scans[0].scanId).toBe('id2');
  });

  it('throws STOCKSCANS_AUTH_REQUIRED on 401', async () => {
    const getMock = jest.fn().mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { response: { status: 401 } })
    );
    mockCreateAuthenticatedClient.mockReturnValue({ get: getMock });

    await expect(fetchSavedScans()).rejects.toMatchObject({ code: 'STOCKSCANS_AUTH_REQUIRED' });
  });
});

describe('runScan', () => {
  it('rejects without a scanId', async () => {
    await expect(runScan({})).rejects.toMatchObject({ code: 'STOCKSCANS_INVALID_SCAN' });
  });

  it('paginates until end >= total and merges rows', async () => {
    const postMock = jest.fn()
      .mockResolvedValueOnce({
        data: {
          total: 3,
          start: 1,
          end: 2,
          table: [
            ['companyId', 'Market Capitalization'],
            ['NSE:A', 1000],
            ['NSE:B', 800],
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          total: 3,
          start: 3,
          end: 3,
          table: [
            ['companyId', 'Market Capitalization'],
            ['NSE:C', 500],
          ],
        },
      });

    mockCreateAuthenticatedClient.mockReturnValue({ post: postMock });

    const { rows, columns, total, scanName } = await runScan(makeScan());

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.symbol)).toEqual(['A', 'B', 'C']);
    expect(columns[0].key).toBe('Market Capitalization');
    expect(total).toBe(3);
    expect(scanName).toBe('Test Scan');
    expect(postMock).toHaveBeenCalledTimes(2);
  });
});
