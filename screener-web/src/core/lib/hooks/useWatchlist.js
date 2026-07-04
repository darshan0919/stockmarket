/**
 * useWatchlist Hook - Manages user's stock watchlist state
 * @module hooks/useWatchlist
 * @see {@link docs/frontend/hooks/useWatchlist.md} for documentation
 * @see {@link frontend/lib/hooks/__tests__/useWatchlist.test.js} for tests
 */

import { useState, useEffect } from 'react';
import { watchlistAPI } from '../api';

/**
 * Custom hook for managing watchlist operations
 *
 * @returns {Object} Hook return value
 * @returns {Object[]} returns.watchlist - Array of watchlist items
 * @returns {boolean} returns.loading - Loading state
 * @returns {string|null} returns.error - Error message if any
 * @returns {Function} returns.fetchWatchlist - Refresh watchlist
 * @returns {Function} returns.addToWatchlist - Add symbol to watchlist
 * @returns {Function} returns.removeFromWatchlist - Remove symbol from watchlist
 * @returns {Function} returns.isInWatchlist - Check if symbol is in watchlist
 *
 * @example
 * function WatchlistButton({ symbol }) {
 *   const { isInWatchlist, addToWatchlist, removeFromWatchlist } = useWatchlist();
 *   const inList = isInWatchlist(symbol);
 *
 *   return (
 *     <button onClick={() => inList ? removeFromWatchlist(symbol) : addToWatchlist(symbol)}>
 *       {inList ? 'Remove' : 'Add'}
 *     </button>
 *   );
 * }
 */
export function useWatchlist() {
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchWatchlist = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await watchlistAPI.getAll();
      if (response.data.success) {
        setWatchlist(response.data.data);
      }
    } catch (err) {
      setError(err.message);
      console.error('Error fetching watchlist:', err);
    } finally {
      setLoading(false);
    }
  };

  const addToWatchlist = async (symbol) => {
    try {
      const response = await watchlistAPI.add(symbol);
      if (response.data.success) {
        await fetchWatchlist();
        return { success: true };
      }
    } catch (err) {
      console.error('Error adding to watchlist:', err);
      return { success: false, error: err.response?.data?.error || err.message };
    }
  };

  const removeFromWatchlist = async (symbol) => {
    try {
      const response = await watchlistAPI.remove(symbol);
      if (response.data.success) {
        await fetchWatchlist();
        return { success: true };
      }
    } catch (err) {
      console.error('Error removing from watchlist:', err);
      return { success: false, error: err.response?.data?.error || err.message };
    }
  };

  const isInWatchlist = (symbol) => {
    return watchlist.some((item) => item.symbol === symbol);
  };

  useEffect(() => {
    fetchWatchlist();
  }, []);

  return {
    watchlist,
    loading,
    error,
    fetchWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    isInWatchlist,
  };
}
