import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { upcomingResultsAPI } from '../../lib/api';
import LoadingSpinner from '../common/LoadingSpinner';

const ITEMS_PER_PAGE = 20;

export default function UpcomingResults() {
  const [results, setResults] = useState([]);
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    roce: true,
    pe: true,
    debtToEquity: true,
    revenue: false,
    orderBook: false,
    category: true,
  });
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const menuRef = useRef(null);

  useEffect(() => {
    const fetchUpcomingResults = async () => {
      try {
        setLoading(true);
        setError(null); // Clear any previous errors
        const response = await upcomingResultsAPI.getAll(currentPage, ITEMS_PER_PAGE);
        console.log('API Response:', response);
        if (response.data.success) {
          setResults(response.data.data || []);
          setTotalResults(response.data.total || response.data.data?.length || 0);
        } else {
          console.error('API returned success: false', response.data);
          setError('Unable to load upcoming results');
        }
      } catch (err) {
        console.error('Error fetching upcoming results:', err);
        console.error('Error details:', {
          message: err.message,
          response: err.response?.data,
          status: err.response?.status,
        });
        setError(`Unable to load upcoming results: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchUpcomingResults();
  }, [currentPage]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowColumnMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatPrice = (value) => {
    if (value === null || value === undefined) return '-';
    const num = parseFloat(value);
    if (isNaN(num)) return '-';
    return `₹${num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined || value === '') return '-';
    const num = parseFloat(value);
    if (isNaN(num)) return '-';
    return `${num.toFixed(2)}%`;
  };

  const formatRatio = (value) => {
    if (value === null || value === undefined || value === '') return '-';
    const num = parseFloat(value);
    if (isNaN(num)) return '-';
    return num.toFixed(2);
  };

  const formatNumber = (value) => {
    if (value === null || value === undefined || value === '') return '-';
    const num = parseFloat(value);
    if (isNaN(num)) return '-';
    if (Math.abs(num) >= 10000000) {
      return `₹${(num / 10000000).toFixed(1)} Cr`;
    }
    if (Math.abs(num) >= 100000) {
      return `₹${(num / 100000).toFixed(1)} L`;
    }
    return `₹${num.toFixed(0)}`;
  };

  const handleStockClick = (symbol) => {
    if (symbol) {
      router.push(`/stock/${symbol}`);
    }
  };

  const handleStockScansClick = (e, exchangeSymbol) => {
    e.stopPropagation(); // Prevent row click
    if (exchangeSymbol) {
      const stockScansUrl = `https://www.stockscans.in/company/${encodeURIComponent(
        exchangeSymbol
      )}/standalone`;
      window.open(stockScansUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleScreenerClick = (e, symbol) => {
    e.stopPropagation(); // Prevent row click
    if (symbol) {
      const screenerUrl = `https://www.screener.in/company/${encodeURIComponent(symbol)}/`;
      window.open(screenerUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const getExchangeTagColor = (exchange) => {
    if (exchange === 'NSE') {
      return 'bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200';
    }
    return 'bg-purple-100 text-purple-800 hover:bg-purple-200 border-purple-200';
  };

  const getStockDetail = (result, path) => {
    if (!result.stockDetails) return null;
    return path.split('.').reduce((obj, key) => obj?.[key], result.stockDetails);
  };

  const toggleColumn = (column) => {
    setVisibleColumns((prev) => ({ ...prev, [column]: !prev[column] }));
  };

  const handleCopySymbols = async () => {
    try {
      // Fetch all symbols without pagination
      const response = await upcomingResultsAPI.getSymbols();
      if (response.data.success && response.data.symbols) {
        const symbols = response.data.symbols.join(', ');
        await navigator.clipboard.writeText(symbols);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy symbols:', err);
    }
  };

  // Pagination
  const totalPages = Math.ceil(totalResults / ITEMS_PER_PAGE) || 1;

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Upcoming Results</h2>
        <div className="flex justify-center py-8">
          <LoadingSpinner size="sm" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Upcoming Results</h2>
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-lg">
            <svg
              className="w-5 h-5 text-amber-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Upcoming Results</h2>
          <span className="text-sm text-gray-500">({results.length})</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Copy Symbols Button */}
          <button
            onClick={handleCopySymbols}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Copy all exchange symbols for creating a watchlist in StockScans"
          >
            {copied ? (
              <svg
                className="w-5 h-5 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            )}
          </button>

          {/* Column Settings Dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowColumnMenu(!showColumnMenu)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Configure columns"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                />
              </svg>
            </button>

            {showColumnMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-10">
                <p className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                  Show Columns
                </p>
                {[
                  { key: 'roce', label: 'ROCE' },
                  { key: 'debtToEquity', label: 'Debt/Equity' },
                  { key: 'orderBook', label: 'Order Book' },
                  { key: 'revenue', label: 'Revenue' },
                  { key: 'category', label: 'Category' },
                ].map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns[key]}
                      onChange={() => toggleColumn(key)}
                      className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                    />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {results.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">No upcoming results scheduled</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Company
                  </th>
                  <th className="text-center py-3 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="text-center py-3 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Result Date
                  </th>
                  {visibleColumns.category && (
                    <th className="text-left py-3 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Category
                    </th>
                  )}
                  {visibleColumns.pe && (
                    <th className="text-right py-3 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      PE
                    </th>
                  )}

                  {visibleColumns.roce && (
                    <th className="text-right py-3 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      ROCE
                    </th>
                  )}
                  {visibleColumns.debtToEquity && (
                    <th className="text-right py-3 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      D/E
                    </th>
                  )}
                  {visibleColumns.revenue && (
                    <th className="text-right py-3 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Revenue
                    </th>
                  )}
                  {visibleColumns.orderBook && (
                    <th className="text-right py-3 px-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Order Book
                    </th>
                  )}
                  <th className="py-3 px-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((result, index) => {
                  const pe = getStockDetail(result, 'fundamentals.pe_ratio');
                  const roce = getStockDetail(result, 'fundamentals.roce');
                  const debtToEquity = getStockDetail(result, 'fundamentals.debt_to_equity');
                  const price = getStockDetail(result, 'currentPrice.last_price');
                  const change = getStockDetail(result, 'currentPrice.change');
                  const changePercent = getStockDetail(result, 'currentPrice.change_percent');
                  const sector = getStockDetail(result, 'basicInfo.sector');
                  const industry = getStockDetail(result, 'basicInfo.industry');
                  const orderBook = result.orderBook || getStockDetail(result, 'orderBook');
                  const revenue = result.revenue || getStockDetail(result, 'revenue');
                  const isPositive = change !== null && change >= 0;

                  return (
                    <tr
                      key={index}
                      onClick={() => handleStockClick(result.symbol)}
                      className="hover:bg-amber-50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-gray-900 text-sm truncate">
                            {result.name || getStockDetail(result, 'basicInfo.name') || '-'}
                          </span>
                          {/* Exchange Tag and External Links */}
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${getExchangeTagColor(
                                result.exchange
                              ).replace(/hover:bg-\S+/, '')}`}
                            >
                              {result.exchangeSymbol || `BSE:${result.symbol}`}
                            </span>
                            {/* StockScans Button */}
                            <button
                              onClick={(e) =>
                                handleStockScansClick(
                                  e,
                                  result.exchangeSymbol || `BSE:${result.symbol}`
                                )
                              }
                              className="inline-flex items-center justify-center p-1 rounded border border-gray-300 bg-white hover:bg-gray-50 transition-colors cursor-pointer"
                              title="View on StockScans"
                            >
                              <Image
                                src="/icons/stockscans.png"
                                alt="StockScans"
                                width={16}
                                height={16}
                                className="object-contain"
                              />
                            </button>
                            {/* Screener Button */}
                            <button
                              onClick={(e) => handleScreenerClick(e, result.symbol)}
                              className="inline-flex items-center justify-center p-1 rounded border border-gray-300 bg-white hover:bg-gray-50 transition-colors cursor-pointer"
                              title="View on Screener"
                            >
                              <Image
                                src="/icons/screener.png"
                                alt="Screener"
                                width={16}
                                height={16}
                                className="object-contain"
                              />
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-sm font-semibold text-gray-900">
                            {formatPrice(price)}
                          </span>
                          {(change !== null || changePercent !== null) && (
                            <span
                              className={`text-xs font-medium ${
                                isPositive ? 'text-emerald-600' : 'text-red-500'
                              }`}
                            >
                              {change ? (isPositive ? '+' : '') + change?.toFixed(2) : ''}
                              {changePercent
                                ? ` (${isPositive ? '+' : ''}${changePercent?.toFixed(2)}%)`
                                : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                          {result.date || '-'}
                        </span>
                      </td>
                      {visibleColumns.category && (
                        <td className="py-3 px-3">
                          <div className="flex flex-col gap-0.5">
                            {sector && (
                              <span className="text-xs text-gray-700 font-medium">{sector}</span>
                            )}
                            {industry && <span className="text-xs text-gray-500">{industry}</span>}
                            {!sector && !industry && (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </div>
                        </td>
                      )}
                      {visibleColumns.pe && (
                        <td className="py-3 px-3 text-right">
                          <span
                            className={`text-sm font-medium ${
                              pe !== null && pe < 25
                                ? 'text-emerald-600'
                                : pe !== null && pe > 45
                                  ? 'text-red-500'
                                  : 'text-gray-700'
                            }`}
                          >
                            {formatRatio(pe)}
                          </span>
                        </td>
                      )}
                      {visibleColumns.roce && (
                        <td className="py-3 px-3 text-right">
                          <span
                            className={`text-sm font-medium ${
                              roce !== null && roce >= 15
                                ? 'text-emerald-600'
                                : roce !== null && roce < 10
                                  ? 'text-red-500'
                                  : 'text-gray-700'
                            }`}
                          >
                            {formatPercent(roce)}
                          </span>
                        </td>
                      )}
                      {visibleColumns.debtToEquity && (
                        <td className="py-3 px-3 text-right">
                          <span
                            className={`text-sm font-medium ${
                              debtToEquity !== null && debtToEquity <= 0.5
                                ? 'text-emerald-600'
                                : debtToEquity !== null && debtToEquity > 1
                                  ? 'text-red-500'
                                  : 'text-gray-700'
                            }`}
                          >
                            {formatRatio(debtToEquity)}
                          </span>
                        </td>
                      )}
                      {visibleColumns.revenue && (
                        <td className="py-3 px-3 text-right">
                          <span className="text-sm text-gray-700">{formatNumber(revenue)}</span>
                        </td>
                      )}
                      {visibleColumns.orderBook && (
                        <td className="py-3 px-3 text-right">
                          <span className="text-sm text-gray-700">{formatNumber(orderBook)}</span>
                        </td>
                      )}
                      <td className="py-3 px-2">
                        <svg
                          className="w-4 h-4 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}-
                {Math.min(currentPage * ITEMS_PER_PAGE, totalResults)} of {totalResults}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 text-sm font-medium rounded-lg transition-colors ${
                        currentPage === page
                          ? 'bg-amber-500 text-white'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <p className="text-xs text-gray-500 mt-4 pt-4 border-t border-gray-100">
        Data source: NSE India & BSE India. Click exchange tag to view on StockScans.
      </p>
    </div>
  );
}
