import { useState, useEffect, useRef } from "react";
import { stockAPI } from "../../lib/api";
import LoadingSpinner from "../common/LoadingSpinner";
import _isNil from "lodash/isNil";

export default function CashFlows({ symbol }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("quarterly");
  const [resultType, setResultType] = useState("consolidated");
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    const fetchCashFlows = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await stockAPI.getQuarterlyResults(symbol);
        if (response.data.success) {
          setData(response.data.data);
        } else {
          setError("Failed to fetch cash flows");
        }
      } catch (err) {
        console.error("Error fetching cash flows:", err);
        setError("Unable to load cash flows");
      } finally {
        setLoading(false);
      }
    };

    if (symbol) {
      fetchCashFlows();
    }
  }, [symbol]);

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
          cash_from_operating: 0,
          cash_from_investing: 0,
          cash_from_financing: 0,
          net_cash_flow: 0,
        };
      }

      // Sum cash flows for the year
      yearlyMap[key].cash_from_operating += q.cash_from_operating || 0;
      yearlyMap[key].cash_from_investing += q.cash_from_investing || 0;
      yearlyMap[key].cash_from_financing += q.cash_from_financing || 0;
      yearlyMap[key].net_cash_flow += q.net_cash_flow || 0;
    });

    // Add TTM
    const sortedQuarters = [...quarters].sort(
      (a, b) => new Date(b.to_date) - new Date(a.to_date)
    );

    const consolidatedQuarters = sortedQuarters.filter((q) => q.consolidated);
    const standaloneQuarters = sortedQuarters.filter((q) => !q.consolidated);

    [
      { quarters: consolidatedQuarters, consolidated: true },
      { quarters: standaloneQuarters, consolidated: false },
    ].forEach(({ quarters: qList, consolidated }) => {
      if (qList.length >= 4) {
        const last4 = qList.slice(0, 4);
        yearlyMap[`9999_${consolidated}`] = {
          fiscal_year: 9999,
          year: "TTM",
          consolidated,
          isTTM: true,
          cash_from_operating: last4.reduce(
            (sum, q) => sum + (q.cash_from_operating || 0),
            0
          ),
          cash_from_investing: last4.reduce(
            (sum, q) => sum + (q.cash_from_investing || 0),
            0
          ),
          cash_from_financing: last4.reduce(
            (sum, q) => sum + (q.cash_from_financing || 0),
            0
          ),
          net_cash_flow: last4.reduce((sum, q) => sum + (q.net_cash_flow || 0), 0),
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
        No cash flow data available
      </div>
    );
  }

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

  const hasConsolidated = allQuarters.some((q) => q.consolidated);
  const hasStandalone = allQuarters.some((q) => !q.consolidated);

  const rows = [
    {
      key: "cash_from_operating",
      label: "Cash from Operating Activity",
      format: formatValue,
      expandable: true,
    },
    {
      key: "cash_from_investing",
      label: "Cash from Investing Activity",
      format: formatValue,
      expandable: true,
    },
    {
      key: "cash_from_financing",
      label: "Cash from Financing Activity",
      format: formatValue,
      expandable: true,
    },
    {
      key: "net_cash_flow",
      label: "Net Cash Flow",
      format: formatValue,
      bold: true,
    },
  ];

  return (
    <div>
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Cash Flows ({periods.length} {viewMode === "quarterly" ? "quarters" : "years"})
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
                Cash Flow Item
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
            {rows.map((row, rowIndex) => (
              <tr
                key={row.key}
                className={
                  row.bold
                    ? "bg-gray-100 font-semibold"
                    : rowIndex % 2 === 0
                    ? "bg-white"
                    : "bg-gray-50"
                }
              >
                <td
                  className={`sticky left-0 z-10 px-4 py-3 text-sm ${
                    row.bold ? "font-bold" : "font-medium"
                  } text-gray-900 border-r bg-inherit`}
                >
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
                    className={`px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap ${
                      row.bold ? "font-bold" : ""
                    }`}
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
        Note: Cash flow data integration in progress. Currently showing placeholder structure.
      </p>
    </div>
  );
}

