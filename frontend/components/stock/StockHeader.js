import {
  formatCurrency,
  formatChange,
  formatLargeNumber,
  getChangeColor,
} from '../../lib/utils/formatters';
import { useWatchlist } from '../../lib/hooks/useWatchlist';
import { useSnackbar } from '../../lib/contexts/SnackbarContext';

/**
 * Stock detail page header with price, watchlist toggle, and key info
 * @component
 * @see {@link docs/frontend/components/StockHeader.md} for documentation
 */
export default function StockHeader({ stock, latestPrice, change, changePercent }) {
  const { isInWatchlist, addToWatchlist, removeFromWatchlist } = useWatchlist();
  const { showSnackbar } = useSnackbar();
  const inWatchlist = isInWatchlist(stock.symbol);
  const isPositive = changePercent >= 0;

  const handleWatchlistToggle = async () => {
    if (inWatchlist) {
      const result = await removeFromWatchlist(stock.symbol);
      if (!result.success) showSnackbar(`Error: ${result.error}`, 'error');
    } else {
      const result = await addToWatchlist(stock.symbol);
      if (!result.success) showSnackbar(`Error: ${result.error}`, 'error');
    }
  };

  return (
    <div className="finance-card mb-5">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          {/* Left: Name + Price */}
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-base-content truncate">{stock.name}</h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-base-content/50">{stock.symbol}</span>
              {stock.sector && (
                <span className="finance-badge bg-base-200 text-base-content/60">
                  {stock.sector}
                </span>
              )}
              {stock.industry && (
                <span className="text-xs text-base-content/40">{stock.industry}</span>
              )}
            </div>
          </div>

          {/* Right: Watchlist button */}
          <button
            onClick={handleWatchlistToggle}
            className={`btn btn-sm flex-shrink-0 gap-1.5 ${
              inWatchlist
                ? 'btn-error btn-outline'
                : 'btn-secondary btn-outline'
            }`}
          >
            <svg className="w-4 h-4" fill={inWatchlist ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            {inWatchlist ? 'Remove' : 'Watchlist'}
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
          <div className="finance-stat">
            <div className="text-2xs text-base-content/40 uppercase tracking-wider">Price</div>
            <div className="text-lg font-bold font-mono tabular-nums mt-0.5">
              {formatCurrency(latestPrice)}
            </div>
            <div className={`flex items-center gap-1 mt-0.5 ${getChangeColor(changePercent)}`}>
              <svg className={`w-3 h-3 ${isPositive ? '' : 'rotate-180'}`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              <span className="text-xs font-medium font-mono tabular-nums">
                {formatChange(change)} ({formatChange(changePercent)}%)
              </span>
            </div>
          </div>

          <div className="finance-stat">
            <div className="text-2xs text-base-content/40 uppercase tracking-wider">Market Cap</div>
            <div className="text-lg font-bold mt-0.5">
              {formatLargeNumber(stock.market_cap)}
            </div>
          </div>

          <div className="finance-stat">
            <div className="text-2xs text-base-content/40 uppercase tracking-wider">Sector</div>
            <div className="text-sm font-semibold mt-0.5">{stock.sector || '-'}</div>
          </div>

          <div className="finance-stat">
            <div className="text-2xs text-base-content/40 uppercase tracking-wider">Industry</div>
            <div className="text-sm font-semibold mt-0.5">{stock.industry || '-'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
