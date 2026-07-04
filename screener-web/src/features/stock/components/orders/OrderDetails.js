/**
 * Order row component for displaying parsed PDF/order details.
 * Used in All Orders (AI) and Order Book views.
 * @module components/stock/orders/OrderDetails
 */

import { formatCurrency, formatCapacity, formatDate, timeAgo } from './orderUtils';

/**
 * Table row displaying a single order with parsed details (amount, capacity, customer, etc.).
 * @param {Object} props
 * @param {Object} props.order - Order with order_details from AI parsing
 * @param {function} props.onParsePdf - Handler to parse PDF when not yet parsed
 * @param {boolean} props.isParsing - Whether this order is currently being parsed
 * @param {boolean} [props.showParseButton=true] - Whether to show Parse PDF button
 */
export default function OrderRow({ order, onParsePdf, isParsing, showParseButton = true }) {
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
    <tr className="hover">
      <td className="whitespace-nowrap">
        <div className="text-sm font-medium">{formatDate(announcement_date)}</div>
        <div className="text-xs opacity-50">{timeAgo(announcement_date)}</div>
      </td>

      <td className="whitespace-nowrap text-right">
        {hasValue ? (
          <div className="text-sm font-semibold text-success">
            {formatCurrency(
              orderValue.value_in_crore_inr || orderValue.amount,
              orderValue.unit || 'Crore',
              orderValue.currency || 'INR'
            )}
          </div>
        ) : (
          <span className="text-sm opacity-50">-</span>
        )}
      </td>

      <td className="whitespace-nowrap text-center">
        {orderCapacity ? (
          <span className="badge badge-sm badge-info">{formatCapacity(orderCapacity)}</span>
        ) : (
          <span className="text-sm opacity-50">-</span>
        )}
      </td>

      <td>
        <div className="text-sm max-w-xs truncate">{order_details?.customer_name || '-'}</div>
        {order_details?.customer_type && (
          <span className="text-xs opacity-50">{order_details.customer_type}</span>
        )}
      </td>

      <td>
        <div className="text-sm opacity-80 max-w-md">
          <p className="line-clamp-2">{order_details?.project_description || description || '-'}</p>
        </div>
      </td>

      <td className="whitespace-nowrap text-right">
        <div className="flex items-center justify-end gap-2">
          {pdf_parsed ? (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              {confidence_score ? `${(confidence_score * 100).toFixed(0)}%` : 'Parsed'}
            </span>
          ) : showParseButton && attachment_url ? (
            <button
              onClick={() => onParsePdf(order)}
              disabled={isParsing}
              className="btn btn-secondary btn-xs"
            >
              {isParsing ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
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

          {attachment_url && (
            <a
              href={attachment_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost btn-xs btn-square"
              title="View PDF"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
}
