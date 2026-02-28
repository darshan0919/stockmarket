import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { upcomingResultsAPI } from '../../lib/api';
import LoadingSpinner from '../common/LoadingSpinner';
import { formatCurrency, formatPercent } from '../../lib/utils/formatters';

const ITEMS_PER_PAGE = 20;

/**
 * Upcoming quarterly results table with configurable columns and pagination
 * @component
 */
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
        setError(null);
        const response = await upcomingResultsAPI.getAll(currentPage, ITEMS_PER_PAGE);
        if (response.data.success) {
          setResults(response.data.data || []);
          setTotalResults(response.data.total || response.data.data?.length || 0);
        } else {
          setError('Unable to load upcoming results');
        }
      } catch (err) {
        console.error('Error fetching upcoming results:', err);
        setError(`Unable to load upcoming results: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchUpcomingResults();
  }, [currentPage]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowColumnMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatPrice = (value) => formatCurrency(value, '-');
  const formatPercentDisplay = (value) => formatPercent(value, 2, '-');

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
    if (Math.abs(num) >= 10000000) return `₹${(num / 10000000).toFixed(1)} Cr`;
    if (Math.abs(num) >= 100000) return `₹${(num / 100000).toFixed(1)} L`;
    return `₹${num.toFixed(0)}`;
  };

  const formatRevenueNumber = (value) => {
    if (value === null || value === undefined || value === '') return '-';
    const num = parseFloat(value);
    if (isNaN(num)) return '-';
    if (Math.abs(num) >= 10000000) return `${(num / 10000000).toFixed(1)} Cr`;
    if (Math.abs(num) >= 100000) return `${(num / 100000).toFixed(1)} L`;
    return num.toFixed(0);
  };

  const handleStockClick = (symbol) => {
    if (symbol) router.push(`/stock/${symbol}`);
  };

  const handleStockScansClick = (e, exchangeSymbol) => {
    e.stopPropagation();
    if (exchangeSymbol) {
      window.open(
        `https://www.stockscans.in/company/${encodeURIComponent(exchangeSymbol)}/standalone`,
        '_blank',
        'noopener,noreferrer'
      );
    }
  };

  const handleScreenerClick = (e, symbol) => {
    e.stopPropagation();
    if (symbol) {
      window.open(
        `https://www.screener.in/company/${encodeURIComponent(symbol)}/`,
        '_blank',
        'noopener,noreferrer'
      );
    }
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
      const response = await upcomingResultsAPI.getSymbols();
      if (response.data.success && response.data.symbols) {
        await navigator.clipboard.writeText(response.data.symbols.join(', '));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy symbols:', err);
    }
  };

  const totalPages = Math.ceil(totalResults / ITEMS_PER_PAGE) || 1;

  if (loading) {
    return (
      <div className="finance-card p-5">
        <h2 className="section-title">Upcoming Results</h2>
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="finance-card p-5">
        <h2 className="section-title mb-3">Upcoming Results</h2>
        <div className="text-error text-sm">{error}</div>
      </div>
    );
  }

  const columnOptions = [
    { key: 'roce', label: 'ROCE' },
    { key: 'debtToEquity', label: 'Debt/Equity' },
    { key: 'orderBook', label: 'Order Book' },
    { key: 'revenue', label: 'Revenue' },
    { key: 'category', label: 'Category' },
  ];

  return (
    <div className="finance-card">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="section-title">Upcoming Results</h2>
            <span className="finance-badge bg-warning/15 text-warning">{results.length}</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleCopySymbols}
              className={`btn btn-ghost btn-sm btn-square ${copied ? 'text-success' : ''}`}
              title="Copy all exchange symbols"
            >
              {copied ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

            <div className="dropdown dropdown-end" ref={menuRef}>
              <label
                tabIndex={0}
                className="btn btn-ghost btn-sm btn-square"
                onClick={() => setShowColumnMenu(!showColumnMenu)}
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
              </label>
              {showColumnMenu && (
                <ul
                  tabIndex={0}
                  className="dropdown-content menu bg-base-100 rounded-box shadow-lg border border-base-300 w-48 p-2 z-10"
                >
                  <li className="menu-title">Show Columns</li>
                  {columnOptions.map(({ key, label }) => (
                    <li key={key}>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={visibleColumns[key]}
                          onChange={() => toggleColumn(key)}
                          className="checkbox checkbox-sm checkbox-warning"
                        />
                        {label}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {results.length === 0 ? (
          <p className="text-center py-10 text-base-content/40 text-sm">No upcoming results scheduled</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th className="text-center">Price</th>
                    <th className="text-center">Result Date</th>
                    {visibleColumns.category && <th>Category</th>}
                    {visibleColumns.pe && <th className="text-right">PE</th>}
                    {visibleColumns.roce && <th className="text-right">ROCE</th>}
                    {visibleColumns.debtToEquity && <th className="text-right">D/E</th>}
                    {visibleColumns.revenue && <th className="text-center">Revenue</th>}
                    {visibleColumns.orderBook && <th className="text-right">Order Book</th>}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
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
                        className="hover cursor-pointer"
                      >
                        <td>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-sm truncate">
                              {result.name || getStockDetail(result, 'basicInfo.name') || '-'}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`badge badge-sm ${
                                  result.exchange === 'NSE'
                                    ? 'badge-info badge-outline'
                                    : 'badge-secondary badge-outline'
                                }`}
                              >
                                {result.exchangeSymbol || `BSE:${result.symbol}`}
                              </span>
                              <button
                                onClick={(e) =>
                                  handleStockScansClick(
                                    e,
                                    result.exchangeSymbol || `BSE:${result.symbol}`
                                  )
                                }
                                className="btn btn-ghost btn-xs btn-square"
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
                              <button
                                onClick={(e) => handleScreenerClick(e, result.symbol)}
                                className="btn btn-ghost btn-xs btn-square"
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
                        <td className="text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-sm font-semibold">{formatPrice(price)}</span>
                            {(change !== null || changePercent !== null) && (
                              <span
                                className={`text-xs font-medium ${
                                  isPositive ? 'text-success' : 'text-error'
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
                        <td className="text-center">
                          <span className="badge badge-warning badge-sm">{result.date || '-'}</span>
                        </td>
                        {visibleColumns.category && (
                          <td>
                            <div className="flex flex-col gap-0.5">
                              {sector && <span className="text-xs font-medium">{sector}</span>}
                              {industry && <span className="text-xs opacity-60">{industry}</span>}
                              {!sector && !industry && (
                                <span className="text-xs opacity-40">-</span>
                              )}
                            </div>
                          </td>
                        )}
                        {visibleColumns.pe && (
                          <td className="text-right">
                            <span
                              className={`text-sm font-medium ${
                                pe !== null && pe < 25
                                  ? 'text-success'
                                  : pe !== null && pe > 45
                                    ? 'text-error'
                                    : ''
                              }`}
                            >
                              {formatRatio(pe)}
                            </span>
                          </td>
                        )}
                        {visibleColumns.roce && (
                          <td className="text-right">
                            <span
                              className={`text-sm font-medium ${
                                roce !== null && roce >= 15
                                  ? 'text-success'
                                  : roce !== null && roce < 10
                                    ? 'text-error'
                                    : ''
                              }`}
                            >
                              {formatPercentDisplay(roce)}
                            </span>
                          </td>
                        )}
                        {visibleColumns.debtToEquity && (
                          <td className="text-right">
                            <span
                              className={`text-sm font-medium ${
                                debtToEquity !== null && debtToEquity <= 0.5
                                  ? 'text-success'
                                  : debtToEquity !== null && debtToEquity > 1
                                    ? 'text-error'
                                    : ''
                              }`}
                            >
                              {formatRatio(debtToEquity)}
                            </span>
                          </td>
                        )}
                        {visibleColumns.revenue && (
                          <td>
                            {revenue && Array.isArray(revenue) && revenue.length > 0 ? (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2 justify-end">
                                  {revenue.map((quarter, idx) => (
                                    <div
                                      key={idx}
                                      className="flex flex-col items-center gap-0.5 min-w-[65px]"
                                    >
                                      <span className="text-xs font-medium opacity-60">
                                        {quarter.period?.replace(/Q(\d)\s+FY(\d{2})/, "Q$1'$2") ||
                                          '-'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex items-center gap-2 justify-end">
                                  {revenue.map((quarter, idx) => (
                                    <div
                                      key={idx}
                                      className="flex flex-col items-center gap-0.5 min-w-[65px]"
                                    >
                                      <span className="text-sm font-semibold">
                                        {formatRevenueNumber(quarter.revenue)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex items-center gap-2 justify-end">
                                  {revenue.map((quarter, idx) => (
                                    <div
                                      key={idx}
                                      className="flex flex-col items-center gap-0.5 min-w-[65px]"
                                    >
                                      {quarter.yoy_growth !== null &&
                                      quarter.yoy_growth !== undefined ? (
                                        <span
                                          className={`text-xs font-medium ${
                                            quarter.yoy_growth >= 0 ? 'text-success' : 'text-error'
                                          }`}
                                        >
                                          {quarter.yoy_growth >= 0 ? '+' : ''}
                                          {quarter.yoy_growth.toFixed(1)}%
                                        </span>
                                      ) : (
                                        <span className="text-xs opacity-40">-</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                <div className="flex items-center gap-2 justify-end">
                                  {revenue.map((quarter, idx) => (
                                    <div
                                      key={idx}
                                      className="flex flex-col items-center gap-0.5 min-w-[65px]"
                                    >
                                      {quarter.qoq_growth !== null &&
                                      quarter.qoq_growth !== undefined ? (
                                        <span
                                          className={`text-xs font-medium ${
                                            quarter.qoq_growth >= 0 ? 'text-success' : 'text-error'
                                          }`}
                                        >
                                          {quarter.qoq_growth >= 0 ? '+' : ''}
                                          {quarter.qoq_growth.toFixed(1)}%
                                        </span>
                                      ) : (
                                        <span className="text-xs opacity-40">-</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm opacity-40">-</span>
                            )}
                          </td>
                        )}
                        {visibleColumns.orderBook && (
                          <td className="text-right">
                            <span className="text-sm">{formatNumber(orderBook)}</span>
                          </td>
                        )}
                        <td>
                          <svg
                            className="w-4 h-4 opacity-40"
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

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-base-200">
                <p className="text-sm opacity-60">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}-
                  {Math.min(currentPage * ITEMS_PER_PAGE, totalResults)} of {totalResults}
                </p>
                <div className="join">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="join-item btn btn-sm"
                  >
                    Previous
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`join-item btn btn-sm ${currentPage === page ? 'btn-active' : ''}`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="join-item btn btn-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        <p className="text-2xs text-base-content/40 mt-4 pt-3 border-t border-base-200">
          Data source: NSE India & BSE India. Click exchange tag to view on StockScans.
        </p>
      </div>
    </div>
  );
}
