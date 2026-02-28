import { useState, useEffect, useRef } from 'react';
import { stockAPI } from '../../lib/api';
import LoadingSpinner from '../common/LoadingSpinner';
import { formatLargeNumber, formatPercentage } from '../../lib/utils/formatters';
import _isNil from 'lodash/isNil';

export default function QuarterlyResults({ symbol }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resultType, setResultType] = useState('consolidated'); // "consolidated" or "standalone"
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    const fetchQuarterlyResults = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await stockAPI.getQuarterlyResults(symbol);
        if (response.data.success) {
          setData(response.data.data);
        } else {
          setError('Failed to fetch quarterly results');
        }
      } catch (err) {
        console.error('Error fetching quarterly results:', err);
        setError('Unable to load quarterly results');
      } finally {
        setLoading(false);
      }
    };

    if (symbol) {
      fetchQuarterlyResults();
    }
  }, [symbol]);

  // Scroll to the right (latest quarter) when data loads or result type changes
  useEffect(() => {
    if (data && scrollContainerRef.current) {
      // Wait for the DOM to update, then scroll to the right
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
        }
      }, 100);
    }
  }, [data, resultType]);

  const formatValue = (value) => {
    if (value === null || value === undefined) return '-';
    // Don't convert to K format, just format with commas
    return value.toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  const formatBroadcastDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatGrowth = (value) => {
    if (value === null || value === undefined) return '-';
    const formatted = formatPercentage(value);
    const colorClass = value >= 0 ? 'text-success' : 'text-error';
    return <span className={colorClass}>{formatted}</span>;
  };

  if (loading) return <LoadingSpinner size="sm" />;

  if (error) {
    return <div className="text-center py-8 opacity-50">{error}</div>;
  }

  if (!data || !data.quarters || data.quarters.length === 0) {
    return <div className="text-center py-8 opacity-50">No quarterly results available</div>;
  }

  // Filter quarters based on selected type
  const allQuarters = data.quarters || [];
  const quarters = allQuarters.filter((q) =>
    resultType === 'consolidated' ? q.consolidated : !q.consolidated
  );

  // Check if both types exist
  const hasConsolidated = allQuarters.some((q) => q.consolidated);
  const hasStandalone = allQuarters.some((q) => !q.consolidated);

  // Define rows to display
  const rows = [
    { key: 'sales', label: 'Sales', format: formatValue },
    { key: 'expenses', label: 'Expenses', format: formatValue },
    { key: 'operating_profit', label: 'Operating Profit', format: formatValue },
    {
      key: 'opm_percent',
      label: 'OPM %',
      format: (v) => (!_isNil(v) ? `${v.toFixed(2)}%` : '-'),
    },
    { key: 'other_income', label: 'Other Income', format: formatValue },
    { key: 'interest', label: 'Interest', format: formatValue },
    { key: 'depreciation', label: 'Depreciation', format: formatValue },
    { key: 'pbt', label: 'Profit Before Tax', format: formatValue },
    {
      key: 'tax_percent',
      label: 'Tax %',
      format: (v) => (!_isNil(v) ? `${v.toFixed(2)}%` : '-'),
    },
    { key: 'net_profit', label: 'Net Profit', format: formatValue },
    {
      key: 'eps',
      label: 'EPS',
      format: (v) => (!_isNil(v) ? v.toFixed(2) : '-'),
    },
    {
      key: 'broadcast_date',
      label: 'Broadcast Time',
      format: formatBroadcastDate,
    },
  ];

  const growthRows = [
    {
      key: 'yoy_sales_growth',
      label: 'YoY Sales Growth %',
      format: formatGrowth,
    },
    {
      key: 'yoy_profit_growth',
      label: 'YoY Net Profit Growth %',
      format: formatGrowth,
    },
    {
      key: 'yoy_eps_growth',
      label: 'YoY EPS Growth %',
      format: formatGrowth,
    },
    {
      key: 'qoq_sales_growth',
      label: 'QoQ Sales Growth %',
      format: formatGrowth,
    },
    {
      key: 'qoq_profit_growth',
      label: 'QoQ Net Profit Growth %',
      format: formatGrowth,
    },
    {
      key: 'qoq_eps_growth',
      label: 'QoQ EPS Growth %',
      format: formatGrowth,
    },
  ];

  return (
    <div>
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Quarterly Results ({quarters.length} quarters)
            </h3>

            {/* Consolidated/Standalone Switcher */}
            {(hasConsolidated || hasStandalone) && (
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                {hasConsolidated && (
                  <button
                    onClick={() => setResultType('consolidated')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      resultType === 'consolidated'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Consolidated
                  </button>
                )}
                {hasStandalone && (
                  <button
                    onClick={() => setResultType('standalone')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      resultType === 'standalone'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Standalone
                  </button>
                )}
              </div>
            )}
          </div>

          {data.source_url && (
            <a
              href={data.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              View on NSE
            </a>
          )}
        </div>
        <p className="text-xs text-gray-500">Figures in Crores</p>
      </div>

      <div
        ref={scrollContainerRef}
        className="overflow-x-auto border rounded-lg"
        style={{ scrollBehavior: 'smooth' }}
      >
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">
                Metric
              </th>
              {quarters.map((quarter, index) => (
                <th
                  key={index}
                  className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                >
                  {quarter.period}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Main financial metrics */}
            {rows.map((row, rowIndex) => (
              <tr key={row.key} className={rowIndex % 2 === 0 ? 'bg-base-100' : 'bg-base-200/30'}>
                <td className="sticky left-0 z-10 px-4 py-3 text-sm font-medium border-r border-base-200 bg-inherit">
                  {row.label}
                </td>
                {quarters.map((quarter, index) => (
                  <td key={index} className="px-4 py-3 text-sm text-right whitespace-nowrap">
                    {row.format(quarter[row.key])}
                  </td>
                ))}
              </tr>
            ))}

            {/* Separator row */}
            <tr className="bg-gray-100">
              <td colSpan={quarters.length + 1} className="px-4 py-2">
                <div className="text-xs font-semibold text-gray-700 uppercase">Growth Metrics</div>
              </td>
            </tr>

            {/* Growth metrics */}
            {growthRows.map((row, rowIndex) => (
              <tr key={row.key} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="sticky left-0 z-10 px-4 py-3 text-sm font-medium text-gray-900 border-r bg-inherit">
                  {row.label}
                </td>
                {quarters.map((quarter, index) => (
                  <td
                    key={index}
                    className="px-4 py-3 text-sm text-right whitespace-nowrap font-semibold"
                  >
                    {row.format(quarter[row.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.source && (
        <p className="text-xs opacity-50 mt-2">
          Data source: {data.source}
          {data.cached && ' (cached)'}
        </p>
      )}

      <p className="text-xs opacity-40 mt-1 italic">
        💡 Scroll left to view older quarters. Latest quarter shown on the right.
      </p>
    </div>
  );
}
