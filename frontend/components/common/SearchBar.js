import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { stockAPI } from '../../lib/api';
import { formatPrice, formatPercentage, getChangeColor } from '../../lib/utils/formatters';

/**
 * SearchBar component for stock search with autocomplete
 * @component
 * @param {Object} props
 * @param {string} [props.placeholder='Search stocks...'] - Input placeholder text
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

  const highlightMatch = (text, q) => {
    if (!q) return text;
    const parts = text.split(new RegExp(`(${q})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === q.toLowerCase() ? (
        <mark key={i} className="bg-secondary/20 text-base-content rounded-sm px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="relative w-full" ref={searchRef}>
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40"
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
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder={placeholder}
          className="w-full h-9 pl-9 pr-4 text-sm bg-white/10 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:bg-white/15 focus:border-white/25 transition-all"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
              setShowResults(false);
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {showResults && (
        <div className="absolute z-50 w-full mt-2 finance-card shadow-xl max-h-[480px] overflow-y-auto">
          {loading && page === 1 ? (
            <div className="p-6 text-center text-base-content/50">
              <span className="loading loading-spinner loading-sm mr-2" />
              Searching...
            </div>
          ) : results.length > 0 ? (
            <>
              <div className="py-1">
                {results.map((stock, index) => (
                  <button
                    key={`${stock.symbol}-${index}`}
                    onClick={() => handleSelectStock(stock.symbol)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${
                      index === selectedIndex
                        ? 'bg-secondary/10'
                        : 'hover:bg-base-200/60'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-base-content truncate">
                        {highlightMatch(stock.name || stock.symbol, query)}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-medium text-secondary">
                          {stock.symbol}
                        </span>
                        <span className="text-2xs text-base-content/40">
                          {stock.exchange || 'NSE'}
                        </span>
                        {stock.sector && (
                          <span className="text-2xs text-base-content/40 hidden sm:inline">
                            {stock.sector}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right ml-4 flex-shrink-0">
                      {stock.current_price && (
                        <div className="text-sm font-semibold font-mono tabular-nums">
                          {formatPrice(stock.current_price)}
                        </div>
                      )}
                      {stock.change_percent !== null && stock.change_percent !== undefined && (
                        <div className={`text-xs font-medium font-mono ${getChangeColor(stock.change_percent)}`}>
                          {formatPercentage(stock.change_percent)}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {hasMore && (
                <div className="border-t border-base-300/60 p-3">
                  <button
                    onClick={handleLoadMore}
                    disabled={loading}
                    className="w-full text-center text-sm font-medium text-secondary hover:text-secondary/80 py-1.5 rounded-lg hover:bg-secondary/5 transition-colors"
                  >
                    {loading
                      ? 'Loading...'
                      : `Show more results (${total - results.length} remaining)`}
                  </button>
                </div>
              )}

              <div className="border-t border-base-300/60 px-4 py-2 text-center">
                <span className="text-2xs text-base-content/40">
                  {results.length} of {total} results
                </span>
              </div>
            </>
          ) : query.length > 0 ? (
            <div className="p-6 text-center text-base-content/50 text-sm">
              No stocks found for &ldquo;{query}&rdquo;
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
