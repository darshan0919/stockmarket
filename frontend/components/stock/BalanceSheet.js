import { useState, useEffect, useRef } from "react";
import { stockAPI } from "../../lib/api";
import LoadingSpinner from "../common/LoadingSpinner";
import _isNil from "lodash/isNil";

export default function BalanceSheet({ symbol }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("quarterly"); // "quarterly" or "yearly"
  const [resultType, setResultType] = useState("consolidated");
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    const fetchBalanceSheet = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await stockAPI.getQuarterlyResults(symbol);
        if (response.data.success) {
          setData(response.data.data);
        } else {
          setError("Failed to fetch balance sheet");
        }
      } catch (err) {
        console.error("Error fetching balance sheet:", err);
        setError("Unable to load balance sheet");
      } finally {
        setLoading(false);
      }
    };

    if (symbol) {
      fetchBalanceSheet();
    }
  }, [symbol]);

  // Scroll to the right when data loads or settings change
  useEffect(() => {
    if (data && scrollContainerRef.current) {
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollLeft =
            scrollContainerRef.current.scrollWidth;
        }
      }, 100);
    }
  }, [data, viewMode, resultType]);

  const formatValue = (value) => {
    if (value === null || value === undefined) return "-";
    return value.toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  // Aggregate quarterly data into yearly
  const aggregateToYearly = (quarters) => {
    const yearlyMap = {};

    quarters.forEach((q) => {
      const fyMatch = q.period.match(/FY(\d{2})/);
      if (!fyMatch) return;

      const fiscal_year = parseInt("20" + fyMatch[1]);
      const consolidated = q.consolidated;
      const key = `${fiscal_year}_${consolidated}`;

      if (!yearlyMap[key]) {
        yearlyMap[key] = {
          fiscal_year,
          year: `FY${fyMatch[1]}`,
          consolidated,
          // Just take the latest quarter's balance sheet values
          equity_capital: 0,
          reserves: 0,
          borrowings: 0,
          other_liabilities: 0,
          fixed_assets: 0,
          cwip: 0,
          investments: 0,
          other_assets: 0,
          latestQuarter: null,
        };
      }

      // Balance sheet is point-in-time, so we take the last quarter of each FY
      if (!yearlyMap[key].latestQuarter || q.quarter === 4) {
        yearlyMap[key].latestQuarter = q;
        // These values would come from the balance sheet data
        // For now, using placeholder logic
      }
    });

    // Add TTM (use latest quarter's balance sheet)
    const sortedQuarters = [...quarters].sort(
      (a, b) => new Date(b.to_date) - new Date(a.to_date)
    );

    const consolidatedQuarters = sortedQuarters.filter((q) => q.consolidated);
    const standaloneQuarters = sortedQuarters.filter((q) => !q.consolidated);

    [
      { quarters: consolidatedQuarters, consolidated: true },
      { quarters: standaloneQuarters, consolidated: false },
    ].forEach(({ quarters: qList, consolidated }) => {
      if (qList.length > 0) {
        const latest = qList[0];
        yearlyMap[`9999_${consolidated}`] = {
          fiscal_year: 9999,
          year: "TTM",
          consolidated,
          isTTM: true,
          latestQuarter: latest,
        };
      }
    });

    return Object.values(yearlyMap).sort((a, b) => a.fiscal_year - b.fiscal_year);
  };

  if (loading) return <LoadingSpinner size="sm" />;

  if (error) {
    return <div className="text-center py-8 text-gray-500">{error}</div>;
  }

  if (!data || !data.quarters || data.quarters.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No balance sheet data available
      </div>
    );
  }

  // Filter and prepare data based on view mode
  const allQuarters = data.quarters || [];
  let periods;

  if (viewMode === "quarterly") {
    periods = allQuarters.filter((q) =>
      resultType === "consolidated" ? q.consolidated : !q.consolidated
    );
  } else {
    const yearly = aggregateToYearly(allQuarters);
    periods = yearly.filter((y) =>
      resultType === "consolidated" ? y.consolidated : !y.consolidated
    );
  }

  // Check if both types exist
  const hasConsolidated = allQuarters.some((q) => q.consolidated);
  const hasStandalone = allQuarters.some((q) => !q.consolidated);

  // Define balance sheet rows (based on Screener.in)
  const liabilitiesRows = [
    { key: "equity_capital", label: "Equity Capital", format: formatValue },
    { key: "reserves", label: "Reserves", format: formatValue },
    { key: "borrowings", label: "Borrowings", format: formatValue, expandable: true },
    { key: "other_liabilities", label: "Other Liabilities", format: formatValue, expandable: true },
  ];

  const assetsRows = [
    { key: "fixed_assets", label: "Fixed Assets", format: formatValue, expandable: true },
    { key: "cwip", label: "CWIP", format: formatValue },
    { key: "investments", label: "Investments", format: formatValue },
    { key: "other_assets", label: "Other Assets", format: formatValue, expandable: true },
  ];

  const totalRows = [
    { key: "total_liabilities", label: "Total Liabilities", format: formatValue, bold: true },
    { key: "total_assets", label: "Total Assets", format: formatValue, bold: true },
  ];

  return (
    <div>
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Balance Sheet ({periods.length} {viewMode === "quarterly" ? "quarters" : "years"})
            </h3>

            {/* Quarterly/Yearly Toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode("quarterly")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  viewMode === "quarterly"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Quarterly
              </button>
              <button
                onClick={() => setViewMode("yearly")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  viewMode === "yearly"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Yearly
              </button>
            </div>

            {/* Consolidated/Standalone Switcher */}
            {(hasConsolidated || hasStandalone) && (
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                {hasConsolidated && (
                  <button
                    onClick={() => setResultType("consolidated")}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      resultType === "consolidated"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    Consolidated
                  </button>
                )}
                {hasStandalone && (
                  <button
                    onClick={() => setResultType("standalone")}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      resultType === "standalone"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    Standalone
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-500">Figures in Crores</p>
      </div>

      <div
        ref={scrollContainerRef}
        className="overflow-x-auto border rounded-lg"
        style={{ scrollBehavior: "smooth" }}
      >
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">
                Item
              </th>
              {periods.map((period, index) => (
                <th
                  key={index}
                  className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                >
                  {viewMode === "quarterly" ? period.period : period.year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {/* Liabilities Section */}
            <tr className="bg-blue-50">
              <td
                colSpan={periods.length + 1}
                className="px-4 py-2 text-sm font-semibold text-gray-700 uppercase"
              >
                Liabilities
              </td>
            </tr>
            {liabilitiesRows.map((row, rowIndex) => (
              <tr
                key={row.key}
                className={rowIndex % 2 === 0 ? "bg-white" : "bg-gray-50"}
              >
                <td className="sticky left-0 z-10 px-4 py-3 text-sm font-medium text-gray-900 border-r bg-inherit">
                  {row.label}
                  {row.expandable && (
                    <span className="ml-1 text-blue-500 cursor-pointer" title="Expandable">
                      +
                    </span>
                  )}
                </td>
                {periods.map((period, index) => (
                  <td
                    key={index}
                    className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap"
                  >
                    {row.format(period[row.key] || 0)}
                  </td>
                ))}
              </tr>
            ))}

            {/* Assets Section */}
            <tr className="bg-green-50">
              <td
                colSpan={periods.length + 1}
                className="px-4 py-2 text-sm font-semibold text-gray-700 uppercase"
              >
                Assets
              </td>
            </tr>
            {assetsRows.map((row, rowIndex) => (
              <tr
                key={row.key}
                className={rowIndex % 2 === 0 ? "bg-white" : "bg-gray-50"}
              >
                <td className="sticky left-0 z-10 px-4 py-3 text-sm font-medium text-gray-900 border-r bg-inherit">
                  {row.label}
                  {row.expandable && (
                    <span className="ml-1 text-blue-500 cursor-pointer" title="Expandable">
                      +
                    </span>
                  )}
                </td>
                {periods.map((period, index) => (
                  <td
                    key={index}
                    className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap"
                  >
                    {row.format(period[row.key] || 0)}
                  </td>
                ))}
              </tr>
            ))}

            {/* Totals Section */}
            <tr className="bg-gray-100">
              <td
                colSpan={periods.length + 1}
                className="px-4 py-2 text-sm font-semibold text-gray-700 uppercase"
              >
                Totals
              </td>
            </tr>
            {totalRows.map((row) => (
              <tr key={row.key} className="bg-gray-50 font-semibold">
                <td className="sticky left-0 z-10 px-4 py-3 text-sm font-bold text-gray-900 border-r bg-gray-50">
                  {row.label}
                </td>
                {periods.map((period, index) => (
                  <td
                    key={index}
                    className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap font-bold"
                  >
                    {row.format(period[row.key] || 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-2 italic">
        💡 Scroll left to view older periods. Latest period shown on the right.
      </p>

      <p className="text-xs text-gray-500 mt-1">
        Note: Balance sheet data integration in progress. Currently showing placeholder structure.
      </p>
    </div>
  );
}

