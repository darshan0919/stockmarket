import { useWatchlist } from '../../lib/hooks/useWatchlist';
import LoadingSpinner from '../common/LoadingSpinner';
import { formatCurrency, formatChange, getChangeColor } from '../../lib/utils/formatters';
import { useRouter } from 'next/router';
import Link from 'next/link';

/**
 * Watchlist summary card showing top 5 watchlisted stocks
 * @component
 */
export default function WatchlistSummary() {
  const { watchlist, loading } = useWatchlist();
  const router = useRouter();

  if (loading) {
    return (
      <div className="finance-card p-5 h-full">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  const displayWatchlist = watchlist.slice(0, 5);

  return (
    <div className="finance-card h-full">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">Watchlist</h2>
          <Link
            href="/watchlist"
            className="text-xs font-medium text-secondary hover:text-secondary/80 transition-colors"
          >
            View All →
          </Link>
        </div>

        {displayWatchlist.length === 0 ? (
          <div className="text-center py-8">
            <svg className="mx-auto h-10 w-10 text-base-content/20 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <p className="text-sm text-base-content/50 mb-3">No stocks in watchlist</p>
            <Link href="/screener">
              <button className="btn btn-sm btn-secondary">Find Stocks</button>
            </Link>
          </div>
        ) : (
          <div className="space-y-1">
            {displayWatchlist.map((stock) => (
              <button
                key={stock.symbol}
                onClick={() => router.push(`/stock/${stock.symbol}`)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-base-200/60 transition-colors text-left"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-base-content">{stock.symbol}</div>
                  <div className="text-xs text-base-content/50 truncate">{stock.name}</div>
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <div className="text-sm font-semibold font-mono tabular-nums">
                    {formatCurrency(stock.price)}
                  </div>
                  <div className={`text-xs font-medium font-mono tabular-nums ${getChangeColor(stock.change_percent)}`}>
                    {formatChange(stock.change_percent, 2)}%
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
