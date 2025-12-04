import { useState, useEffect } from "react";
import { stockAPI } from "../../lib/api";
import LoadingSpinner from "../common/LoadingSpinner";

export default function OrderBook({ symbol }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchOrderBook = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await stockAPI.getOrderBook(symbol);
        if (response.data.success) {
          setData(response.data.data);
        } else {
          setError("Failed to fetch order book");
        }
      } catch (err) {
        console.error("Error fetching order book:", err);
        setError("Unable to load order book");
      } finally {
        setLoading(false);
      }
    };

    if (symbol) {
      fetchOrderBook();
    }
  }, [symbol]);

  const formatCurrency = (value) => {
    if (value === null || value === undefined) return "-";
    return `₹${value.toLocaleString("en-IN", {
      maximumFractionDigits: 0,
    })} Cr`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  if (loading) return <LoadingSpinner size="sm" />;

  if (error) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const summary = data.orderBookSummary;
  const quality = data.qualityMetrics;
  const events = data.recentEvents || [];

  const growthColor = summary.orderBookGrowthCr >= 0 ? "text-green-600" : "text-red-600";
  const growthSign = summary.orderBookGrowthCr >= 0 ? "+" : "";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          Order Book Analysis
        </h3>
        <p className="text-xs text-gray-500">
          Pending order book as of {formatDate(data.reportMetadata.dataAsOf)}
        </p>
      </div>

      {/* Main Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Latest Reported */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-sm text-blue-600 mb-1">Latest Reported</div>
          <div className="text-2xl font-bold text-blue-900 mb-1">
            {formatCurrency(summary.latestReportedOrderBookCr)}
          </div>
          <div className="text-xs text-blue-700">
            As of {formatDate(summary.latestReportDate)}
          </div>
          <div className="text-xs text-blue-600 mt-1">
            Source: {summary.latestReportSource}
          </div>
        </div>

        {/* Inflow & Completion */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-2">Changes Since Report</div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600">Inflow:</span>
              <span className="text-sm font-semibold text-green-600">
                +{formatCurrency(summary.inflowSinceReportCr)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600">Completion:</span>
              <span className="text-sm font-semibold text-red-600">
                -{formatCurrency(summary.completionSinceReportCr)}
              </span>
            </div>
          </div>
        </div>

        {/* Calculated Pending */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="text-sm text-purple-600 mb-1">Calculated Pending</div>
          <div className="text-2xl font-bold text-purple-900 mb-1">
            {formatCurrency(summary.calculatedPendingOrderBookCr)}
          </div>
          <div className={`text-sm font-semibold ${growthColor} mb-1`}>
            {growthSign}
            {formatCurrency(summary.orderBookGrowthCr)} ({growthSign}
            {summary.orderBookGrowthPercentage.toFixed(1)}%)
          </div>
          <div className="text-xs text-purple-600">
            Confidence: {(quality.overallConfidenceScore * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Recent Events */}
      {events.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-3">
            Recent Order Events
          </h4>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Running Total
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {events.map((event, index) => {
                    const isInflow = event.type === "order_inflow";
                    const sign = isInflow ? "+" : "-";
                    const amountColor = isInflow
                      ? "text-green-600"
                      : "text-red-600";

                    return (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                          {formatDate(event.date)}
                        </td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              isInflow
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {event.type.replace(/_/g, " ").toUpperCase()}
                          </span>
                        </td>
                        <td
                          className={`px-4 py-3 text-sm font-semibold text-right whitespace-nowrap ${amountColor}`}
                        >
                          {sign}
                          {formatCurrency(event.amountCr)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 max-w-md truncate">
                          {event.description}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right whitespace-nowrap">
                          {formatCurrency(event.runningTotalCr)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Info Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <svg
            className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="text-sm text-blue-800">
            <strong>Note:</strong> Order book data is calculated by tracking
            order inflows, completions, and cancellations from the latest
            reported order book. The confidence score reflects data recency,
            completeness, and source diversity. This is sample data - in
            production, it will be populated from annual/quarterly reports and
            corporate announcements.
          </div>
        </div>
      </div>

      {/* Quality Metrics */}
      <div className="text-xs text-gray-500 flex items-center gap-4">
        <span>Events Analyzed: {quality.eventsAnalyzed}</span>
        <span>•</span>
        <span>
          Report Date: {formatDate(data.reportMetadata.generatedDate)}
        </span>
      </div>
    </div>
  );
}

