/**
 * Unit tests for declaredResultsController
 * @file backend/controllers/__tests__/declaredResultsController.test.js
 * @see docs/API_REFERENCE.md#declared-results-apis for API documentation
 */

const { getDeclaredResults, getFilterOptions } = require('../declaredResultsController');
const axios = require('axios');

// Mock axios
jest.mock('axios');

describe('declaredResultsController', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      body: {},
    };
    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('getDeclaredResults', () => {
    const mockApiResponse = {
      data: {
        total: 171,
        start: 1,
        end: 20,
        quarterDate: '202512',
        resultDates: ['2026-01-31', '2026-01-29'],
        resultTables: [
          {
            companyId: 'NSE:SIRCA',
            metaRatios: {
              'Fundamentals Source': 'C',
              Name: 'Sirca Paints India Ltd',
              'Last Result Date': '2026-01-31',
              'Price To Earnings': 44.22,
              'Market Capitalization': 2634.33,
            },
            resultTable: {
              C: [
                ['', '202412', '202509', '202512', 'Growth QoQ', 'Growth YoY'],
                ['Revenue', 88.65, 131.17, 112.79, -14.01, 27.23],
              ],
            },
            documents: [
              { date: '202512', documentType: 'PPT', ssUrl: 'test.pdf', hasNotes: false },
            ],
          },
        ],
      },
    };

    it('should fetch and transform results successfully', async () => {
      axios.post.mockResolvedValue(mockApiResponse);

      await getDeclaredResults(mockReq, mockRes, mockNext);

      expect(axios.post).toHaveBeenCalledWith(
        'https://www.stockscans.in/api/company/scan-company-results',
        expect.objectContaining({
          scan: expect.objectContaining({
            filters: expect.any(Array),
          }),
          order: 'desc',
          orderBy: 'Last Result Date',
          offset: 0,
        }),
        expect.any(Object)
      );

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          results: expect.arrayContaining([
            expect.objectContaining({
              companyId: 'NSE:SIRCA',
              symbol: 'SIRCA',
              exchange: 'NSE',
              name: 'Sirca Paints India Ltd',
            }),
          ]),
          pagination: expect.objectContaining({
            total: 171,
          }),
          quarterDate: '202512',
        }),
      });
    });

    it('should apply filters from request body', async () => {
      mockReq.body = {
        marketCapMin: 5000,
        industry: ['Banking'],
        order: 'asc',
        orderBy: 'Market Capitalization',
        searchCompany: 'test',
      };

      axios.post.mockResolvedValue(mockApiResponse);

      await getDeclaredResults(mockReq, mockRes, mockNext);

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          scan: expect.objectContaining({
            industry: ['Banking'],
          }),
          order: 'asc',
          orderBy: 'Market Capitalization',
          searchCompany: 'test',
        }),
        expect.any(Object)
      );
    });

    it('should handle API errors', async () => {
      const error = new Error('API Error');
      error.response = {
        status: 500,
        data: { message: 'Internal Server Error' },
      };
      axios.post.mockRejectedValue(error);

      await getDeclaredResults(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to fetch results from StockScans',
        details: { message: 'Internal Server Error' },
      });
    });

    it('should transform document URLs correctly', async () => {
      axios.post.mockResolvedValue(mockApiResponse);

      await getDeclaredResults(mockReq, mockRes, mockNext);

      const responseData = mockRes.json.mock.calls[0][0];
      const firstResult = responseData.data.results[0];

      expect(firstResult.documents[0].fullUrl).toBe(
        'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/test.pdf'
      );
    });

    it('should add notesUrl for documents with hasNotes true', async () => {
      const responseWithNotes = {
        data: {
          ...mockApiResponse.data,
          resultTables: [
            {
              ...mockApiResponse.data.resultTables[0],
              documents: [
                {
                  date: '202512',
                  documentType: 'Transcript',
                  ssUrl: 'transcript.pdf',
                  hasNotes: true,
                },
              ],
            },
          ],
        },
      };

      axios.post.mockResolvedValue(responseWithNotes);

      await getDeclaredResults(mockReq, mockRes, mockNext);

      const responseData = mockRes.json.mock.calls[0][0];
      const firstResult = responseData.data.results[0];

      expect(firstResult.documents[0].notesUrl).toBe(
        'https://www.stockscans.in/api/company/get-concall-notes/NSE:SIRCA/transcript.pdf'
      );
    });

    it('should handle results with only standalone data', async () => {
      const standaloneResponse = {
        data: {
          ...mockApiResponse.data,
          resultTables: [
            {
              ...mockApiResponse.data.resultTables[0],
              resultTable: {
                S: [
                  ['', '202412', '202509', '202512', 'Growth QoQ', 'Growth YoY'],
                  ['Revenue', 88.65, 131.17, 112.79, -14.01, 27.23],
                ],
              },
            },
          ],
        },
      };

      axios.post.mockResolvedValue(standaloneResponse);

      await getDeclaredResults(mockReq, mockRes, mockNext);

      const responseData = mockRes.json.mock.calls[0][0];
      const firstResult = responseData.data.results[0];

      expect(firstResult.dataSource).toBe('Standalone');
      expect(firstResult.hasConsolidated).toBe(false);
      expect(firstResult.hasStandalone).toBe(true);
    });
  });

  describe('getFilterOptions', () => {
    it('should return filter options', async () => {
      await getFilterOptions(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          sortOptions: expect.any(Array),
          documentTypes: expect.any(Array),
          indices: expect.any(Array),
          industries: expect.any(Array),
        }),
      });
    });

    it('should include all expected sort options', async () => {
      await getFilterOptions(mockReq, mockRes, mockNext);

      const responseData = mockRes.json.mock.calls[0][0];
      const sortValues = responseData.data.sortOptions.map((o) => o.value);

      expect(sortValues).toContain('Last Result Date');
      expect(sortValues).toContain('Market Capitalization');
    });
  });
});
