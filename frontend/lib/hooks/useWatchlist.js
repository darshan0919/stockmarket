import { useState, useEffect } from 'react';
import { watchlistAPI } from '../api';

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

