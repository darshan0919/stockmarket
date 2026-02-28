/**
 * Snackbar/toast notification with finance-grade styling
 * @param {Object} props
 * @param {string} props.message - Message to display
 * @param {'success'|'error'|'info'|'warning'} [props.type='info'] - Alert type
 * @param {boolean} props.show - Whether to show the snackbar
 * @param {function} props.onClose - Close handler
 */
export default function Snackbar({ message, type = 'info', show, onClose }) {
  if (!show) return null;

  const styles = {
    success: 'bg-success text-success-content',
    error: 'bg-error text-error-content',
    info: 'bg-info text-info-content',
    warning: 'bg-warning text-warning-content',
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-[slideUp_0.3s_ease-out]">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg ${styles[type]}`}>
        <span className="text-sm font-medium">{message}</span>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors flex-shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
