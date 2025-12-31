import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { ordersAPI } from "../../lib/api";
import LoadingSpinner from "../common/LoadingSpinner";

// Format currency value
const formatCurrency = (value, unit = "Crore", currency = "INR") => {
  if (value === null || value === undefined) return "-";

  const symbol = currency === "USD" ? "$" : "₹";
  const formattedValue = value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });

  return `${symbol}${formattedValue} ${unit}`;
};

// Format capacity value
const formatCapacity = (capacity) => {
  if (!capacity || !capacity.value) return "-";
  return `${capacity.value.toLocaleString("en-IN")} ${capacity.unit}`;
};

// Format date
const formatDate = (dateStr) => {
  if (!dateStr) return "-";

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch (e) {
    return dateStr;
  }
};

// Time ago helper
const timeAgo = (dateStr) => {
  if (!dateStr) return "";

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";

    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  } catch (e) {
    return "";
  }
};

// Format time duration
const formatDuration = (ms) => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
};

// Get current fiscal quarter info based on actual date
// India follows April-March fiscal year
// Q1 = Apr-Jun, Q2 = Jul-Sep, Q3 = Oct-Dec, Q4 = Jan-Mar
const getCurrentFiscalQuarter = (date = new Date()) => {
  const month = date.getMonth(); // 0-11
  const year = date.getFullYear();

  let quarter, fiscalYear, startDate, endDate;

  if (month >= 3 && month <= 5) {
    // Apr-Jun = Q1
    quarter = 1;
    fiscalYear = year + 1; // FY26 for Apr 2025
    startDate = new Date(year, 3, 1); // Apr 1
    endDate = new Date(year, 5, 30, 23, 59, 59); // Jun 30
  } else if (month >= 6 && month <= 8) {
    // Jul-Sep = Q2
    quarter = 2;
    fiscalYear = year + 1;
    startDate = new Date(year, 6, 1); // Jul 1
    endDate = new Date(year, 8, 30, 23, 59, 59); // Sep 30
  } else if (month >= 9 && month <= 11) {
    // Oct-Dec = Q3
    quarter = 3;
    fiscalYear = year + 1;
    startDate = new Date(year, 9, 1); // Oct 1
    endDate = new Date(year, 11, 31, 23, 59, 59); // Dec 31
  } else {
    // Jan-Mar = Q4
    quarter = 4;
    fiscalYear = year;
    startDate = new Date(year, 0, 1); // Jan 1
    endDate = new Date(year, 2, 31, 23, 59, 59); // Mar 31
  }

  const fiscalYearShort = String(fiscalYear).slice(-2);
  const periodLabel = `Q${quarter} FY${fiscalYearShort}`;

  return {
    quarter,
    fiscalYear,
    periodLabel,
    startDate,
    endDate,
  };
};

// Check if a date falls within the current fiscal quarter
const isInCurrentQuarter = (dateStr) => {
  if (!dateStr) return false;

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return false;

    const { startDate, endDate } = getCurrentFiscalQuarter();
    return date >= startDate && date <= endDate;
  } catch (e) {
    return false;
  }
};

// Order Row Component
const OrderRow = ({ order, onParsePdf, isParsing, showParseButton = true }) => {
  const {
    order_details,
    announcement_date,
    description,
    attachment_url,
    pdf_parsed,
    confidence_score,
  } = order;
  const orderValue = order_details?.order_value;
  const orderCapacity = order_details?.order_capacity;

  const hasValue = orderValue?.amount || orderValue?.value_in_crore_inr;

  return (
    <tr className="hover:bg-slate-50 transition-colors">
      {/* Date */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="text-sm font-medium text-slate-900">
          {formatDate(announcement_date)}
        </div>
        <div className="text-xs text-slate-500">
          {timeAgo(announcement_date)}
        </div>
      </td>

      {/* Order Amount */}
      <td className="px-4 py-3 whitespace-nowrap text-right">
        {hasValue ? (
          <div className="text-sm font-semibold text-emerald-600">
            {formatCurrency(
              orderValue.value_in_crore_inr || orderValue.amount,
              orderValue.unit || "Crore",
              orderValue.currency || "INR"
            )}
          </div>
        ) : (
          <span className="text-sm text-slate-400">-</span>
        )}
      </td>

      {/* Capacity/Unit */}
      <td className="px-4 py-3 whitespace-nowrap text-center">
        {orderCapacity ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            {formatCapacity(orderCapacity)}
          </span>
        ) : (
          <span className="text-sm text-slate-400">-</span>
        )}
      </td>

      {/* Customer */}
      <td className="px-4 py-3">
        <div className="text-sm text-slate-900 max-w-xs truncate">
          {order_details?.customer_name || "-"}
        </div>
        {order_details?.customer_type && (
          <span className="text-xs text-slate-500">
            {order_details.customer_type}
          </span>
        )}
      </td>

      {/* Description */}
      <td className="px-4 py-3">
        <div className="text-sm text-slate-700 max-w-md">
          <p className="line-clamp-2">
            {order_details?.project_description || description || "-"}
          </p>
        </div>
      </td>

      {/* Status & Actions */}
      <td className="px-4 py-3 whitespace-nowrap text-right">
        <div className="flex items-center justify-end gap-2">
          {/* Parsing status indicator */}
          {pdf_parsed ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
              <svg
                className="w-3.5 h-3.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              {confidence_score
                ? `${(confidence_score * 100).toFixed(0)}%`
                : "Parsed"}
            </span>
          ) : showParseButton && attachment_url ? (
            <button
              onClick={() => onParsePdf(order)}
              disabled={isParsing}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded transition-colors disabled:opacity-50"
            >
              {isParsing ? (
                <>
                  <svg
                    className="w-3 h-3 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Parsing...
                </>
              ) : (
                <>
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Parse PDF
                </>
              )}
            </button>
          ) : null}

          {/* PDF link */}
          {attachment_url && (
            <a
              href={attachment_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
              title="View PDF"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          )}
        </div>
      </td>
    </tr>
  );
};

// Empty State Component
const EmptyState = ({ message }) => (
  <div className="text-center py-12">
    <svg
      className="w-16 h-16 mx-auto mb-4 text-slate-300"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
      />
    </svg>
    <h3 className="text-lg font-medium text-slate-700 mb-1">No orders found</h3>
    <p className="text-sm text-slate-500">
      {message || "No order announcements are available for this company."}
    </p>
  </div>
);

// Order Inflow Summary Component (shows both total and current quarter)
const OrderInflowSummary = ({ orders, totalValue }) => {
  const currentQuarter = getCurrentFiscalQuarter();

  // Filter orders for current quarter and sum their values
  const currentQuarterOrders = orders.filter((order) =>
    isInCurrentQuarter(order.announcement_date)
  );

  const currentQuarterValue = currentQuarterOrders.reduce((sum, order) => {
    return sum + (order.order_details?.order_value?.value_in_crore_inr || 0);
  }, 0);

  const currentQuarterCount = currentQuarterOrders.filter(
    (o) => o.order_details?.order_value?.value_in_crore_inr
  ).length;

  // Don't show if no orders with values
  if (!totalValue && !currentQuarterValue) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Total Order Inflow */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-5 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <h4 className="text-sm font-semibold uppercase tracking-wider">
                Total Order Inflow
              </h4>
            </div>
            <div className="text-3xl font-bold">
              {formatCurrency(totalValue || 0)}
            </div>
            <p className="text-white/70 text-xs mt-1">
              From all parsed announcements
            </p>
          </div>
          <div className="hidden sm:block">
            <svg
              className="w-14 h-14 text-white/20"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Current Quarter Inflow */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl p-5 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
              <h4 className="text-sm font-semibold uppercase tracking-wider">
                {currentQuarter.periodLabel} Inflow
              </h4>
            </div>
            <div className="text-3xl font-bold">
              {formatCurrency(currentQuarterValue)}
            </div>
            <p className="text-white/70 text-xs mt-1">
              {currentQuarterCount} order{currentQuarterCount !== 1 ? "s" : ""}{" "}
              this quarter
            </p>
          </div>
          <div className="hidden sm:block">
            <svg
              className="w-14 h-14 text-white/20"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

// Order Book Summary Component
const OrderBookSummary = ({
  summary,
  segmentBreakdown,
  orderBookCommentary,
}) => {
  if (!summary) return null;

  return (
    <div className="space-y-6">
      {/* Main Order Book Card */}
      <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex items-center gap-2 mb-4">
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <h3 className="text-lg font-semibold">Outstanding Order Book</h3>
        </div>

        <div className="text-4xl font-bold mb-2">
          {formatCurrency(summary.accumulated_order_book_crores)}
        </div>

        <p className="text-white/80 text-sm mb-6">
          Total pending orders (Baseline + New Orders)
        </p>

        {/* Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="text-white/70 text-xs uppercase tracking-wider mb-1">
              Baseline Order Book
            </div>
            <div className="text-xl font-bold">
              {formatCurrency(summary.baseline_order_book_crores)}
            </div>
            <div className="text-white/60 text-xs mt-1">
              As of {formatDate(summary.baseline_as_of_date)}
            </div>
            <div className="text-white/60 text-xs">
              {summary.baseline_reporting_period}
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="text-white/70 text-xs uppercase tracking-wider mb-1">
              New Orders Since
            </div>
            <div className="text-xl font-bold text-emerald-300">
              +{formatCurrency(summary.new_orders_since_baseline_crores)}
            </div>
            <div className="text-white/60 text-xs mt-1">
              {summary.new_orders_count} order announcements
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="text-white/70 text-xs uppercase tracking-wider mb-1">
              Source Document
            </div>
            <div className="text-sm font-medium">{summary.baseline_source}</div>
            <div className="text-white/60 text-xs mt-1 line-clamp-2">
              {summary.baseline_document}
            </div>
          </div>
        </div>
      </div>

      {/* Management Commentary on Order Book */}
      {orderBookCommentary && (
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
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
            <div>
              <p className="text-sm font-medium text-blue-900 mb-1">
                Management Commentary
              </p>
              <p className="text-sm text-blue-800">{orderBookCommentary}</p>
            </div>
          </div>
        </div>
      )}

      {/* Note about calculation */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <svg
            className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div className="text-sm text-amber-800">
            <strong>Note:</strong> {summary.calculation_note}
          </div>
        </div>
      </div>

      {/* Segment Breakdown */}
      {segmentBreakdown && segmentBreakdown.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-slate-900 mb-4">
            Segment Breakdown (from baseline)
          </h4>
          <div className="space-y-3">
            {segmentBreakdown.map((segment, index) => (
              <div key={index} className="flex justify-between items-center">
                <span className="text-sm text-slate-600">
                  {segment.segment_name}
                </span>
                <span className="text-sm font-semibold text-slate-900">
                  {formatCurrency(segment.value_crores)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default function OrdersTab({ symbol }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("orderbook"); // orderbook | all
  const [parsingOrderId, setParsingOrderId] = useState(null);
  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");

  // Order book specific state
  const [orderbookData, setOrderbookData] = useState(null);

  // Timing and cache stats
  const [timing, setTiming] = useState(null);
  const [cacheStats, setCacheStats] = useState(null);
  const [clientFetchTime, setClientFetchTime] = useState(null);

  // Fallback notification when orderbook baseline not found
  const [orderbookFallbackMessage, setOrderbookFallbackMessage] =
    useState(null);
  const [orderbookFallbackDetails, setOrderbookFallbackDetails] =
    useState(null);

  // Fetch orders based on view mode
  const fetchData = async (mode = viewMode) => {
    if (!symbol) return;

    const fetchStartTime = Date.now();

    try {
      setLoading(true);
      setError(null);
      setTiming(null);
      setCacheStats(null);
      setClientFetchTime(null);
      setOrderbookData(null);
      // Only clear fallback message if explicitly switching modes (not during fallback)
      if (mode !== "all" || viewMode !== "orderbook") {
        setOrderbookFallbackMessage(null);
        setOrderbookFallbackDetails(null);
      }

      let response;
      if (mode === "orderbook") {
        // No limit - fetch all outstanding orders
        response = await ordersAPI.getOrderbook(symbol);
      } else {
        response = await ordersAPI.getFullParsed(symbol, 50);
      }

      const clientTime = Date.now() - fetchStartTime;
      setClientFetchTime(clientTime);

      if (response.data.success) {
        if (mode === "orderbook") {
          setOrderbookData(response.data.data);
          setOrders(response.data.data.new_orders || []);
        } else {
          setOrders(response.data.data.orders || []);
        }

        if (response.data.data.timing) {
          setTiming(response.data.data.timing);
        }
        if (response.data.data.cache_stats) {
          setCacheStats(response.data.data.cache_stats);
        }
      } else {
        // If orderbook mode fails (no baseline found), automatically switch to "all" view
        if (mode === "orderbook") {
          console.log(
            "Orderbook baseline not found, switching to all orders view:",
            response.data.error
          );
          // Set fallback message to notify user
          setOrderbookFallbackMessage(
            response.data.message ||
              "Order book baseline not found for this company. Showing all order announcements instead."
          );
          // Store details for more info display
          setOrderbookFallbackDetails({
            documentsChecked: response.data.documents_checked,
            documentsFetched: response.data.documents_fetched,
            parseErrors: response.data.parse_errors,
          });
          setViewMode("all");
          // Recursively fetch with "all" mode
          await fetchData("all");
          return;
        }
        setError(response.data.error || "Failed to fetch data");
      }
    } catch (err) {
      console.error("Error fetching data:", err);
      setError("Unable to load data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [symbol]);

  // Handle external site navigation
  const handleStockScansClick = () => {
    if (symbol) {
      // NSE format: NSE:SYMBOL
      const exchangeSymbol = `NSE%3A${encodeURIComponent(symbol)}`;
      const stockScansUrl = `https://www.stockscans.in/company/${exchangeSymbol}/standalone#reports`;
      window.open(stockScansUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleScreenerClick = () => {
    if (symbol) {
      const screenerUrl = `https://www.screener.in/company/${encodeURIComponent(
        symbol
      )}/#documents`;
      window.open(screenerUrl, "_blank", "noopener,noreferrer");
    }
  };

  // Handle view mode change
  const handleViewModeChange = async (newMode) => {
    if (newMode === viewMode) return;
    setViewMode(newMode);
    // Clear fallback message and details when manually switching
    setOrderbookFallbackMessage(null);
    setOrderbookFallbackDetails(null);
    await fetchData(newMode);
  };

  // Handle individual PDF parsing
  const handleParsePdf = async (order) => {
    if (!order.attachment_url) return;

    setParsingOrderId(order.id);

    try {
      const response = await ordersAPI.parsePdf(symbol, order.attachment_url);

      if (response.data.success) {
        const parsedData = response.data.data.parsed_data;

        setOrders((prevOrders) =>
          prevOrders.map((o) => {
            if (o.id === order.id) {
              const pdfDetails = parsedData?.order_details || {};
              return {
                ...o,
                pdf_parsed: parsedData?.extraction_success || false,
                confidence_score: parsedData?.confidence_score || 0,
                order_details: {
                  ...o.order_details,
                  order_value:
                    pdfDetails.order_value || o.order_details?.order_value,
                  order_capacity:
                    pdfDetails.order_capacity ||
                    o.order_details?.order_capacity,
                  customer_name:
                    pdfDetails.customer_name || o.order_details?.customer_name,
                  customer_type:
                    pdfDetails.customer_type || o.order_details?.customer_type,
                  order_type:
                    pdfDetails.order_type || o.order_details?.order_type,
                  project_description:
                    pdfDetails.project_description ||
                    o.order_details?.project_description,
                },
              };
            }
            return o;
          })
        );
      }
    } catch (err) {
      console.error("Error parsing PDF:", err);
    } finally {
      setParsingOrderId(null);
    }
  };

  // Sort orders
  const sortedOrders = useMemo(() => {
    const sorted = [...orders];

    sorted.sort((a, b) => {
      if (sortBy === "date") {
        const dateA = new Date(a.announcement_date || 0);
        const dateB = new Date(b.announcement_date || 0);
        return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
      } else if (sortBy === "amount") {
        const amountA = a.order_details?.order_value?.value_in_crore_inr || 0;
        const amountB = b.order_details?.order_value?.value_in_crore_inr || 0;
        return sortOrder === "desc" ? amountB - amountA : amountA - amountB;
      }
      return 0;
    });

    return sorted;
  }, [orders, sortBy, sortOrder]);

  // Toggle sort
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(column);
      setSortOrder("desc");
    }
  };

  if (loading) {
    return (
      <LoadingSpinner
        size="sm"
        text={
          viewMode === "orderbook"
            ? "Loading order book... This may take a moment as we analyze reports."
            : "Loading orders..."
        }
      />
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-500 mb-2">{error}</div>
        <button
          onClick={() => fetchData()}
          className="px-4 py-2 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-lg font-semibold text-gray-900">
              {viewMode === "orderbook"
                ? "Order Book Analysis"
                : "All Order Announcements"}
            </h3>
            {/* External Links */}
            <div className="flex items-center gap-1.5">
              {/* StockScans Button */}
              <button
                onClick={handleStockScansClick}
                className="inline-flex items-center justify-center p-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
                title="View on StockScans"
              >
                <Image
                  src="/icons/stockscans.png"
                  alt="StockScans"
                  width={18}
                  height={18}
                  className="object-contain"
                />
              </button>
              {/* Screener Button */}
              <button
                onClick={handleScreenerClick}
                className="inline-flex items-center justify-center p-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
                title="View on Screener"
              >
                <Image
                  src="/icons/screener.png"
                  alt="Screener"
                  width={18}
                  height={18}
                  className="object-contain"
                />
              </button>
            </div>
          </div>
          <p className="text-sm text-slate-500">
            {viewMode === "orderbook"
              ? "Outstanding unexecuted order book from latest reports + new orders"
              : "All corporate announcements for received orders and contracts"}
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-sm text-slate-600">View:</span>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            <button
              onClick={() => handleViewModeChange("orderbook")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === "orderbook"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Order Book
            </button>
            <button
              onClick={() => handleViewModeChange("all")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === "all"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All Orders
            </button>
          </div>
        </div>
      </div>

      {/* Fallback notification when orderbook baseline not found */}
      {orderbookFallbackMessage && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">
                Order Book Baseline Not Available
              </p>
              <p className="text-sm text-amber-700 mt-1">
                {orderbookFallbackMessage}
              </p>
              {orderbookFallbackDetails && (
                <div className="mt-3 text-xs text-amber-600 space-y-1">
                  {orderbookFallbackDetails.documentsFetched && (
                    <p>
                      Documents found:{" "}
                      {orderbookFallbackDetails.documentsFetched
                        .annual_reports || 0}{" "}
                      annual reports,{" "}
                      {orderbookFallbackDetails.documentsFetched
                        .investor_presentations || 0}{" "}
                      investor presentations,{" "}
                      {orderbookFallbackDetails.documentsFetched
                        .financial_results || 0}{" "}
                      financial results
                    </p>
                  )}
                  {orderbookFallbackDetails.documentsChecked &&
                    orderbookFallbackDetails.documentsChecked.length > 0 && (
                      <div>
                        <p className="font-medium">Documents analyzed:</p>
                        <ul className="list-disc list-inside ml-2 mt-1">
                          {orderbookFallbackDetails.documentsChecked
                            .slice(0, 3)
                            .map((doc, i) => (
                              <li key={i} className="truncate max-w-md">
                                {doc}
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                </div>
              )}
            </div>
            <button
              onClick={() => {
                setOrderbookFallbackMessage(null);
                setOrderbookFallbackDetails(null);
              }}
              className="text-amber-400 hover:text-amber-600 transition-colors"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Timing & Cache Stats Banner */}
      {clientFetchTime && !loading && (
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-xl p-4 text-white">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-lg">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <div className="text-xs text-slate-300 uppercase tracking-wider">
                  Total Load Time
                </div>
                <div className="text-2xl font-bold">
                  {formatDuration(clientFetchTime)}
                </div>
              </div>
            </div>

            {cacheStats && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-lg">
                  <svg
                    className="w-4 h-4 text-emerald-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div>
                    <div className="text-xs text-slate-400">Cache Hits</div>
                    <div className="font-semibold">
                      {cacheStats.cache_hits} ({cacheStats.cache_hit_rate}%)
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-lg">
                  <svg
                    className="w-4 h-4 text-amber-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div>
                    <div className="text-xs text-slate-400">Fresh Parses</div>
                    <div className="font-semibold">
                      {cacheStats.cache_misses}
                    </div>
                  </div>
                </div>
                {cacheStats.baseline_from_cache !== undefined && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-lg">
                    <svg
                      className="w-4 h-4 text-blue-400"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                      <path
                        fillRule="evenodd"
                        d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <div>
                      <div className="text-xs text-slate-400">Baseline</div>
                      <div className="font-semibold">
                        {cacheStats.baseline_from_cache ? "Cached" : "Fresh"}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Order Inflow Summary (shown in both views - computed from actual data) */}
      {sortedOrders.length > 0 && (
        <OrderInflowSummary
          orders={sortedOrders}
          totalValue={sortedOrders.reduce(
            (sum, o) =>
              sum + (o.order_details?.order_value?.value_in_crore_inr || 0),
            0
          )}
        />
      )}

      {/* Order Book View */}
      {viewMode === "orderbook" && orderbookData && (
        <>
          <OrderBookSummary
            summary={orderbookData.orderbook_summary}
            segmentBreakdown={orderbookData.segment_breakdown}
            orderBookCommentary={orderbookData.order_book_commentary}
          />

          {/* New Orders Section */}
          {sortedOrders.length > 0 && (
            <div className="mt-8">
              <h4 className="text-lg font-semibold text-slate-900 mb-4">
                New Orders Since{" "}
                {formatDate(
                  orderbookData.orderbook_summary?.baseline_as_of_date
                )}
              </h4>
              <p className="text-sm text-slate-500 mb-4">
                {orderbookData.total_announcements_after_baseline} order
                announcements found after baseline date
              </p>

              {/* Orders Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th
                          className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                          onClick={() => handleSort("date")}
                        >
                          <div className="flex items-center gap-1">
                            Date
                            {sortBy === "date" && (
                              <svg
                                className={`w-3 h-3 ${
                                  sortOrder === "asc" ? "rotate-180" : ""
                                }`}
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </div>
                        </th>
                        <th
                          className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                          onClick={() => handleSort("amount")}
                        >
                          <div className="flex items-center justify-end gap-1">
                            Amount
                            {sortBy === "amount" && (
                              <svg
                                className={`w-3 h-3 ${
                                  sortOrder === "asc" ? "rotate-180" : ""
                                }`}
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </div>
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          Capacity
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          Customer
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          Description
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {sortedOrders.map((order) => (
                        <OrderRow
                          key={order.id}
                          order={order}
                          onParsePdf={handleParsePdf}
                          isParsing={parsingOrderId === order.id}
                          showParseButton={false}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* All Orders View */}
      {viewMode === "all" && (
        <>
          {sortedOrders.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="text-sm font-medium text-blue-600 mb-1">
                    Total Orders
                  </div>
                  <div className="text-2xl font-bold text-slate-900">
                    {sortedOrders.length}
                  </div>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <div className="text-sm font-medium text-emerald-600 mb-1">
                    With Values
                  </div>
                  <div className="text-2xl font-bold text-slate-900">
                    {
                      sortedOrders.filter(
                        (o) => o.order_details?.order_value?.value_in_crore_inr
                      ).length
                    }
                  </div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                  <div className="text-sm font-medium text-purple-600 mb-1">
                    Total Value
                  </div>
                  <div className="text-2xl font-bold text-slate-900">
                    {formatCurrency(
                      sortedOrders.reduce(
                        (sum, o) =>
                          sum +
                          (o.order_details?.order_value?.value_in_crore_inr ||
                            0),
                        0
                      )
                    )}
                  </div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="text-sm font-medium text-amber-600 mb-1">
                    AI Parsed
                  </div>
                  <div className="text-2xl font-bold text-slate-900">
                    {sortedOrders.filter((o) => o.pdf_parsed).length}/
                    {sortedOrders.length}
                  </div>
                </div>
              </div>

              {/* Orders Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th
                          className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                          onClick={() => handleSort("date")}
                        >
                          <div className="flex items-center gap-1">
                            Date
                            {sortBy === "date" && (
                              <svg
                                className={`w-3 h-3 ${
                                  sortOrder === "asc" ? "rotate-180" : ""
                                }`}
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </div>
                        </th>
                        <th
                          className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                          onClick={() => handleSort("amount")}
                        >
                          <div className="flex items-center justify-end gap-1">
                            Amount
                            {sortBy === "amount" && (
                              <svg
                                className={`w-3 h-3 ${
                                  sortOrder === "asc" ? "rotate-180" : ""
                                }`}
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </div>
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          Capacity
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          Customer
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          Description
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {sortedOrders.map((order) => (
                        <OrderRow
                          key={order.id}
                          order={order}
                          onParsePdf={handleParsePdf}
                          isParsing={parsingOrderId === order.id}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Attribution */}
      <p className="text-xs text-gray-500 mt-6">
        Data source: NSE India corporate announcements & reports. Order values
        are extracted using AI from official filings.
      </p>
    </div>
  );
}
