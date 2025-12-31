/**
 * Unit tests for useMarket hook
 * @file frontend/lib/hooks/__tests__/useMarket.test.js
 * @see docs/frontend/hooks/useMarket.md for documentation
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useMarket } from '../useMarket';
import { marketAPI } from '../../api';

jest.mock('../../api', () => ({
  marketAPI: {
    getIndices: jest.fn(),
  },
}));

describe('useMarket', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should initialize with loading state', () => {
    marketAPI.getIndices.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useMarket());

    expect(result.current.loading).toBe(true);
    expect(result.current.marketData).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should fetch market data on mount', async () => {
    const mockData = {
      nifty50: { current: 19000, change: 100, change_percent: 0.5 },
      sensex: { current: 62000, change: 200, change_percent: 0.3 },
    };

    marketAPI.getIndices.mockResolvedValue({
      data: { success: true, data: mockData },
    });

    const { result } = renderHook(() => useMarket());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.marketData).toEqual(mockData);
    expect(result.current.error).toBeNull();
  });

  it('should handle API errors', async () => {
    marketAPI.getIndices.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useMarket());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.marketData).toBeNull();
  });

  it('should handle unsuccessful API response', async () => {
    marketAPI.getIndices.mockResolvedValue({
      data: { success: false, error: 'API Error' },
    });

    const { result } = renderHook(() => useMarket());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should not set data on unsuccessful response
    expect(result.current.marketData).toBeNull();
  });

  it('should provide refresh function', async () => {
    const mockData1 = { nifty50: { current: 19000 } };
    const mockData2 = { nifty50: { current: 19100 } };

    marketAPI.getIndices
      .mockResolvedValueOnce({ data: { success: true, data: mockData1 } })
      .mockResolvedValueOnce({ data: { success: true, data: mockData2 } });

    const { result } = renderHook(() => useMarket());

    await waitFor(() => {
      expect(result.current.marketData).toEqual(mockData1);
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.marketData).toEqual(mockData2);
    expect(marketAPI.getIndices).toHaveBeenCalledTimes(2);
  });

  it('should set up auto-refresh interval', async () => {
    marketAPI.getIndices.mockResolvedValue({
      data: { success: true, data: { nifty50: { current: 19000 } } },
    });

    renderHook(() => useMarket());

    await waitFor(() => {
      expect(marketAPI.getIndices).toHaveBeenCalledTimes(1);
    });

    // Fast-forward 5 minutes
    act(() => {
      jest.advanceTimersByTime(5 * 60 * 1000);
    });

    await waitFor(() => {
      expect(marketAPI.getIndices).toHaveBeenCalledTimes(2);
    });
  });

  it('should clean up interval on unmount', async () => {
    marketAPI.getIndices.mockResolvedValue({
      data: { success: true, data: {} },
    });

    const { unmount } = renderHook(() => useMarket());

    await waitFor(() => {
      expect(marketAPI.getIndices).toHaveBeenCalledTimes(1);
    });

    unmount();

    act(() => {
      jest.advanceTimersByTime(5 * 60 * 1000);
    });

    // Should not call again after unmount
    expect(marketAPI.getIndices).toHaveBeenCalledTimes(1);
  });
});
