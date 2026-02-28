import { useState, useEffect, useRef, Fragment } from 'react';
import { stockAPI } from '../../lib/api';
import LoadingSpinner from '../common/LoadingSpinner';
import { formatPercentage } from '../../lib/utils/formatters';
import _isNil from 'lodash/isNil';

export default function FinancialResults({ symbol }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('quarterly'); // "quarterly" or "yearly"
  const [resultType, setResultType] = useState('consolidated');
  const [expandedRows, setExpandedRows] = useState({}); // Track expanded rows
  const scrollContainerRef = useRef(null);

  const toggleRowExpansion = (key) => {
    setExpandedRows((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  useEffect(() => {
    const fetchResults = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await stockAPI.getQuarterlyResults(symbol);
        if (response.data.success) {
          const quarters = response.data.data.quarters || [];
          const yearlyData = aggregateToYearly(quarters);
          setData({ ...response.data.data, yearly: yearlyData });
        } else {
          setError('Failed to fetch financial results');
        }
      } catch (err) {
        console.error('Error fetching financial results:', err);
        setError('Unable to load financial results');
      } finally {
        setLoading(false);
      }
    };

    if (symbol) {
      fetchResults();
    }
  }, [symbol]);

  // Aggregate quarterly data into yearly (fiscal year basis)
  const aggregateToYearly = (quarters) => {
    const yearlyMap = {};
    const ttmData = {}; // TTM data by consolidated flag

    quarters.forEach((q) => {
      const fyMatch = q.period.match(/FY(\d{2})/);
      if (!fyMatch) return;

      const fiscal_year = parseInt('20' + fyMatch[1]);
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
          dividend_payout: null,
        };
      }

      yearlyMap[key].quarters.push(q);
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
      yearData.dividend_payout = null;
    });

    // Calculate TTM (Trailing Twelve Months) - last 4 quarters
    const sortedQuarters = [...quarters].sort((a, b) => new Date(b.to_date) - new Date(a.to_date));

    const consolidatedQuarters = sortedQuarters.filter((q) => q.consolidated);
    const standaloneQuarters = sortedQuarters.filter((q) => !q.consolidated);

    [
      { quarters: consolidatedQuarters, consolidated: true },
      { quarters: standaloneQuarters, consolidated: false },
    ].forEach(({ quarters: qList, consolidated }) => {
      if (qList.length >= 4) {
        const last4 = qList.slice(0, 4);
        ttmData[consolidated] = {
          fiscal_year: 9999,
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

    const allData = [...Object.values(yearlyMap), ...Object.values(ttmData)];
    return allData.sort((a, b) => a.fiscal_year - b.fiscal_year);
  };

  // Scroll to the right when data loads or settings change
  useEffect(() => {
    if (data && scrollContainerRef.current) {
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
        }
      }, 100);
    }
  }, [data, viewMode, resultType]);

  const formatValue = (value) => {
    if (value === null || value === undefined) return '-';
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
    return <div className="text-center py-8 opacity-50">No financial results available</div>;
  }

  // Prepare periods based on view mode
  const allQuarters = data.quarters || [];
  let periods, periodLabel;

  if (viewMode === 'quarterly') {
    periods = allQuarters.filter((q) =>
      resultType === 'consolidated' ? q.consolidated : !q.consolidated
    );
    periodLabel = 'quarters';
  } else {
    const yearly = data.yearly || [];
    periods = yearly.filter((y) =>
      resultType === 'consolidated' ? y.consolidated : !y.consolidated
    );
    periodLabel = 'years';

    // Calculate YoY growth for yearly data
    periods.forEach((year, index) => {
      if (!year.isTTM && index > 0) {
        const prevYear = periods[index - 1];
        if (!prevYear.isTTM) {
          if (prevYear.sales && prevYear.sales !== 0) {
            year.yoy_sales_growth =
              ((year.sales - prevYear.sales) / Math.abs(prevYear.sales)) * 100;
          }
          if (prevYear.net_profit && prevYear.net_profit !== 0) {
            year.yoy_profit_growth =
              ((year.net_profit - prevYear.net_profit) / Math.abs(prevYear.net_profit)) * 100;
          }
        }
      }

      if (year.isTTM && index > 0) {
        const prevYear = periods[index - 1];
        if (!prevYear.isTTM) {
          if (prevYear.sales && prevYear.sales !== 0) {
            year.yoy_sales_growth =
              ((year.sales - prevYear.sales) / Math.abs(prevYear.sales)) * 100;
          }
          if (prevYear.net_profit && prevYear.net_profit !== 0) {
            year.yoy_profit_growth =
              ((year.net_profit - prevYear.net_profit) / Math.abs(prevYear.net_profit)) * 100;
          }
        }
      }
    });
  }

  const hasConsolidated = allQuarters.some((q) => q.consolidated);
  const hasStandalone = allQuarters.some((q) => !q.consolidated);

  // Define rows based on view mode with expandable sub-rows
  const financialRows = [
    {
      key: 'sales',
      label: 'Sales',
      format: formatValue,
      expandable: true,
      subRows:
        viewMode === 'quarterly'
          ? [
              { key: 'yoy_sales_growth', label: 'YoY Growth %', format: formatGrowth },
              { key: 'qoq_sales_growth', label: 'QoQ Growth %', format: formatGrowth },
            ]
          : [{ key: 'yoy_sales_growth', label: 'YoY Growth %', format: formatGrowth }],
    },
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
    {
      key: 'net_profit',
      label: 'Net Profit',
      format: formatValue,
      expandable: true,
      subRows:
        viewMode === 'quarterly'
          ? [
              { key: 'yoy_profit_growth', label: 'YoY Growth %', format: formatGrowth },
              { key: 'qoq_profit_growth', label: 'QoQ Growth %', format: formatGrowth },
            ]
          : [{ key: 'yoy_profit_growth', label: 'YoY Growth %', format: formatGrowth }],
    },
    {
      key: 'eps',
      label: 'EPS',
      format: (v) => (!_isNil(v) ? v.toFixed(2) : '-'),
      expandable: viewMode === 'quarterly',
      subRows:
        viewMode === 'quarterly'
          ? [
              { key: 'yoy_eps_growth', label: 'YoY Growth %', format: formatGrowth },
              { key: 'qoq_eps_growth', label: 'QoQ Growth %', format: formatGrowth },
            ]
          : [],
    },
  ];

  // Add broadcast date for quarterly view
  if (viewMode === 'quarterly') {
    financialRows.push({
      key: 'broadcast_date',
      label: 'Broadcast Time',
      format: formatBroadcastDate,
    });
  }

  // Add dividend payout for yearly view
  if (viewMode === 'yearly') {
    financialRows.push({
      key: 'dividend_payout',
      label: 'Dividend Payout %',
      format: (v) => (!_isNil(v) ? `${v.toFixed(2)}%` : '-'),
    });
  }

  return (
    <div>
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold">
              Financial Results ({periods.length} {periodLabel})
            </h3>

            {/* Quarterly/Yearly Toggle */}
            <div className="join">
              <button
                onClick={() => setViewMode('quarterly')}
                className={`btn btn-xs ${viewMode === 'quarterly' ? 'btn-secondary' : 'btn-ghost'}`}
              >
                Quarterly
              </button>
              <button
                onClick={() => setViewMode('yearly')}
                className={`btn btn-xs ${viewMode === 'yearly' ? 'btn-secondary' : 'btn-ghost'}`}
              >
                Yearly
              </button>
            </div>

            {/* Consolidated/Standalone Switcher */}
            {(hasConsolidated || hasStandalone) && (
              <div className="join">
                {hasConsolidated && (
                  <button
                    onClick={() => setResultType('consolidated')}
                    className={`btn btn-xs ${
                      resultType === 'consolidated' ? 'btn-secondary' : 'btn-ghost'
                    }`}
                  >
                    Consolidated
                  </button>
                )}
                {hasStandalone && (
                  <button
                    onClick={() => setResultType('standalone')}
                    className={`btn btn-xs ${
                      resultType === 'standalone' ? 'btn-secondary' : 'btn-ghost'
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
              className="link link-primary text-sm"
            >
              View on NSE
            </a>
          )}
        </div>
        <p className="text-xs opacity-50">Figures in Crores</p>
      </div>

      <div
        ref={scrollContainerRef}
        className="overflow-x-auto border border-base-200 rounded-lg"
        style={{ scrollBehavior: 'smooth' }}
      >
        <table className="table table-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-base-200/30 px-4 py-3 text-left text-xs font-medium opacity-50 uppercase tracking-wider border-r border-base-200">
                Metric
              </th>
              {periods.map((period, index) => (
                <th
                  key={index}
                  className="px-4 py-3 text-right text-xs font-medium opacity-50 uppercase tracking-wider whitespace-nowrap"
                >
                  {viewMode === 'quarterly' ? period.period : period.year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Main financial metrics with expandable sub-rows */}
            {financialRows.map((row, rowIndex) => (
              <Fragment key={row.key}>
                <tr className={rowIndex % 2 === 0 ? '' : 'bg-base-200/30'}>
                  <td className="sticky left-0 z-10 px-4 py-3 text-sm font-medium border-r border-base-200 bg-inherit">
                    <div className="flex items-center gap-2">
                      {row.expandable && row.subRows?.length > 0 ? (
                        <button
                          onClick={() => toggleRowExpansion(row.key)}
                          className="btn btn-ghost btn-xs w-5 h-5 min-h-0 min-w-0 p-0 opacity-50 hover:opacity-100"
                          title={expandedRows[row.key] ? 'Collapse' : 'Expand'}
                        >
                          {expandedRows[row.key] ? (
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M20 12H4"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 4v16m8-8H4"
                              />
                            </svg>
                          )}
                        </button>
                      ) : (
                        <span className="w-5" />
                      )}
                      {row.label}
                    </div>
                  </td>
                  {periods.map((period, index) => (
                    <td
                      key={index}
                      className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap"
                    >
                      {row.format(period[row.key])}
                    </td>
                  ))}
                </tr>

                {/* Sub-rows for expandable metrics */}
                {row.expandable &&
                  expandedRows[row.key] &&
                  row.subRows?.map((subRow) => (
                    <tr key={subRow.key} className="bg-blue-50">
                      <td className="sticky left-0 z-20 px-4 py-2 text-sm text-gray-600 border-r bg-blue-50">
                        <div className="flex items-center gap-2">
                          <span className="w-5" />
                          <span className="pl-2 border-l-2 border-blue-300">{subRow.label}</span>
                        </div>
                      </td>
                      {periods.map((period, index) => (
                        <td
                          key={index}
                          className="px-4 py-2 text-sm text-right whitespace-nowrap font-semibold"
                        >
                          {subRow.format(period[subRow.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
              </Fragment>
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
        💡 Scroll left to view older {periodLabel}. Latest{' '}
        {viewMode === 'quarterly' ? 'quarter' : 'year'} shown on the right.
      </p>
    </div>
  );
}
