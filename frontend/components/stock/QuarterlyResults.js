import { useState, useEffect } from 'react';
import { stockAPI } from '../../lib/api';
import LoadingSpinner from '../common/LoadingSpinner';
import { formatLargeNumber, formatPercentage } from '../../lib/utils/formatters';

export default function QuarterlyResults({ symbol }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  const formatValue = (value) => {
    if (value === null || value === undefined) return '-';
    return formatLargeNumber(value);
  };

  const formatGrowth = (value) => {
    if (value === null || value === undefined) return '-';
    const formatted = formatPercentage(value);
    const colorClass = value >= 0 ? 'text-green-600' : 'text-red-600';
    return <span className={colorClass}>{formatted}</span>;
  };

  if (loading) return <LoadingSpinner size="sm" />;
  
  if (error) {
    return (
      <div className="text-center py-8 text-gray-500">
        {error}
      </div>
    );
  }
  
  if (!data || !data.quarters || data.quarters.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No quarterly results available
      </div>
    );
  }

  const quarters = data.quarters;

  // Define rows to display
  const rows = [
    { key: 'sales', label: 'Sales', format: formatValue },
    { key: 'expenses', label: 'Expenses', format: formatValue },
    { key: 'operating_profit', label: 'Operating Profit', format: formatValue },
    { key: 'opm_percent', label: 'OPM %', format: (v) => v !== null ? `${v.toFixed(2)}%` : '-' },
    { key: 'other_income', label: 'Other Income', format: formatValue },
    { key: 'interest', label: 'Interest', format: formatValue },
    { key: 'depreciation', label: 'Depreciation', format: formatValue },
    { key: 'pbt', label: 'Profit Before Tax', format: formatValue },
    { key: 'tax_percent', label: 'Tax %', format: (v) => v !== null ? `${v.toFixed(2)}%` : '-' },
    { key: 'net_profit', label: 'Net Profit', format: formatValue },
    { key: 'eps', label: 'EPS', format: (v) => v !== null ? v.toFixed(2) : '-' },
  ];

  const growthRows = [
    { key: 'yoy_sales_growth', label: 'YoY Sales Growth %', format: formatGrowth },
    { key: 'yoy_profit_growth', label: 'YoY Net Profit Growth %', format: formatGrowth },
    { key: 'qoq_sales_growth', label: 'QoQ Sales Growth %', format: formatGrowth },
    { key: 'qoq_profit_growth', label: 'QoQ Net Profit Growth %', format: formatGrowth },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Quarterly Results</h3>
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

      <div className="overflow-x-auto border rounded-lg">
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
          <tbody className="bg-white divide-y divide-gray-200">
            {/* Main financial metrics */}
            {rows.map((row, rowIndex) => (
              <tr key={row.key} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="sticky left-0 z-10 px-4 py-3 text-sm font-medium text-gray-900 border-r bg-inherit">
                  {row.label}
                </td>
                {quarters.map((quarter, index) => (
                  <td
                    key={index}
                    className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap"
                  >
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
        <p className="text-xs text-gray-500 mt-2">
          Data source: {data.source}
        </p>
      )}
    </div>
  );
}

