/**
 * Download and copy action buttons.
 * Provides Download All PDFs and Copy JSON buttons for order data.
 * @module components/stock/orders/OrderDownloads
 */

/**
 * Download All and Copy JSON action buttons.
 * @param {Object} props
 * @param {function} props.onDownloadAll - Download all PDFs handler
 * @param {function} props.onCopyJSON - Copy JSON to clipboard handler
 * @param {boolean} props.downloading - Download in progress
 * @param {Object} props.downloadProgress - { current, total }
 * @param {boolean} props.copySuccess - Copy succeeded state
 */
export default function OrderDownloads({
  onDownloadAll,
  onCopyJSON,
  downloading,
  downloadProgress,
  copySuccess,
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onDownloadAll}
        disabled={downloading}
        className={`btn btn-secondary btn-sm ${downloading ? 'btn-disabled' : ''}`}
        title="Download all PDFs"
      >
        {downloading ? (
          <>
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
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
            {downloadProgress.total > 0
              ? `${downloadProgress.current}/${downloadProgress.total}`
              : 'Preparing...'}
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download All
          </>
        )}
      </button>
      <button
        onClick={onCopyJSON}
        className={`btn btn-sm ${copySuccess ? 'btn-success' : 'btn-outline'}`}
        title="Copy JSON data to clipboard"
      >
        {copySuccess ? (
          <>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            Copied!
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            Copy JSON
          </>
        )}
      </button>
    </div>
  );
}
