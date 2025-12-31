import { useState, useEffect, useRef } from 'react';
import { stockAPI } from '../../lib/api';
import LoadingSpinner from '../common/LoadingSpinner';
import { formatPercentage } from '../../lib/utils/formatters';
import _isNil from 'lodash/isNil';

export default function YearlyResults({ symbol }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resultType, setResultType] = useState('consolidated');
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    const fetchYearlyResults = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await stockAPI.getQuarterlyResults(symbol);
        if (response.data.success) {
          // Aggregate quarterly data into yearly
          const quarters = response.data.data.quarters || [];
          const yearlyData = aggregateToYearly(quarters);
          setData({ ...response.data.data, yearly: yearlyData });
        } else {
          setError('Failed to fetch yearly results');
        }
      } catch (err) {
        console.error('Error fetching yearly results:', err);
        setError('Unable to load yearly results');
      } finally {
        setLoading(false);
      }
    };

    if (symbol) {
      fetchYearlyResults();
    }
  }, [symbol]);

  // Aggregate quarterly data into yearly (fiscal year basis)
  const aggregateToYearly = (quarters) => {
    const yearlyMap = {};
    const ttmData = {}; // TTM data by consolidated flag

    quarters.forEach((q) => {
      // Extract fiscal year from period (e.g., "Q1 FY25" -> 2025)
      const fyMatch = q.period.match(/FY(\d{2})/);
      if (!fyMatch) return;

      const fiscal_year = parseInt('20' + fyMatch[1]); // Convert FY25 to 2025
      const consolidated = q.consolidated;
      const key = `${fiscal_year}_${consolidated}`;

      if (!yearlyMap[key]) {
        yearlyMap[key] = {
          fiscal_year,
          year: `FY${fyMatch[1]}`,
          consolidated,
          quarters: [],
          sales: 0,
          expenses: 0,
          operating_profit: 0,
          other_income: 0,
          interest: 0,
          depreciation: 0,
          pbt: 0,
          net_profit: 0,
          eps: 0,
          dividend_payout: null, // Will need to be fetched separately or calculated
        };
      }

      yearlyMap[key].quarters.push(q);
      // Sum up the values
      yearlyMap[key].sales += q.sales || 0;
      yearlyMap[key].expenses += q.expenses || 0;
      yearlyMap[key].operating_profit += q.operating_profit || 0;
      yearlyMap[key].other_income += q.other_income || 0;
      yearlyMap[key].interest += q.interest || 0;
      yearlyMap[key].depreciation += q.depreciation || 0;
      yearlyMap[key].pbt += q.pbt || 0;
      yearlyMap[key].net_profit += q.net_profit || 0;
      yearlyMap[key].eps += q.eps || 0;
    });

    // Calculate OPM% and Tax% for each year
    Object.values(yearlyMap).forEach((yearData) => {
      if (yearData.sales > 0) {
        yearData.opm_percent = (yearData.operating_profit / yearData.sales) * 100;
      }
      if (yearData.pbt > 0) {
        const tax = yearData.pbt - yearData.net_profit;
        yearData.tax_percent = (tax / yearData.pbt) * 100;
      }
      // Calculate dividend payout % (Net Profit basis)
      // This would ideally come from actual dividend data
      // For now, we'll leave it as null or calculate if dividend data is available
      yearData.dividend_payout = null;
    });

    // Calculate TTM (Trailing Twelve Months) - last 4 quarters
    const sortedQuarters = [...quarters].sort((a, b) => new Date(b.to_date) - new Date(a.to_date));

    // Group by consolidated flag
    const consolidatedQuarters = sortedQuarters.filter((q) => q.consolidated);
    const standaloneQuarters = sortedQuarters.filter((q) => !q.consolidated);

    [
      { quarters: consolidatedQuarters, consolidated: true },
      { quarters: standaloneQuarters, consolidated: false },
    ].forEach(({ quarters: qList, consolidated }) => {
      if (qList.length >= 4) {
        const last4 = qList.slice(0, 4);
        ttmData[consolidated] = {
          fiscal_year: 9999, // Ensure it's sorted last
          year: 'TTM',
          consolidated,
          isTTM: true,
          quarters: last4,
          sales: last4.reduce((sum, q) => sum + (q.sales || 0), 0),
          expenses: last4.reduce((sum, q) => sum + (q.expenses || 0), 0),
          operating_profit: last4.reduce((sum, q) => sum + (q.operating_profit || 0), 0),
          other_income: last4.reduce((sum, q) => sum + (q.other_income || 0), 0),
          interest: last4.reduce((sum, q) => sum + (q.interest || 0), 0),
          depreciation: last4.reduce((sum, q) => sum + (q.depreciation || 0), 0),
          pbt: last4.reduce((sum, q) => sum + (q.pbt || 0), 0),
          net_profit: last4.reduce((sum, q) => sum + (q.net_profit || 0), 0),
          eps: last4.reduce((sum, q) => sum + (q.eps || 0), 0),
          dividend_payout: null,
        };

        // Calculate OPM% and Tax% for TTM
        if (ttmData[consolidated].sales > 0) {
          ttmData[consolidated].opm_percent =
            (ttmData[consolidated].operating_profit / ttmData[consolidated].sales) * 100;
        }
        if (ttmData[consolidated].pbt > 0) {
          const tax = ttmData[consolidated].pbt - ttmData[consolidated].net_profit;
          ttmData[consolidated].tax_percent = (tax / ttmData[consolidated].pbt) * 100;
        }
      }
    });

    // Combine yearly data with TTM
    const allData = [...Object.values(yearlyMap), ...Object.values(ttmData)];

    // Sort by fiscal year
    return allData.sort((a, b) => a.fiscal_year - b.fiscal_year);
  };

  // Scroll to the right (latest year) when data loads or result type changes
  useEffect(() => {
    if (data && scrollContainerRef.current) {
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
        }
      }, 100);
    }
  }, [data, resultType]);

  const formatValue = (value) => {
    if (value === null || value === undefined) return '-';
    return value.toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  const formatGrowth = (value) => {
    if (value === null || value === undefined) return '-';
    const formatted = formatPercentage(value);
    const colorClass = value >= 0 ? 'text-green-600' : 'text-red-600';
    return <span className={colorClass}>{formatted}</span>;
  };

  if (loading) return <LoadingSpinner size="sm" />;

  if (error) {
    return <div className="text-center py-8 text-gray-500">{error}</div>;
  }

  if (!data || !data.yearly || data.yearly.length === 0) {
    return <div className="text-center py-8 text-gray-500">No yearly results available</div>;
  }

  // Filter years based on selected type
  const allYears = data.yearly || [];
  const years = allYears.filter((y) =>
    resultType === 'consolidated' ? y.consolidated : !y.consolidated
  );

  // Check if both types exist
  const hasConsolidated = allYears.some((y) => y.consolidated);
  const hasStandalone = allYears.some((y) => !y.consolidated);

  // Calculate YoY growth (compare with previous fiscal year, exclude TTM from growth calc)
  years.forEach((year, index) => {
    if (!year.isTTM && index > 0) {
      const prevYear = years[index - 1];
      if (!prevYear.isTTM) {
        if (prevYear.sales && prevYear.sales !== 0) {
          year.yoy_sales_growth = ((year.sales - prevYear.sales) / Math.abs(prevYear.sales)) * 100;
        }
        if (prevYear.net_profit && prevYear.net_profit !== 0) {
          year.yoy_profit_growth =
            ((year.net_profit - prevYear.net_profit) / Math.abs(prevYear.net_profit)) * 100;
        }
      }
    }

    // For TTM, compare with previous full fiscal year
    if (year.isTTM && index > 0) {
      const prevYear = years[index - 1];
      if (!prevYear.isTTM) {
        if (prevYear.sales && prevYear.sales !== 0) {
          year.yoy_sales_growth = ((year.sales - prevYear.sales) / Math.abs(prevYear.sales)) * 100;
        }
        if (prevYear.net_profit && prevYear.net_profit !== 0) {
          year.yoy_profit_growth =
            ((year.net_profit - prevYear.net_profit) / Math.abs(prevYear.net_profit)) * 100;
        }
      }
    }
  });

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
      key: 'dividend_payout',
      label: 'Dividend Payout %',
      format: (v) => (!_isNil(v) ? `${v.toFixed(2)}%` : '-'),
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
  ];

  return (
    <div>
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Yearly Results ({years.length} years)
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
              {years.map((year, index) => (
                <th
                  key={index}
                  className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                >
                  {year.year}
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
                {years.map((year, index) => (
                  <td
                    key={index}
                    className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap"
                  >
                    {row.format(year[row.key])}
                  </td>
                ))}
              </tr>
            ))}

            {/* Separator row */}
            <tr className="bg-gray-100">
              <td colSpan={years.length + 1} className="px-4 py-2">
                <div className="text-xs font-semibold text-gray-700 uppercase">Growth Metrics</div>
              </td>
            </tr>

            {/* Growth metrics */}
            {growthRows.map((row, rowIndex) => (
              <tr key={row.key} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="sticky left-0 z-10 px-4 py-3 text-sm font-medium text-gray-900 border-r bg-inherit">
                  {row.label}
                </td>
                {years.map((year, index) => (
                  <td
                    key={index}
                    className="px-4 py-3 text-sm text-right whitespace-nowrap font-semibold"
                  >
                    {row.format(year[row.key])}
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
          {data.cached && ' (cached)'}
        </p>
      )}

      <p className="text-xs text-gray-400 mt-1 italic">
        💡 Scroll left to view older years. Latest year shown on the right.
      </p>
    </div>
  );
}
