import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { stockAPI } from '../../lib/api';

/**
 * SearchBar component for stock search with autocomplete
 * @component
 * @param {Object} props - Component props
 * @param {string} [props.placeholder='Search stocks...'] - Input placeholder text
 * @returns {JSX.Element} SearchBar component with dropdown results
 * @see {@link docs/frontend/components/SearchBar.md} for documentation
 */
export default function SearchBar({ placeholder = 'Search stocks...' }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef(null);
  const router = useRouter();
  const limit = 10;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowResults(false);
        console.log('handleClickOutside');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const searchStocks = async () => {
      if (query.length < 1) {
        setResults([]);
        setPage(1);
        setTotal(0);
        setHasMore(false);
        return;
      }

      setLoading(true);
      try {
        const response = await stockAPI.search(query, page, limit);
        if (response.data.success) {
          const newResults = response.data.results || [];
          const totalCount = response.data.total || 0;

          // Append results for pagination
          setResults(page === 1 ? newResults : [...results, ...newResults]);
          setTotal(totalCount);
          setHasMore(results.length + newResults.length < totalCount);
          setShowResults(true);
        }
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    };

    const debounceTimer = setTimeout(searchStocks, 300);
    return () => clearTimeout(debounceTimer);
  }, [query, page]);

  // Reset page when query changes
  useEffect(() => {
    setPage(1);
    setResults([]);
    setSelectedIndex(-1);
  }, [query]);

  const handleSelectStock = (symbol) => {
    router.push(`/stock/${symbol}`);
    setQuery('');
    setShowResults(false);
    setPage(1);
    setResults([]);
  };

  const handleLoadMore = (e) => {
    e.stopPropagation();
    setPage(page + 1);
  };

  const handleKeyDown = (e) => {
    if (!showResults || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      handleSelectStock(results[selectedIndex].symbol);
    } else if (e.key === 'Escape') {
      setShowResults(false);
    }
  };

  const highlightMatch = (text, query) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-yellow-200 text-gray-900">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const getChangeColor = (change) => {
    if (!change || change === 0) return 'text-gray-600';
    return change > 0 ? 'text-green-600' : 'text-red-600';
  };

  const formatPrice = (price) => {
    if (!price) return 'N/A';
    return `₹${Number(price).toFixed(2)}`;
  };

  const formatChange = (change) => {
    if (!change && change !== 0) return '';
    const sign = change >= 0 ? '+' : '';
    return `${sign}${Number(change).toFixed(2)}%`;
  };

  return (
    <div className="relative w-full" ref={searchRef}>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
        <svg
          className="absolute right-3 top-2.5 h-5 w-5 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      {/* Search Results Dropdown */}
      {showResults && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[500px] overflow-y-auto">
          {loading && page === 1 ? (
            <div className="p-4 text-center text-gray-500">Searching...</div>
          ) : results.length > 0 ? (
            <>
              <ul>
                {results.map((stock, index) => (
                  <li
                    key={`${stock.symbol}-${index}`}
                    onClick={() => handleSelectStock(stock.symbol)}
                    className={`px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors ${
                      index === selectedIndex ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 text-base">
                          {highlightMatch(stock.name || stock.symbol, query)}
                        </div>
                        <div className="text-sm text-gray-600 mt-0.5">
                          {stock.symbol} · {stock.exchange || 'NSE'}
                          {stock.sector && (
                            <span className="ml-2 text-gray-500">• {stock.sector}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        {stock.current_price && (
                          <div className="text-sm font-semibold text-gray-900">
                            {formatPrice(stock.current_price)}
                          </div>
                        )}
                        {stock.change_percent !== null && stock.change_percent !== undefined && (
                          <div
                            className={`text-sm font-medium ${getChangeColor(stock.change_percent)}`}
                          >
                            {formatChange(stock.change_percent)}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Pagination Controls */}
              {hasMore && (
                <div className="border-t border-gray-200 p-3 bg-gray-50">
                  <button
                    onClick={handleLoadMore}
                    disabled={loading}
                    className="w-full px-4 py-2 text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded transition-colors disabled:opacity-50"
                  >
                    {loading
                      ? 'Loading...'
                      : `Show next ${Math.min(limit, total - results.length)} results`}
                  </button>
                  <div className="text-xs text-center text-gray-500 mt-2">
                    Showing {results.length} of {total} results
                  </div>
                </div>
              )}

              {/* Attribution */}
              <div className="border-t border-gray-200 px-4 py-2 bg-gray-50 text-center">
                <span className="text-xs text-gray-500">
                  Powered by{' '}
                  <a
                    href="https://www.nseindia.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-700 font-medium"
                  >
                    NSE India
                  </a>
                </span>
              </div>
            </>
          ) : query.length > 0 ? (
            <div className="p-4 text-center text-gray-500">No results found</div>
          ) : null}
        </div>
      )}
    </div>
  );
}
