/**
 * Order book summary and new orders view.
 * Displays outstanding order book from reports plus new order announcements.
 * @module components/stock/orders/OrderBookView
 */

import {
  formatCurrency,
  formatDate,
  getCurrentFiscalQuarter,
  isInCurrentQuarter,
} from './orderUtils';
import OrderRow from './OrderDetails';

/**
 * Order inflow summary cards (total and current quarter).
 * @param {Object} props
 * @param {Object[]} props.orders - Orders with parsed values
 * @param {number} props.totalValue - Total order value sum
 */
export function OrderInflowSummary({ orders, totalValue }) {
  const currentQuarter = getCurrentFiscalQuarter();

  const currentQuarterOrders = orders.filter((order) =>
    isInCurrentQuarter(order.announcement_date)
  );

  const currentQuarterValue = currentQuarterOrders.reduce((sum, order) => {
    return sum + (order.order_details?.order_value?.value_in_crore_inr || 0);
  }, 0);

  const currentQuarterCount = currentQuarterOrders.filter(
    (o) => o.order_details?.order_value?.value_in_crore_inr
  ).length;

  if (!totalValue && !currentQuarterValue) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="card bg-primary text-primary-content shadow-lg">
        <div className="card-body p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <div className="text-3xl font-bold">{formatCurrency(totalValue || 0)}</div>
              <p className="text-primary-content/70 text-xs mt-1">From all parsed announcements</p>
            </div>
            <div className="hidden sm:block">
              <svg
                className="w-14 h-14 text-primary-content/20"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="card bg-success text-success-content shadow-lg">
        <div className="card-body p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <div className="text-3xl font-bold">{formatCurrency(currentQuarterValue)}</div>
              <p className="text-success-content/70 text-xs mt-1">
                {currentQuarterCount} order{currentQuarterCount !== 1 ? 's' : ''} this quarter
              </p>
            </div>
            <div className="hidden sm:block">
              <svg
                className="w-14 h-14 text-success-content/20"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Order book summary card with baseline, new orders, and segment breakdown.
 * @param {Object} props
 * @param {Object} props.summary - Orderbook summary data
 * @param {Object[]} [props.segmentBreakdown] - Segment breakdown array
 * @param {string} [props.orderBookCommentary] - Management commentary text
 */
function OrderBookSummary({ summary, segmentBreakdown, orderBookCommentary }) {
  if (!summary) return null;

  return (
    <div className="space-y-6">
      <div className="card bg-primary text-primary-content shadow-xl rounded-2xl">
        <div className="card-body p-6">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

          <p className="text-primary-content/80 text-sm mb-6">
            Total pending orders (Baseline + New Orders)
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-base-content/10 backdrop-blur-sm rounded-xl p-4">
              <div className="text-primary-content/70 text-xs uppercase tracking-wider mb-1">
                Baseline Order Book
              </div>
              <div className="text-xl font-bold">
                {formatCurrency(summary.baseline_order_book_crores)}
              </div>
              <div className="text-primary-content/60 text-xs mt-1">
                As of {formatDate(summary.baseline_as_of_date)}
              </div>
              <div className="text-primary-content/60 text-xs">
                {summary.baseline_reporting_period}
              </div>
            </div>

            <div className="bg-base-content/10 backdrop-blur-sm rounded-xl p-4">
              <div className="text-primary-content/70 text-xs uppercase tracking-wider mb-1">
                New Orders Since
              </div>
              <div className="text-xl font-bold text-success-content">
                +{formatCurrency(summary.new_orders_since_baseline_crores)}
              </div>
              <div className="text-primary-content/60 text-xs mt-1">
                {summary.new_orders_count} order announcements
              </div>
            </div>

            <div className="bg-base-content/10 backdrop-blur-sm rounded-xl p-4">
              <div className="text-primary-content/70 text-xs uppercase tracking-wider mb-1">
                Source Document
              </div>
              <div className="text-sm font-medium">{summary.baseline_source}</div>
              <div className="text-primary-content/60 text-xs mt-1 line-clamp-2">
                {summary.baseline_document}
              </div>
            </div>
          </div>
        </div>
      </div>

      {orderBookCommentary && (
        <div className="alert alert-info">
          <div className="flex items-start gap-2">
            <svg
              className="h-5 w-5 flex-shrink-0 mt-0.5"
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
              <p className="text-sm font-medium mb-1">Management Commentary</p>
              <p className="text-sm opacity-90">{orderBookCommentary}</p>
            </div>
          </div>
        </div>
      )}

      <div className="alert alert-warning">
        <div className="flex items-start gap-2">
          <svg
            className="h-5 w-5 flex-shrink-0 mt-0.5"
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
          <div className="text-sm">
            <strong>Note:</strong> {summary.calculation_note}
          </div>
        </div>
      </div>

      {segmentBreakdown && segmentBreakdown.length > 0 && (
        <div className="finance-card">
          <div className="card-body p-5">
            <h4 className="text-sm font-semibold mb-4">Segment Breakdown (from baseline)</h4>
            <div className="space-y-3">
              {segmentBreakdown.map((segment, index) => (
                <div key={index} className="flex justify-between items-center">
                  <span className="text-sm opacity-60">{segment.segment_name}</span>
                  <span className="text-sm font-semibold">
                    {formatCurrency(segment.value_crores)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Order book view: summary + new orders table.
 * @param {Object} props
 * @param {Object} props.orderbookData - Full orderbook API response
 * @param {Object[]} props.orders - New orders to display
 * @param {string} props.sortBy - Sort column
 * @param {string} props.sortOrder - Sort direction
 * @param {function} props.onSort - Sort handler
 * @param {function} props.onParsePdf - Parse PDF handler
 * @param {string|null} props.parsingOrderId - ID of order being parsed
 */
export default function OrderBookView({
  orderbookData,
  orders,
  sortBy,
  sortOrder,
  onSort,
  onParsePdf,
  parsingOrderId,
}) {
  const summary = orderbookData?.orderbook_summary;

  return (
    <>
      <OrderBookSummary
        summary={summary}
        segmentBreakdown={orderbookData?.segment_breakdown}
        orderBookCommentary={orderbookData?.order_book_commentary}
      />

      {orders.length > 0 && (
        <div className="mt-8">
          <h4 className="text-lg font-semibold mb-4">
            New Orders Since {formatDate(summary?.baseline_as_of_date)}
          </h4>
          <p className="text-sm opacity-50 mb-4">
            {orderbookData.total_announcements_after_baseline} order announcements found after
            baseline date
          </p>

          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th
                    className="cursor-pointer hover:bg-base-200/50"
                    onClick={() => onSort('date')}
                  >
                    <div className="flex items-center gap-1">
                      Date
                      {sortBy === 'date' && (
                        <svg
                          className={`w-3 h-3 ${sortOrder === 'asc' ? 'rotate-180' : ''}`}
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
                    className="text-right cursor-pointer hover:bg-base-200/50"
                    onClick={() => onSort('amount')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Amount
                      {sortBy === 'amount' && (
                        <svg
                          className={`w-3 h-3 ${sortOrder === 'asc' ? 'rotate-180' : ''}`}
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
                  <th className="text-center">Capacity</th>
                  <th>Customer</th>
                  <th>Description</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    onParsePdf={onParsePdf}
                    isParsing={parsingOrderId === order.id}
                    showParseButton={false}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
