/**
 * Quarter-wise breakdown view.
 * Displays last 8 quarters with order/transcript counts and download per quarter.
 * @module components/stock/orders/QuarterView
 */

import LoadingSpinner from '../../common/LoadingSpinner';
import { formatDate } from './orderUtils';

/**
 * Quarter-wise breakdown with download buttons.
 * @param {Object} props
 * @param {Object[]} props.quarters - Quarter data from API
 * @param {boolean} props.loading - Loading state
 * @param {string|null} props.downloadingQuarter - Period label of quarter being downloaded
 * @param {function} props.onDownloadQuarter - Download handler (quarter) => void
 */
export default function QuarterView({ quarters, loading, downloadingQuarter, onDownloadQuarter }) {
  if (loading) {
    return <LoadingSpinner size="sm" text="Loading quarters data..." />;
  }

  if (quarters.length === 0) {
    return (
      <div className="text-center py-8 opacity-50">
        <p>No quarters data available</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {quarters.map((quarter) => (
        <div
          key={quarter.periodLabel}
          className="finance-card hover:shadow-lg transition-shadow"
        >
          <div className="card-body p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-lg font-bold">{quarter.periodLabel}</h4>
                <p className="text-xs opacity-50 mt-1">
                  {formatDate(quarter.startDate)} - {formatDate(quarter.endDate)}
                </p>
              </div>
              <button
                onClick={() => onDownloadQuarter(quarter)}
                disabled={
                  downloadingQuarter === quarter.periodLabel ||
                  (quarter.totalOrders === 0 && quarter.totalTranscripts === 0)
                }
                className={`btn btn-secondary btn-sm ${
                  downloadingQuarter === quarter.periodLabel ||
                  (quarter.totalOrders === 0 && quarter.totalTranscripts === 0)
                    ? 'btn-disabled'
                    : ''
                }`}
                title={
                  quarter.totalOrders === 0 && quarter.totalTranscripts === 0
                    ? 'No data available'
                    : 'Download all files'
                }
              >
                {downloadingQuarter === quarter.periodLabel ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
                    Downloading...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Download
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-info/10 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <svg
                    className="w-4 h-4 text-info"
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
                  <span className="text-xs font-medium text-info">Orders</span>
                </div>
                <div className="text-2xl font-bold">{quarter.totalOrders}</div>
              </div>

              <div className="bg-secondary/10 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <svg
                    className="w-4 h-4 text-secondary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                    />
                  </svg>
                  <span className="text-xs font-medium text-secondary">Transcripts</span>
                </div>
                <div className="text-2xl font-bold">{quarter.totalTranscripts}</div>
              </div>
            </div>

            {(quarter.orders.length > 0 || quarter.transcripts.length > 0) && (
              <div className="space-y-2">
                {quarter.transcripts.length > 0 && (
                  <div className="text-xs opacity-60">
                    <span className="font-semibold">Recent transcripts:</span>
                    <ul className="mt-1 ml-4 list-disc">
                      {quarter.transcripts.slice(0, 2).map((t, idx) => (
                        <li key={idx} className="truncate">
                          {t.attachment_text || t.subject}
                        </li>
                      ))}
                      {quarter.transcripts.length > 2 && (
                        <li className="opacity-50">+{quarter.transcripts.length - 2} more...</li>
                      )}
                    </ul>
                  </div>
                )}
                {quarter.orders.length > 0 && (
                  <div className="text-xs opacity-60">
                    <span className="font-semibold">Recent orders:</span>
                    <ul className="mt-1 ml-4 list-disc">
                      {quarter.orders.slice(0, 2).map((o, idx) => (
                        <li key={idx} className="truncate">
                          {formatDate(o.announcement_date)}
                        </li>
                      ))}
                      {quarter.orders.length > 2 && (
                        <li className="opacity-50">+{quarter.orders.length - 2} more...</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {quarter.totalOrders === 0 && quarter.totalTranscripts === 0 && (
              <div className="text-center py-4 opacity-50 text-sm">No data available</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
