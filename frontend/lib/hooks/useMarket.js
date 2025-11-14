import { useState, useEffect } from 'react';
import { marketAPI } from '../api';

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

