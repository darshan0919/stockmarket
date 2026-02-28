import { useEffect, useRef } from 'react';

/**
 * Modal dialog with finance-grade styling
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {function} props.onClose - Close handler
 * @param {string} [props.title] - Modal title
 * @param {React.ReactNode} props.children - Modal content
 * @param {'sm'|'md'|'lg'|'xl'} [props.size='md'] - Modal width
 */
export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [isOpen]);

  const sizeClass = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
  }[size];

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <div className={`modal-box ${sizeClass} finance-card border-0 shadow-2xl`}>
        {title && (
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-base-200">
            <h3 className="text-base font-semibold">{title}</h3>
            <form method="dialog">
              <button className="w-7 h-7 rounded-lg flex items-center justify-center text-base-content/30 hover:text-base-content/60 hover:bg-base-200 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </form>
          </div>
        )}
        {children}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
}
