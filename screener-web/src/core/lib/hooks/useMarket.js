/**
 * useMarket Hook - Fetches and manages market data state
 * @module hooks/useMarket
 * @see {@link docs/frontend/hooks/useMarket.md} for documentation
 * @see {@link frontend/lib/hooks/__tests__/useMarket.test.js} for tests
 */

import { useState, useEffect } from 'react';
import { marketAPI } from '../api';

/**
 * Custom hook for fetching market indices data
 * Auto-refreshes every 5 minutes
 *
 * @returns {Object} Hook return value
 * @returns {Object|null} returns.marketData - Market indices data (nifty50, sensex, sectors)
 * @returns {boolean} returns.loading - Loading state
 * @returns {string|null} returns.error - Error message if any
 * @returns {Function} returns.refresh - Function to manually refresh data
 *
 * @example
 * function MarketWidget() {
 *   const { marketData, loading, error, refresh } = useMarket();
 *
 *   if (loading) return <Spinner />;
 *   if (error) return <Error message={error} />;
 *
 *   return <div>Nifty: {marketData.nifty50.current}</div>;
 * }
 */
export function useMarket() {
  const [marketData, setMarketData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMarketData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await marketAPI.getIndices();
      if (response.data.success) {
        setMarketData(response.data.data);
      }
    } catch (err) {
      setError(err.message);
      console.error('Error fetching market data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarketData();

    // Refresh every 5 minutes
    const interval = setInterval(fetchMarketData, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return {
    marketData,
    loading,
    error,
    refresh: fetchMarketData,
  };
}
