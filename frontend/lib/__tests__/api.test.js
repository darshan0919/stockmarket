/**
 * Unit tests for API client
 * @file frontend/lib/__tests__/api.test.js
 * @see docs/frontend/lib/api.md for documentation
 */

import axios from 'axios';
import api, {
  stockAPI,
  screenerAPI,
  watchlistAPI,
  marketAPI,
  transcriptAPI,
  ordersAPI,
  upcomingResultsAPI,
  announcementsAPI,
  twitterAPI,
} from '../api';

jest.mock('axios', () => {
  const mockAxios = {
    create: jest.fn(() => mockAxios),
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  };
  return mockAxios;
});

describe('API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('stockAPI', () => {
    it('should call search with correct parameters', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await stockAPI.search('RELIANCE', 1, 10);

      expect(axios.get).toHaveBeenCalledWith('/stocks/search?q=RELIANCE&page=1&limit=10');
    });

    it('should encode special characters in search query', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await stockAPI.search('M&M', 1, 10);

      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('M%26M'));
    });

    it('should call getDetails with symbol', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await stockAPI.getDetails('RELIANCE');

      expect(axios.get).toHaveBeenCalledWith('/stocks/RELIANCE');
    });

    it('should call getTechnicals with symbol', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await stockAPI.getTechnicals('RELIANCE');

      expect(axios.get).toHaveBeenCalledWith('/stocks/RELIANCE/technicals');
    });

    it('should call getFinancials with symbol and quarters', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await stockAPI.getFinancials('RELIANCE', 8);

      expect(axios.get).toHaveBeenCalledWith('/stocks/RELIANCE/financials?quarters=8');
    });

    it('should use default quarters if not provided', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await stockAPI.getFinancials('RELIANCE');

      expect(axios.get).toHaveBeenCalledWith('/stocks/RELIANCE/financials?quarters=4');
    });

    it('should call getQuarterlyResults with symbol', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await stockAPI.getQuarterlyResults('RELIANCE');

      expect(axios.get).toHaveBeenCalledWith('/stocks/RELIANCE/quarterly');
    });
  });

  describe('screenerAPI', () => {
    it('should call runScreener with correct body', async () => {
      axios.post.mockResolvedValue({ data: { success: true } });

      const filters = { pe_max: 30, roe_min: 15 };
      await screenerAPI.runScreener(filters, 'market_cap', 'desc', 50);

      expect(axios.post).toHaveBeenCalledWith('/screener/run', {
        filters,
        sort_by: 'market_cap',
        sort_order: 'desc',
        limit: 50,
      });
    });

    it('should use default parameters', async () => {
      axios.post.mockResolvedValue({ data: { success: true } });

      await screenerAPI.runScreener({});

      expect(axios.post).toHaveBeenCalledWith('/screener/run', {
        filters: {},
        sort_by: 'market_cap',
        sort_order: 'desc',
        limit: 100,
      });
    });
  });

  describe('watchlistAPI', () => {
    it('should call getAll', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await watchlistAPI.getAll();

      expect(axios.get).toHaveBeenCalledWith('/watchlist');
    });

    it('should call add with symbol', async () => {
      axios.post.mockResolvedValue({ data: { success: true } });

      await watchlistAPI.add('RELIANCE');

      expect(axios.post).toHaveBeenCalledWith('/watchlist/RELIANCE');
    });

    it('should call remove with symbol', async () => {
      axios.delete.mockResolvedValue({ data: { success: true } });

      await watchlistAPI.remove('RELIANCE');

      expect(axios.delete).toHaveBeenCalledWith('/watchlist/RELIANCE');
    });
  });

  describe('marketAPI', () => {
    it('should call getIndices', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await marketAPI.getIndices();

      expect(axios.get).toHaveBeenCalledWith('/market/indices');
    });

    it('should call getStats', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await marketAPI.getStats();

      expect(axios.get).toHaveBeenCalledWith('/market/stats');
    });
  });

  describe('transcriptAPI', () => {
    it('should call getTranscripts with symbol', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await transcriptAPI.getTranscripts('RELIANCE');

      expect(axios.get).toHaveBeenCalledWith('/result-transcript/RELIANCE');
    });

    it('should call analyzeTranscript with symbol and attachment', async () => {
      axios.post.mockResolvedValue({ data: { success: true } });

      await transcriptAPI.analyzeTranscript('RELIANCE', 'Q1FY24.pdf');

      expect(axios.post).toHaveBeenCalledWith(
        '/result-transcript/RELIANCE/analyze',
        { attachmentName: 'Q1FY24.pdf' },
        { timeout: 200000 }
      );
    });
  });

  describe('ordersAPI', () => {
    it('should call getBySymbol with symbol and limit', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await ordersAPI.getBySymbol('RELIANCE', 100);

      expect(axios.get).toHaveBeenCalledWith('/orders/RELIANCE?limit=100');
    });

    it('should use default limit', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await ordersAPI.getBySymbol('RELIANCE');

      expect(axios.get).toHaveBeenCalledWith('/orders/RELIANCE?limit=50');
    });

    it('should call getFullParsed with extended timeout', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await ordersAPI.getFullParsed('RELIANCE', 30);

      expect(axios.get).toHaveBeenCalledWith('/orders/RELIANCE/full?limit=30', {
        timeout: 180000,
      });
    });

    it('should call parsePdf with extended timeout', async () => {
      axios.post.mockResolvedValue({ data: { success: true } });

      await ordersAPI.parsePdf('RELIANCE', 'http://example.com/order.pdf');

      expect(axios.post).toHaveBeenCalledWith(
        '/orders/RELIANCE/parse-pdf',
        { attachmentUrl: 'http://example.com/order.pdf' },
        { timeout: 120000 }
      );
    });

    it('should call getOrderbook with extended timeout', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await ordersAPI.getOrderbook('RELIANCE');

      expect(axios.get).toHaveBeenCalledWith('/orders/RELIANCE/orderbook', {
        timeout: 300000,
      });
    });
  });

  describe('upcomingResultsAPI', () => {
    it('should call getAll with pagination', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await upcomingResultsAPI.getAll(2, 20);

      expect(axios.get).toHaveBeenCalledWith('/upcoming-results?page=2&limit=20');
    });

    it('should use default pagination', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await upcomingResultsAPI.getAll();

      expect(axios.get).toHaveBeenCalledWith('/upcoming-results?page=1&limit=10');
    });

    it('should call getSymbols', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await upcomingResultsAPI.getSymbols();

      expect(axios.get).toHaveBeenCalledWith('/upcoming-results/symbols');
    });
  });

  describe('announcementsAPI', () => {
    it('should call getBySymbol', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await announcementsAPI.getBySymbol('RELIANCE');

      expect(axios.get).toHaveBeenCalledWith('/announcements/RELIANCE');
    });

    it('should pass search and offset query params', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await announcementsAPI.getBySymbol('RELIANCE', { search: 'div', offset: 30 });

      expect(axios.get).toHaveBeenCalledWith('/announcements/RELIANCE?search=div&offset=30');
    });

    it('should pass provider when stockscans or nse', async () => {
      axios.get.mockResolvedValue({ data: { success: true } });

      await announcementsAPI.getBySymbol('RELIANCE', { provider: 'stockscans', offset: 0 });

      expect(axios.get).toHaveBeenCalledWith('/announcements/RELIANCE?provider=stockscans');

      await announcementsAPI.getBySymbol('X', { provider: 'nse' });

      expect(axios.get).toHaveBeenCalledWith('/announcements/X?provider=nse');
    });

    it('should post download body with optional search for ZIP naming', async () => {
      axios.post.mockResolvedValue({ data: new Blob() });
      const items = [{ url: 'https://example.com/a.pdf', subject: 'R', date: '' }];

      await announcementsAPI.downloadPdfs('RELIANCE', items, { search: '  results  ' });

      expect(axios.post).toHaveBeenCalledWith(
        '/announcements/RELIANCE/download',
        { announcements: items, search: 'results' },
        { responseType: 'blob', timeout: 120000 }
      );
    });

    it('should encode symbol in download path', async () => {
      axios.post.mockResolvedValue({ data: new Blob() });
      const items = [{ url: 'https://example.com/a.pdf', subject: 'R', date: '' }];

      await announcementsAPI.downloadPdfs('M&M', items);

      expect(axios.post).toHaveBeenCalledWith(
        '/announcements/M%26M/download',
        { announcements: items },
        { responseType: 'blob', timeout: 120000 }
      );
    });

    it('should omit search from download body when not provided', async () => {
      axios.post.mockResolvedValue({ data: new Blob() });
      const items = [{ url: 'https://example.com/a.pdf', subject: 'R', date: '' }];

      await announcementsAPI.downloadPdfs('RELIANCE', items);

      expect(axios.post).toHaveBeenCalledWith(
        '/announcements/RELIANCE/download',
        { announcements: items },
        { responseType: 'blob', timeout: 120000 }
      );
    });
  });

  describe('twitterAPI', () => {
    it('should POST fetch-tweets with body and extended timeout', async () => {
      axios.post.mockResolvedValue({ data: { success: true, data: {} } });

      await twitterAPI.fetchTweets({ handle: 'testuser', intervalDays: 14 });

      expect(axios.post).toHaveBeenCalledWith(
        '/twitter/fetch-tweets',
        { handle: 'testuser', intervalDays: 14 },
        { timeout: 120000 }
      );
    });
  });
});
