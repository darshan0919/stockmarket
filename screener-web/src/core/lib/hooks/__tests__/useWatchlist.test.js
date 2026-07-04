/**
 * Unit tests for useWatchlist hook
 * @file frontend/lib/hooks/__tests__/useWatchlist.test.js
 * @see docs/frontend/hooks/useWatchlist.md for documentation
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useWatchlist } from '../useWatchlist';
import { watchlistAPI } from '../../api';

jest.mock('../../api', () => ({
  watchlistAPI: {
    getAll: jest.fn(),
    add: jest.fn(),
    remove: jest.fn(),
  },
}));

describe('useWatchlist', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with loading state', () => {
    watchlistAPI.getAll.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useWatchlist());

    expect(result.current.loading).toBe(true);
    expect(result.current.watchlist).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('should fetch watchlist on mount', async () => {
    const mockWatchlist = [
      { symbol: 'RELIANCE', added_at: '2024-01-15' },
      { symbol: 'INFY', added_at: '2024-01-16' },
    ];

    watchlistAPI.getAll.mockResolvedValue({
      data: { success: true, data: mockWatchlist },
    });

    const { result } = renderHook(() => useWatchlist());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.watchlist).toEqual(mockWatchlist);
    expect(result.current.error).toBeNull();
  });

  it('should handle API errors', async () => {
    watchlistAPI.getAll.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useWatchlist());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
  });

  describe('addToWatchlist', () => {
    it('should add stock to watchlist successfully', async () => {
      const mockWatchlist = [{ symbol: 'RELIANCE' }];

      watchlistAPI.getAll.mockResolvedValue({
        data: { success: true, data: [] },
      });
      watchlistAPI.add.mockResolvedValue({
        data: { success: true },
      });

      const { result } = renderHook(() => useWatchlist());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      watchlistAPI.getAll.mockResolvedValue({
        data: { success: true, data: mockWatchlist },
      });

      let addResult;
      await act(async () => {
        addResult = await result.current.addToWatchlist('RELIANCE');
      });

      expect(addResult).toEqual({ success: true });
      expect(watchlistAPI.add).toHaveBeenCalledWith('RELIANCE');
    });

    it('should handle add failure', async () => {
      watchlistAPI.getAll.mockResolvedValue({
        data: { success: true, data: [] },
      });
      watchlistAPI.add.mockRejectedValue({
        response: { data: { error: 'Stock already in watchlist' } },
      });

      const { result } = renderHook(() => useWatchlist());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let addResult;
      await act(async () => {
        addResult = await result.current.addToWatchlist('RELIANCE');
      });

      expect(addResult).toEqual({
        success: false,
        error: 'Stock already in watchlist',
      });
    });

    it('should handle network error during add', async () => {
      watchlistAPI.getAll.mockResolvedValue({
        data: { success: true, data: [] },
      });
      watchlistAPI.add.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useWatchlist());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let addResult;
      await act(async () => {
        addResult = await result.current.addToWatchlist('RELIANCE');
      });

      expect(addResult).toEqual({
        success: false,
        error: 'Network error',
      });
    });
  });

  describe('removeFromWatchlist', () => {
    it('should remove stock from watchlist successfully', async () => {
      watchlistAPI.getAll.mockResolvedValue({
        data: { success: true, data: [{ symbol: 'RELIANCE' }] },
      });
      watchlistAPI.remove.mockResolvedValue({
        data: { success: true },
      });

      const { result } = renderHook(() => useWatchlist());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      watchlistAPI.getAll.mockResolvedValue({
        data: { success: true, data: [] },
      });

      let removeResult;
      await act(async () => {
        removeResult = await result.current.removeFromWatchlist('RELIANCE');
      });

      expect(removeResult).toEqual({ success: true });
      expect(watchlistAPI.remove).toHaveBeenCalledWith('RELIANCE');
    });

    it('should handle remove failure', async () => {
      watchlistAPI.getAll.mockResolvedValue({
        data: { success: true, data: [{ symbol: 'RELIANCE' }] },
      });
      watchlistAPI.remove.mockRejectedValue({
        response: { data: { error: 'Stock not found' } },
      });

      const { result } = renderHook(() => useWatchlist());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let removeResult;
      await act(async () => {
        removeResult = await result.current.removeFromWatchlist('RELIANCE');
      });

      expect(removeResult).toEqual({
        success: false,
        error: 'Stock not found',
      });
    });
  });

  describe('isInWatchlist', () => {
    it('should return true for stocks in watchlist', async () => {
      watchlistAPI.getAll.mockResolvedValue({
        data: { success: true, data: [{ symbol: 'RELIANCE' }, { symbol: 'INFY' }] },
      });

      const { result } = renderHook(() => useWatchlist());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isInWatchlist('RELIANCE')).toBe(true);
      expect(result.current.isInWatchlist('INFY')).toBe(true);
    });

    it('should return false for stocks not in watchlist', async () => {
      watchlistAPI.getAll.mockResolvedValue({
        data: { success: true, data: [{ symbol: 'RELIANCE' }] },
      });

      const { result } = renderHook(() => useWatchlist());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isInWatchlist('TCS')).toBe(false);
    });

    it('should return false for empty watchlist', async () => {
      watchlistAPI.getAll.mockResolvedValue({
        data: { success: true, data: [] },
      });

      const { result } = renderHook(() => useWatchlist());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isInWatchlist('RELIANCE')).toBe(false);
    });
  });

  describe('fetchWatchlist', () => {
    it('should manually refresh watchlist', async () => {
      watchlistAPI.getAll
        .mockResolvedValueOnce({ data: { success: true, data: [] } })
        .mockResolvedValueOnce({
          data: { success: true, data: [{ symbol: 'RELIANCE' }] },
        });

      const { result } = renderHook(() => useWatchlist());

      await waitFor(() => {
        expect(result.current.watchlist).toEqual([]);
      });

      await act(async () => {
        await result.current.fetchWatchlist();
      });

      expect(result.current.watchlist).toEqual([{ symbol: 'RELIANCE' }]);
      expect(watchlistAPI.getAll).toHaveBeenCalledTimes(2);
    });
  });
});
