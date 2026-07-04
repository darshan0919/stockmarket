/**
 * Order announcements list view (non-AI mode).
 * Displays raw order announcements with filters, transcript banner, and download actions.
 * @module components/stock/orders/OrderAnnouncements
 */

import { formatDate, timeAgo } from './orderUtils';
import OrderDownloads from './OrderDownloads';

/**
 * Banner showing latest earnings call transcript and unannounced quarter info.
 * @param {Object} props
 * @param {Object|null} props.transcript - Latest transcript data
 * @param {Object|null} props.unannouncedQuarterInfo - Quarter info for filtering
 * @param {function} props.formatDateFn - Date formatter
 */
export function TranscriptBanner({ transcript, unannouncedQuarterInfo, formatDateFn }) {
  if (!transcript) return null;

  const transcriptUrl = transcript.attachment_url || null;

  return (
    <div className="card bg-primary/5 border border-primary/20 shadow-sm mb-6">
      <div className="card-body p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/10 rounded-xl">
              <svg
                className="w-7 h-7 text-primary"
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
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-1">Latest Earnings Call Transcript</h4>
              <p className="text-xs text-primary mb-2">
                Announced on {formatDateFn(transcript.announcement_date)}
              </p>
              {unannouncedQuarterInfo && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-lg">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="text-xs font-medium">
                    Showing orders for{' '}
                    <span className="font-bold">{unannouncedQuarterInfo.periodLabel}</span>
                    <span className="opacity-80 ml-1">
                      (from {formatDateFn(unannouncedQuarterInfo.startDate)} onwards)
                    </span>
                  </span>
                </div>
              )}
            </div>
          </div>
          {transcriptUrl && (
            <a
              href={transcriptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              View Transcript
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Empty state when no orders are found.
 * @param {Object} props
 * @param {string} [props.message] - Custom message
 */
export function EmptyState({ message }) {
  return (
    <div className="text-center py-12">
      <svg
        className="w-16 h-16 mx-auto mb-4 opacity-30"
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
      <h3 className="text-lg font-medium mb-1 opacity-80">No orders found</h3>
      <p className="text-sm opacity-50">
        {message || 'No order announcements are available for this company.'}
      </p>
    </div>
  );
}

/**
 * Table row for non-AI order (no parsed details).
 * @param {Object} props
 * @param {Object} props.order - Order announcement data
 */
function NonAIOrderRow({ order }) {
  const { announcement_date, description, attachment_url, subject, attachment_text } = order;

  return (
    <tr className="hover">
      <td className="whitespace-nowrap">
        <div className="text-sm font-medium">{formatDate(announcement_date)}</div>
        <div className="text-xs opacity-50">{timeAgo(announcement_date)}</div>
      </td>
      <td>
        <div className="text-sm font-medium max-w-md">{subject || 'Order Announcement'}</div>
      </td>
      <td>
        <div className="text-sm opacity-80 max-w-lg">
          <p className="line-clamp-2">{attachment_text || description || '-'}</p>
        </div>
      </td>
      <td className="whitespace-nowrap text-right">
        <div className="flex items-center justify-end gap-2">
          {attachment_url ? (
            <a
              href={attachment_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm btn-outline"
              title="View announcement PDF"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              View PDF
            </a>
          ) : (
            <span className="text-sm opacity-50">No attachment</span>
          )}
        </div>
      </td>
    </tr>
  );
}

/**
 * Order announcements list with transcript banner, stats, baseline doc, and table.
 * @param {Object} props
 * @param {Object|null} props.transcript - Latest transcript
 * @param {Object|null} props.unannouncedQuarterInfo - Unannounced quarter info
 * @param {Object[]} props.orders - Sorted orders to display
 * @param {string|null} props.baselineDocumentUrl - Baseline document URL
 * @param {string|null} props.baselineDocumentTitle - Baseline document title
 * @param {function} props.onDownloadAll - Download all handler
 * @param {function} props.onCopyJSON - Copy JSON handler
 * @param {boolean} props.downloading - Download in progress
 * @param {Object} props.downloadProgress - { current, total }
 * @param {boolean} props.copySuccess - Copy succeeded state
 * @param {string} props.sortBy - Sort column
 * @param {string} props.sortOrder - Sort direction
 * @param {function} props.onSort - Sort handler
 */
export default function OrderAnnouncements({
  transcript,
  unannouncedQuarterInfo,
  orders,
  baselineDocumentUrl,
  baselineDocumentTitle,
  onDownloadAll,
  onCopyJSON,
  downloading,
  downloadProgress,
  copySuccess,
  sortBy,
  sortOrder,
  onSort,
}) {
  return (
    <>
      <TranscriptBanner
        transcript={transcript}
        unannouncedQuarterInfo={unannouncedQuarterInfo}
        formatDateFn={formatDate}
      />

      {orders.length === 0 ? (
        <EmptyState message="No order announcements found for this company." />
      ) : (
        <>
          <div className="alert alert-info">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <div>
                  <div className="text-2xl font-bold">{orders.length}</div>
                  <div className="text-sm font-medium">Order Announcements Found</div>
                  <div className="text-xs opacity-50 mt-1">
                    Click &quot;View PDF&quot; to see full details • Enable AI modes for automatic
                    parsing
                  </div>
                </div>
              </div>
              <OrderDownloads
                onDownloadAll={onDownloadAll}
                onCopyJSON={onCopyJSON}
                downloading={downloading}
                downloadProgress={downloadProgress}
                copySuccess={copySuccess}
              />
            </div>
          </div>

          {baselineDocumentUrl && (
            <div className="card bg-primary/5 border border-primary/20 shadow-sm">
              <div className="card-body p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <svg
                      className="w-8 h-8 text-primary"
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
                    <div>
                      <div className="text-sm font-semibold">Baseline Order Book Document</div>
                      <div className="text-xs text-primary mt-1">{baselineDocumentTitle}</div>
                    </div>
                  </div>
                  <a
                    href={baselineDocumentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                    View Document
                  </a>
                </div>
              </div>
            </div>
          )}

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
                  <th>Subject</th>
                  <th>Description</th>
                  <th className="text-right">Document</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <NonAIOrderRow key={order.id} order={order} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
