/**
 * Loading spinner with finance-grade styling
 * @param {Object} props
 * @param {'sm'|'md'|'lg'} [props.size='md'] - Spinner size
 * @param {string} [props.text] - Optional loading text
 */
export default function LoadingSpinner({ size = 'md', text = '' }) {
  const sizeClass = { sm: 'loading-sm', md: 'loading-md', lg: 'loading-lg' }[size];

  return (
    <div className="flex flex-col items-center justify-center py-10">
      <span className={`loading loading-spinner text-secondary ${sizeClass}`} />
      {text && <p className="mt-3 text-sm text-base-content/40">{text}</p>}
    </div>
  );
}
